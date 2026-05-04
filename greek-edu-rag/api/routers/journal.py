"""
api/routers/journal.py

Παιδαγωγικό ημερολόγιο — οι εκπαιδευτικοί καταγράφουν παρατηρήσεις,
αντανακλάσεις και αξιολογήσεις μετά από κάθε μάθημα.

Endpoints:
    GET    /api/journal          — λίστα εγγραφών
    POST   /api/journal          — νέα εγγραφή
    GET    /api/journal/{id}     — μία εγγραφή
    PATCH  /api/journal/{id}     — επεξεργασία
    DELETE /api/journal/{id}     — διαγραφή (soft delete)
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
router = APIRouter(prefix="/api/journal", tags=["journal"])


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


# ── Schemas ─────────────────────────────────────────────────────

class JournalEntryCreate(BaseModel):
    prompt_id: Optional[str] = None
    title: Optional[str] = Field(default=None, max_length=200)
    reflection_text: str = Field(min_length=5, max_length=10000)
    overall_rating: Optional[int] = Field(default=None, ge=1, le=5)
    students_engaged_pct: Optional[int] = Field(default=None, ge=0, le=100)
    tags: Optional[list[str]] = None
    applied_on: Optional[str] = None  # DATE as ISO string

class JournalEntryUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    reflection_text: Optional[str] = Field(default=None, min_length=5, max_length=10000)
    overall_rating: Optional[int] = Field(default=None, ge=1, le=5)
    students_engaged_pct: Optional[int] = Field(default=None, ge=0, le=100)
    tags: Optional[list[str]] = None
    applied_on: Optional[str] = None


# ── Endpoints ───────────────────────────────────────────────────

@router.get("")
async def list_entries(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Λίστα εγγραφών ημερολογίου, νεότερες πρώτα."""
    try:
        result = (
            _supabase()
            .table("journal")
            .select("id, title, reflection_text, overall_rating, applied_on, created_at, prompt_id")
            .eq("user_id", user_id)
            .eq("deleted", False)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return {"entries": result.data or [], "offset": offset, "limit": limit}
    except Exception as e:
        logger.exception("list_journal failed for user %s: %s", user_id, e)
        raise HTTPException(500, "Αποτυχία φόρτωσης ημερολογίου")


@router.post("", status_code=201)
async def create_entry(
    req: JournalEntryCreate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Νέα εγγραφή στο παιδαγωγικό ημερολόγιο."""
    try:
        result = (
            _supabase()
            .table("journal")
            .insert({
                "user_id": user_id,
                "prompt_id": req.prompt_id,
                "title": req.title,
                "reflection_text": req.reflection_text,
                "overall_rating": req.overall_rating,
                "students_engaged_pct": req.students_engaged_pct,
                "tags": req.tags,
                "applied_on": req.applied_on,
            })
            .execute()
        )
        if not result.data:
            raise HTTPException(500, "Αποτυχία δημιουργίας εγγραφής")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("create_journal_entry failed: %s", e)
        raise HTTPException(500, "Αποτυχία αποθήκευσης")


@router.get("/{entry_id}")
async def get_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    try:
        result = (
            _supabase()
            .table("journal")
            .select("*")
            .eq("id", entry_id)
            .eq("user_id", user_id)
            .maybeSingle()
            .execute()
        )
    except Exception as e:
        logger.exception("get_journal_entry %s failed: %s", entry_id, e)
        raise HTTPException(500, "Αποτυχία φόρτωσης εγγραφής")

    if not result.data:
        raise HTTPException(404, "Εγγραφή δεν βρέθηκε")
    return result.data


@router.patch("/{entry_id}")
async def update_entry(
    entry_id: str,
    req: JournalEntryUpdate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "Δεν δόθηκαν πεδία για ενημέρωση")

    try:
        check = (
            _supabase().table("journal")
            .select("id").eq("id", entry_id).eq("user_id", user_id).maybeSingle().execute()
        )
        if not check.data:
            raise HTTPException(404, "Εγγραφή δεν βρέθηκε")

        result = (
            _supabase().table("journal")
            .update(updates).eq("id", entry_id).execute()
        )
        return result.data[0] if result.data else {}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("update_journal_entry failed: %s", e)
        raise HTTPException(500, "Αποτυχία ενημέρωσης")


@router.delete("/{entry_id}", status_code=204)
async def delete_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Διαγραφή εγγραφής."""
    try:
        check = (
            _supabase().table("journal")
            .select("id").eq("id", entry_id).eq("user_id", user_id).maybeSingle().execute()
        )
        if not check.data:
            raise HTTPException(404, "Εγγραφή δεν βρέθηκε")

        _supabase().table("journal").delete().eq("id", entry_id).execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("delete_journal_entry failed: %s", e)
        raise HTTPException(500, "Αποτυχία διαγραφής")
