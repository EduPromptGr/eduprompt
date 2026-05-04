"""
api/routers/class_profile.py

FastAPI router για "Η Τάξη μου" endpoints.
Split από το παλιό class_profile_backend.py (audit M-1).

Audit fixes εφαρμοσμένα:
- H-6: import get_current_user_id από dependencies
- H-5: auth + ownership στο /extract-insights
- M-11: /feedback επιστρέφει log_id
- M-10: /extract-insights παίρνει log_id explicit
"""

from functools import lru_cache
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import Client, create_client
import os

from api.dependencies import get_current_user_id
from api.services.class_profile_service import (
    extract_insights_from_observation,
)


router = APIRouter(prefix="/api/class", tags=["class-profile"])


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
        )
    return create_client(url, key)


# ── Request models ──────────────────────────────────────────────


class CreateProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    grade: str = Field(pattern=r"^(Α|Β|Γ|Δ|Ε|ΣΤ)$")
    school_year: Optional[str] = None  # default: current school year
    student_count: Optional[int] = Field(default=None, ge=1, le=50)
    strengths: List[str] = Field(default_factory=list, max_length=20)
    challenges: List[str] = Field(default_factory=list, max_length=20)
    engagement_triggers: List[str] = Field(
        default_factory=list, max_length=20
    )


class ActivityFeedbackRequest(BaseModel):
    class_profile_id: str
    prompt_id: Optional[str] = None
    subject: str
    grade: str
    objective: Optional[str] = None
    outcome: str = Field(pattern=r"^(excellent|good|difficult|poor)$")
    observation: Optional[str] = None


class ExtractInsightsRequest(BaseModel):
    class_profile_id: str
    log_id: str  # M-10: required
    observation: str = Field(min_length=10, max_length=2000)
    outcome: str = Field(pattern=r"^(excellent|good|difficult|poor)$")
    subject: str


# ── Helpers ─────────────────────────────────────────────────────


def _current_school_year() -> str:
    """π.χ. '2025-2026' (αλλάζει 1 Σεπτεμβρίου)."""
    from datetime import date

    today = date.today()
    start_year = today.year if today.month >= 9 else today.year - 1
    return f"{start_year}-{start_year + 1}"


def _verify_profile_ownership(
    profile_id: str, user_id: str
) -> None:
    """Raises 403/404 αν ο user δεν είναι owner του profile."""
    result = (
        _supabase()
        .table("class_profiles")
        .select("id")
        .eq("id", profile_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")


# ── Endpoints ───────────────────────────────────────────────────


@router.post("/profiles")
async def create_class_profile(
    req: CreateProfileRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Δημιουργεί νέο class profile."""
    school_year = req.school_year or _current_school_year()
    result = (
        _supabase()
        .table("class_profiles")
        .insert(
            {
                "user_id": user_id,
                "name": req.name,
                "grade": req.grade,
                "school_year": school_year,
                "student_count": req.student_count,
                "strengths": req.strengths,
                "challenges": req.challenges,
                "engagement_triggers": req.engagement_triggers,
            }
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create profile")

    return {"profile_id": result.data[0]["id"]}


@router.get("/profiles")
async def get_class_profiles(
    user_id: str = Depends(get_current_user_id),
):
    """Επιστρέφει όλα τα profiles του χρήστη."""
    result = (
        _supabase()
        .table("class_profiles")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("last_activity_at", desc=True)
        .execute()
    )
    return {"profiles": result.data or []}


@router.post("/feedback")
async def submit_activity_feedback(
    req: ActivityFeedbackRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Αποθηκεύει feedback δραστηριότητας.
    Επιστρέφει log_id ώστε το frontend να μπορεί να καλέσει
    το /extract-insights για το συγκεκριμένο log (M-11 fix).
    """
    _verify_profile_ownership(req.class_profile_id, user_id)

    result = (
        _supabase()
        .table("class_activity_logs")
        .insert(
            {
                "class_profile_id": req.class_profile_id,
                "user_id": user_id,
                "prompt_id": req.prompt_id,
                "subject": req.subject,
                "grade": req.grade,
                "objective": req.objective,
                "outcome": req.outcome,
                "observation": req.observation,
            }
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save feedback")

    return {"success": True, "log_id": result.data[0]["id"]}


@router.post("/extract-insights")
async def extract_insights(
    req: ExtractInsightsRequest,
    user_id: str = Depends(get_current_user_id),  # H-5 fix
):
    """
    Εξάγει AI insights από observation text.
    Προστατεύεται με auth + ownership check — αποτρέπει abuse
    που θα έκαιγε το OpenAI budget (audit H-5).
    """
    _verify_profile_ownership(req.class_profile_id, user_id)

    # Επαλήθευση ότι το log ανήκει στον χρήστη
    log_check = (
        _supabase()
        .table("class_activity_logs")
        .select("id")
        .eq("id", req.log_id)
        .eq("user_id", user_id)
        .eq("class_profile_id", req.class_profile_id)
        .execute()
    )
    if not log_check.data:
        raise HTTPException(status_code=404, detail="Log not found")

    insights = await extract_insights_from_observation(
        observation=req.observation,
        outcome=req.outcome,
        subject=req.subject,
        class_profile_id=req.class_profile_id,
        user_id=user_id,
        log_id=req.log_id,
    )
    return insights
