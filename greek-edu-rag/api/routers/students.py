"""
api/routers/students.py

CRUD για student profiles (Private Tutoring Mode).

Endpoints:
  POST   /api/students              → δημιουργία
  GET    /api/students              → λίστα (μόνο active by default)
  GET    /api/students/{id}         → ένας μαθητής
  PATCH  /api/students/{id}         → μερική ενημέρωση
  DELETE /api/students/{id}         → soft-delete (active=false)
"""

from __future__ import annotations

import os
from datetime import datetime
from functools import lru_cache
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from supabase import Client, create_client

from api.dependencies import get_current_user_id

router = APIRouter(prefix="/api/students", tags=["students"])


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE credentials required")
    return create_client(url, key)

# ── Pydantic models ───────────────────────────────────────────────────────────

LearningStyle = Literal["visual", "auditory", "kinesthetic", "mixed"]
VALID_GRADES = {"Α", "Β", "Γ", "Δ", "Ε", "ΣΤ"}


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    grade: str
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    learning_style: LearningStyle = "mixed"
    notes: Optional[str] = Field(None, max_length=2000)
    goals: Optional[str] = Field(None, max_length=1000)

    @field_validator("grade")
    @classmethod
    def validate_grade(cls, v: str) -> str:
        if v not in VALID_GRADES:
            raise ValueError(f"Μη έγκυρη τάξη. Επιλέξτε: {', '.join(sorted(VALID_GRADES))}")
        return v


class StudentPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    grade: Optional[str] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    learning_style: Optional[LearningStyle] = None
    notes: Optional[str] = Field(None, max_length=2000)
    goals: Optional[str] = Field(None, max_length=1000)
    active: Optional[bool] = None

    @field_validator("grade")
    @classmethod
    def validate_grade(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_GRADES:
            raise ValueError(f"Μη έγκυρη τάξη. Επιλέξτε: {', '.join(sorted(VALID_GRADES))}")
        return v


class StudentOut(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    grade: str
    strengths: Optional[str]
    weaknesses: Optional[str]
    learning_style: str
    notes: Optional[str]
    goals: Optional[str]
    active: bool
    created_at: datetime
    updated_at: datetime


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=StudentOut, status_code=201)
async def create_student(
    body: StudentCreate,
    user_id: str = Depends(get_current_user_id),
):
    db = _supabase()
    row = {
        "user_id": user_id,
        **body.model_dump(),
    }
    result = db.table("students").insert(row).execute()
    if not result.data:
        raise HTTPException(500, "Αδυναμία δημιουργίας μαθητή")
    return result.data[0]


@router.get("", response_model=list[StudentOut])
async def list_students(
    include_inactive: bool = Query(False, alias="includeInactive"),
    grade: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    db = _supabase()
    q = db.table("students").select("*").eq("user_id", user_id)
    if not include_inactive:
        q = q.eq("active", True)
    if grade:
        if grade not in VALID_GRADES:
            raise HTTPException(400, f"Μη έγκυρη τάξη: {grade}")
        q = q.eq("grade", grade)
    q = q.order("created_at", desc=True)
    result = q.execute()
    return result.data or []


@router.get("/{student_id}", response_model=StudentOut)
async def get_student(
    student_id: UUID,
    user_id: str = Depends(get_current_user_id),
):
    db = _supabase()
    result = (
        db.table("students")
        .select("*")
        .eq("id", str(student_id))
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Ο μαθητής δεν βρέθηκε")
    return result.data


@router.patch("/{student_id}", response_model=StudentOut)
async def update_student(
    student_id: UUID,
    body: StudentPatch,
    user_id: str = Depends(get_current_user_id),
):
    db = _supabase()
    # Verify ownership
    existing = (
        db.table("students")
        .select("id")
        .eq("id", str(student_id))
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(404, "Ο μαθητής δεν βρέθηκε")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Δεν δόθηκαν δεδομένα για ενημέρωση")

    result = (
        db.table("students")
        .update(updates)
        .eq("id", str(student_id))
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(500, "Αδυναμία ενημέρωσης")
    return result.data[0]


@router.delete("/{student_id}", status_code=204)
async def deactivate_student(
    student_id: UUID,
    user_id: str = Depends(get_current_user_id),
):
    """Soft-delete: θέτει active=false αντί να διαγράψει."""
    db = _supabase()
    existing = (
        db.table("students")
        .select("id")
        .eq("id", str(student_id))
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(404, "Ο μαθητής δεν βρέθηκε")

    db.table("students").update({"active": False}).eq("id", str(student_id)).execute()
