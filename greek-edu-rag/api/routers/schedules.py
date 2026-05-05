"""
api/routers/schedules.py

POST   /api/schedules           — δημιουργία / αντικατάσταση schedule
GET    /api/schedules           — λίστα schedules του user
GET    /api/schedules/{id}      — ένα schedule
PATCH  /api/schedules/{id}      — partial update
DELETE /api/schedules/{id}      — διαγραφή

Ωρολόγιο Πρόγραμμα schema (JSONB):
{
  "monday":    [{"period":1,"subject":"Μαθηματικά","start":"08:00","duration":45},...],
  "tuesday":   [...],
  "wednesday": [...],
  "thursday":  [...],
  "friday":    [...]
}

Χρησιμοποιείται από το frontend για:
  • Αυτόματη πρόταση διάρκειας μαθήματος στη φόρμα generate
  • Φιλτράρισμα διαθέσιμων μαθημάτων στο CurriculumDrawer
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from supabase import Client, create_client

from api.dependencies import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/schedules", tags=["schedules"])

_VALID_GRADES = ('Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ')
_VALID_DAYS   = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE credentials required")
    return create_client(url, key)


# ── Request / Response models ───────────────────────────────────

class PeriodSlot(BaseModel):
    period:   int   = Field(ge=1, le=12)
    subject:  str   = Field(min_length=1, max_length=80)
    start:    str   = Field(pattern=r"^\d{2}:\d{2}$")  # "HH:MM"
    duration: int   = Field(ge=15, le=180)               # λεπτά


class ScheduleCreate(BaseModel):
    grade:             str             = Field(pattern=r"^(Α|Β|Γ|Δ|Ε|ΣΤ)$")
    school_year:       str             = Field(default="2025-2026",
                                               pattern=r"^\d{4}-\d{4}$")
    label:             Optional[str]   = Field(default=None, max_length=100)
    schedule:          dict[str, list[PeriodSlot]] = Field(default_factory=dict)
    original_filename: Optional[str]   = None
    upload_method:     str             = Field(default="manual",
                                               pattern=r"^(manual|csv|image_ocr)$")

    @field_validator("schedule")
    @classmethod
    def validate_days(cls, v: dict) -> dict:
        bad = [k for k in v if k not in _VALID_DAYS]
        if bad:
            raise ValueError(f"Invalid days: {bad}. Allowed: {_VALID_DAYS}")
        return v


class SchedulePatch(BaseModel):
    label:         Optional[str]   = Field(default=None, max_length=100)
    schedule:      Optional[dict[str, list[PeriodSlot]]] = None
    school_year:   Optional[str]   = Field(default=None,
                                           pattern=r"^\d{4}-\d{4}$")


class ScheduleOut(BaseModel):
    id:                str
    user_id:           str
    grade:             str
    school_year:       str
    label:             Optional[str]
    schedule:          dict[str, Any]
    original_filename: Optional[str]
    upload_method:     str
    created_at:        str
    updated_at:        str


# ── Helpers ─────────────────────────────────────────────────────

def _row_to_out(r: dict) -> ScheduleOut:
    return ScheduleOut(
        id=r["id"],
        user_id=r["user_id"],
        grade=r["grade"],
        school_year=r["school_year"],
        label=r.get("label"),
        schedule=r.get("schedule") or {},
        original_filename=r.get("original_filename"),
        upload_method=r.get("upload_method", "manual"),
        created_at=str(r.get("created_at", "")),
        updated_at=str(r.get("updated_at", "")),
    )


# ── Endpoints ───────────────────────────────────────────────────

@router.post("", response_model=ScheduleOut, status_code=201)
async def create_schedule(
    body: ScheduleCreate,
    user_id: str = Depends(get_current_user_id),
) -> ScheduleOut:
    """
    Δημιουργεί ή αντικαθιστά το schedule (UPSERT βάσει user+grade+year).
    """
    payload = {
        "user_id":           user_id,
        "grade":             body.grade,
        "school_year":       body.school_year,
        "label":             body.label,
        # Convert Pydantic models to plain dicts for JSONB
        "schedule":          {
            day: [slot.model_dump() for slot in slots]
            for day, slots in body.schedule.items()
        },
        "original_filename": body.original_filename,
        "upload_method":     body.upload_method,
    }

    try:
        result = (
            _supabase()
            .table("school_schedules")
            .upsert(payload, on_conflict="user_id,grade,school_year")
            .execute()
        )
    except Exception as e:
        logger.exception("schedule upsert failed: %s", e)
        raise HTTPException(500, "DB error")

    if not result.data:
        raise HTTPException(500, "Upsert returned no data")

    return _row_to_out(result.data[0])


@router.get("", response_model=list[ScheduleOut])
async def list_schedules(
    user_id: str = Depends(get_current_user_id),
) -> list[ScheduleOut]:
    """Επιστρέφει όλα τα schedules του authenticated user."""
    try:
        result = (
            _supabase()
            .table("school_schedules")
            .select("*")
            .eq("user_id", user_id)
            .order("school_year", desc=True)
            .execute()
        )
    except Exception as e:
        logger.exception("schedule list failed: %s", e)
        raise HTTPException(500, "DB error")

    return [_row_to_out(r) for r in (result.data or [])]


@router.get("/{schedule_id}", response_model=ScheduleOut)
async def get_schedule(
    schedule_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ScheduleOut:
    try:
        result = (
            _supabase()
            .table("school_schedules")
            .select("*")
            .eq("id", schedule_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.exception("schedule get failed: %s", e)
        raise HTTPException(500, "DB error")

    if not result.data:
        raise HTTPException(404, "Schedule not found")

    return _row_to_out(result.data[0])


@router.patch("/{schedule_id}", response_model=ScheduleOut)
async def patch_schedule(
    schedule_id: str,
    body: SchedulePatch,
    user_id: str = Depends(get_current_user_id),
) -> ScheduleOut:
    """Partial update — μόνο τα fields που στέλνεις αλλάζουν."""
    updates: dict[str, Any] = {}
    if body.label is not None:
        updates["label"] = body.label
    if body.school_year is not None:
        updates["school_year"] = body.school_year
    if body.schedule is not None:
        updates["schedule"] = {
            day: [slot.model_dump() for slot in slots]
            for day, slots in body.schedule.items()
        }

    if not updates:
        raise HTTPException(422, "No fields to update")

    try:
        result = (
            _supabase()
            .table("school_schedules")
            .update(updates)
            .eq("id", schedule_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        logger.exception("schedule patch failed: %s", e)
        raise HTTPException(500, "DB error")

    if not result.data:
        raise HTTPException(404, "Schedule not found or not owned by user")

    return _row_to_out(result.data[0])


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Διαγράφει ένα schedule."""
    try:
        result = (
            _supabase()
            .table("school_schedules")
            .delete()
            .eq("id", schedule_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        logger.exception("schedule delete failed: %s", e)
        raise HTTPException(500, "DB error")

    if not (result.data or []):
        raise HTTPException(404, "Schedule not found or not owned by user")
