"""
api/routers/school.py

School plan management. Η δομή της βάσης:
  - school_members (school_owner_id, member_id) — ο "school owner" είναι
    ο χρήστης με subscription_status='school' που αγόρασε το plan.
  - school_invites (school_owner_id, email, token) — invite μέσω email token.

Endpoints:
    GET    /api/school/info                      — στοιχεία σχολείου + μέλη
    POST   /api/school/invite                    — δημιουργία invite
    POST   /api/school/join                      — εγγραφή με token
    DELETE /api/school/members/{member_id}       — αφαίρεση μέλους
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from supabase import Client, create_client

from api.dependencies import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/school", tags=["school"])

SCHOOL_MAX_MEMBERS = 30
INVITE_EXPIRES_HOURS = 72


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


def _require_school_owner(user_id: str) -> dict:
    """
    Επιβεβαιώνει ότι ο user έχει school subscription (άρα είναι owner).
    Επιστρέφει το user record.
    """
    result = (
        _supabase().table("users")
        .select("id, subscription_status")
        .eq("id", user_id)
        .maybeSingle()
        .execute()
    )
    if not result.data or result.data.get("subscription_status") != "school":
        raise HTTPException(403, "Χρειάζεσαι School πλάνο για αυτή τη λειτουργία")
    return result.data


# ── Schemas ─────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)

class JoinRequest(BaseModel):
    token: str = Field(min_length=8, max_length=128)


# ── Endpoints ───────────────────────────────────────────────────

@router.get("/info")
async def school_info(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Στοιχεία + μέλη για τον school owner ή για ένα μέλος."""
    # Είναι owner;
    owner_check = (
        _supabase().table("users")
        .select("id, subscription_status")
        .eq("id", user_id)
        .maybeSingle()
        .execute()
    )
    is_owner = (
        owner_check.data
        and owner_check.data.get("subscription_status") == "school"
    )

    if is_owner:
        # Φέρε μέλη που ο owner έχει
        members_result = (
            _supabase().table("school_members")
            .select("member_id, role, status, joined_at, users!member_id(email)")
            .eq("school_owner_id", user_id)
            .eq("status", "active")
            .execute()
        )
        members = members_result.data or []
        return {
            "is_owner": True,
            "owner_id": user_id,
            "members": members,
            "member_count": len(members),
            "max_members": SCHOOL_MAX_MEMBERS,
        }
    else:
        # Είναι μέλος;
        member_check = (
            _supabase().table("school_members")
            .select("school_owner_id, role, joined_at, users!school_owner_id(email)")
            .eq("member_id", user_id)
            .eq("status", "active")
            .maybeSingle()
            .execute()
        )
        if not member_check.data:
            raise HTTPException(404, "Δεν ανήκεις σε σχολείο")
        return {
            "is_owner": False,
            "owner_id": member_check.data.get("school_owner_id"),
            "owner_email": (member_check.data.get("users") or {}).get("email"),
            "role": member_check.data.get("role"),
            "joined_at": member_check.data.get("joined_at"),
        }


@router.post("/invite")
async def create_invite(
    req: InviteRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Δημιουργία invite για email (μόνο school owner)."""
    _require_school_owner(user_id)

    # Έλεγξε χωρητικότητα
    count_result = (
        _supabase().table("school_members")
        .select("member_id", count="exact")
        .eq("school_owner_id", user_id)
        .eq("status", "active")
        .execute()
    )
    if (count_result.count or 0) >= SCHOOL_MAX_MEMBERS:
        raise HTTPException(409, f"Έχεις φτάσει το μέγιστο των {SCHOOL_MAX_MEMBERS} μελών")

    token = secrets.token_urlsafe(32)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=INVITE_EXPIRES_HOURS)
    ).isoformat()

    try:
        _supabase().table("school_invites").insert({
            "school_owner_id": user_id,
            "email": req.email.lower().strip(),
            "token": token,
            "status": "pending",
            "expires_at": expires_at,
        }).execute()
    except Exception as e:
        logger.exception("create_invite failed: %s", e)
        raise HTTPException(500, "Αποτυχία δημιουργίας πρόσκλησης")

    site_url = os.getenv("NEXT_PUBLIC_SITE_URL", "https://eduprompt.gr")
    return {
        "token": token,
        "email": req.email,
        "invite_url": f"{site_url}/join-school?token={token}",
        "expires_at": expires_at,
    }


@router.post("/join")
async def join_school(
    req: JoinRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Εγγραφή σε σχολείο με invite token."""
    # Ήδη μέλος κάπου;
    existing = (
        _supabase().table("school_members")
        .select("school_owner_id")
        .eq("member_id", user_id)
        .eq("status", "active")
        .maybeSingle()
        .execute()
    )
    if existing.data:
        raise HTTPException(409, "Είσαι ήδη μέλος σχολείου")

    # Βρες invite
    invite = (
        _supabase().table("school_invites")
        .select("*")
        .eq("token", req.token)
        .eq("status", "pending")
        .maybeSingle()
        .execute()
    )
    if not invite.data:
        raise HTTPException(404, "Μη έγκυρο ή ληγμένο token πρόσκλησης")

    inv = invite.data
    expires_at = datetime.fromisoformat(inv["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(410, "Το token πρόσκλησης έχει λήξει")

    owner_id = inv["school_owner_id"]

    # Έλεγξε χωρητικότητα
    count_result = (
        _supabase().table("school_members")
        .select("member_id", count="exact")
        .eq("school_owner_id", owner_id)
        .eq("status", "active")
        .execute()
    )
    if (count_result.count or 0) >= SCHOOL_MAX_MEMBERS:
        raise HTTPException(409, f"Το σχολείο έχει φτάσει το όριο των {SCHOOL_MAX_MEMBERS} μελών")

    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        _supabase().table("school_members").insert({
            "school_owner_id": owner_id,
            "member_id": user_id,
            "role": "member",
            "status": "active",
            "joined_at": now_iso,
        }).execute()

        # Σήμανε το invite ως accepted
        _supabase().table("school_invites").update({
            "status": "accepted",
            "accepted_at": now_iso,
            "accepted_by": user_id,
        }).eq("id", inv["id"]).execute()

        # Ενημέρωσε subscription status
        _supabase().table("users").update({
            "subscription_status": "school"
        }).eq("id", user_id).execute()

    except Exception as e:
        logger.exception("join_school failed: %s", e)
        raise HTTPException(500, "Αποτυχία εγγραφής")

    return {"joined": True, "school_owner_id": owner_id}


@router.delete("/members/{member_id}", status_code=204)
async def remove_member(
    member_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Αφαίρεση μέλους (μόνο school owner)."""
    _require_school_owner(user_id)

    if member_id == user_id:
        raise HTTPException(400, "Δεν μπορείς να αφαιρέσεις τον εαυτό σου")

    try:
        check = (
            _supabase().table("school_members")
            .select("member_id")
            .eq("school_owner_id", user_id)
            .eq("member_id", member_id)
            .eq("status", "active")
            .maybeSingle()
            .execute()
        )
        if not check.data:
            raise HTTPException(404, "Μέλος δεν βρέθηκε")

        _supabase().table("school_members").update({
            "status": "removed"
        }).eq("school_owner_id", user_id).eq("member_id", member_id).execute()

        # Επαναφορά σε free plan
        _supabase().table("users").update({
            "subscription_status": "free"
        }).eq("id", member_id).execute()

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("remove_member failed: %s", e)
        raise HTTPException(500, "Αποτυχία αφαίρεσης μέλους")
