"""
api/routers/prompts.py

CRUD + actions για αποθηκευμένα σενάρια (prompts table).

Endpoints:
    GET  /api/prompts            — λίστα σεναρίων του user
    GET  /api/prompts/{id}       — ένα σενάριο
    POST /api/prompts/{id}/save  — toggle saved flag
    POST /api/prompts/{id}/rate  — αξιολόγηση (1-5)
    POST /api/prompts/{id}/report-error — αναφορά λάθους
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from supabase import Client, create_client

from api.dependencies import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


# ── Schemas ─────────────────────────────────────────────────────

class RateRequest(BaseModel):
    rating: int = Field(ge=1, le=5)

class ReportErrorRequest(BaseModel):
    description: str = Field(min_length=10, max_length=1000)
    category: Optional[str] = Field(default=None, max_length=80)


# ── Endpoints ───────────────────────────────────────────────────

@router.get("")
async def list_prompts(
    saved_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Λίστα σεναρίων του χρήστη, νεότερα πρώτα."""
    try:
        q = (
            _supabase()
            .table("prompts")
            .select("id, title, grade, subject, objective, theory, strategy, saved, created_at, data_driven")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
        )
        if saved_only:
            q = q.eq("saved", True)
        result = q.execute()
        return {"prompts": result.data or [], "offset": offset, "limit": limit}
    except Exception as e:
        logger.exception("list_prompts failed for user %s: %s", user_id, e)
        raise HTTPException(500, "Αποτυχία φόρτωσης σεναρίων")


@router.get("/{prompt_id}")
async def get_prompt(
    prompt_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Επιστρέφει ένα σενάριο. Επιτρέπεται μόνο στον owner."""
    try:
        result = (
            _supabase()
            .table("prompts")
            .select("*")
            .eq("id", prompt_id)
            .eq("user_id", user_id)
            .maybeSingle()
            .execute()
        )
    except Exception as e:
        logger.exception("get_prompt %s failed: %s", prompt_id, e)
        raise HTTPException(500, "Αποτυχία φόρτωσης σεναρίου")

    if not result.data:
        raise HTTPException(404, "Σενάριο δεν βρέθηκε")

    return result.data


@router.post("/{prompt_id}/save")
async def toggle_save(
    prompt_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Toggle αποθήκευσης σεναρίου. Επιστρέφει νέα τιμή saved."""
    # Φέρε τρέχουσα τιμή
    try:
        result = (
            _supabase()
            .table("prompts")
            .select("saved")
            .eq("id", prompt_id)
            .eq("user_id", user_id)
            .maybeSingle()
            .execute()
        )
    except Exception as e:
        logger.exception("toggle_save fetch failed: %s", e)
        raise HTTPException(500, "Σφάλμα βάσης δεδομένων")

    if not result.data:
        raise HTTPException(404, "Σενάριο δεν βρέθηκε")

    new_saved = not result.data.get("saved", False)
    try:
        _supabase().table("prompts").update({"saved": new_saved}).eq("id", prompt_id).eq("user_id", user_id).execute()
    except Exception as e:
        logger.exception("toggle_save update failed: %s", e)
        raise HTTPException(500, "Αποτυχία ενημέρωσης")

    return {"saved": new_saved}


@router.post("/{prompt_id}/rate")
async def rate_prompt(
    prompt_id: str,
    req: RateRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Αξιολόγηση σεναρίου 1-5 αστέρια."""
    try:
        # Βεβαιώσου ότι το prompt ανήκει στον user
        check = (
            _supabase()
            .table("prompts")
            .select("id")
            .eq("id", prompt_id)
            .eq("user_id", user_id)
            .maybeSingle()
            .execute()
        )
        if not check.data:
            raise HTTPException(404, "Σενάριο δεν βρέθηκε")

        _supabase().table("prompts").update({"rating": req.rating}).eq("id", prompt_id).execute()
        return {"rating": req.rating}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("rate_prompt failed: %s", e)
        raise HTTPException(500, "Αποτυχία αξιολόγησης")


@router.post("/{prompt_id}/report-error")
async def report_error(
    prompt_id: str,
    req: ReportErrorRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Αναφορά λάθους/προβλήματος σε σενάριο."""
    try:
        _supabase().table("error_reports").insert({
            "prompt_id": prompt_id,
            "user_id": user_id,
            "description": req.description,
            "category": req.category,
            "status": "open",
        }).execute()
        return {"reported": True}
    except Exception as e:
        logger.exception("report_error failed: %s", e)
        raise HTTPException(500, "Αποτυχία υποβολής αναφοράς")
