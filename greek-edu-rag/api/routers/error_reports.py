"""
api/routers/error_reports.py

Admin endpoints για διαχείριση αναφορών λαθών στα σενάρια.

Endpoints:
    GET    /api/admin/error-reports            — λίστα (admin only)
    PATCH  /api/admin/error-reports/{id}       — ενημέρωση status
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from supabase import Client, create_client

from api.dependencies import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


def _require_admin(user_id: str) -> None:
    """Ελέγχει αν ο user είναι admin. Raises 403 αν δεν είναι."""
    result = (
        _supabase().table("users")
        .select("is_admin")
        .eq("id", user_id)
        .maybeSingle()
        .execute()
    )
    if not result.data or not result.data.get("is_admin"):
        raise HTTPException(403, "Δεν έχεις δικαιώματα διαχειριστή")


class UpdateReportRequest(BaseModel):
    status: str  # open | reviewing | resolved | dismissed
    admin_note: Optional[str] = None


@router.get("/error-reports")
async def list_error_reports(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Λίστα αναφορών λαθών — μόνο για admins."""
    _require_admin(user_id)

    try:
        q = (
            _supabase()
            .table("error_reports")
            .select("*, prompts(title, grade, subject), users(email)")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
        )
        if status:
            q = q.eq("status", status)
        result = q.execute()
        return {"reports": result.data or [], "offset": offset, "limit": limit}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("list_error_reports failed: %s", e)
        raise HTTPException(500, "Αποτυχία φόρτωσης αναφορών")


@router.patch("/error-reports/{report_id}")
async def update_error_report(
    report_id: str,
    req: UpdateReportRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Ενημέρωση status αναφοράς."""
    _require_admin(user_id)

    valid_statuses = {"open", "reviewing", "resolved", "dismissed"}
    if req.status not in valid_statuses:
        raise HTTPException(400, f"Μη έγκυρο status. Επιτρεπτά: {valid_statuses}")

    try:
        updates = {"status": req.status, "resolved_by": user_id}
        if req.admin_note:
            updates["admin_note"] = req.admin_note

        result = (
            _supabase().table("error_reports")
            .update(updates)
            .eq("id", report_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(404, "Αναφορά δεν βρέθηκε")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("update_error_report failed: %s", e)
        raise HTTPException(500, "Αποτυχία ενημέρωσης")
