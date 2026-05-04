"""
api/routers/referral.py

Referral program. Η δομή της βάσης:
  - users.referral_code  — μοναδικό 8-ψήφιο code κάθε user (auto-generated)
  - referrals (referrer_id, referred_id, status) — κάθε επιτυχής referral

Flow:
  1. User A μοιράζεται το link: /signup?ref=<users.referral_code>
  2. Νέος user B εγγράφεται → η εγγραφή route καλεί /api/referral/validate με το code
  3. Μετά από πληρωμή → /api/referral/reward για να πιστωθεί το reward

Endpoints:
    GET  /api/referral/info      — referral code + stats
    POST /api/referral/validate  — επικύρωση code κατά εγγραφή (no auth)
    POST /api/referral/reward    — πίστωση reward (internal)
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from supabase import Client, create_client

from api.dependencies import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/referral", tags=["referral"])


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


class ValidateRequest(BaseModel):
    code: str  # users.referral_code (8-ψήφιο, uppercase)

class RewardRequest(BaseModel):
    referrer_user_id: str
    referred_user_id: str


@router.get("/info")
async def referral_info(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Επιστρέφει το referral code του user και τα στατιστικά του."""
    # Φέρε referral_code από users table
    user_result = (
        _supabase().table("users")
        .select("referral_code")
        .eq("id", user_id)
        .maybeSingle()
        .execute()
    )
    if not user_result.data:
        raise HTTPException(404, "Χρήστης δεν βρέθηκε")

    referral_code = user_result.data.get("referral_code", "")

    # Μέτρησε πόσους έχεις φέρει
    referred_result = (
        _supabase().table("referrals")
        .select("status", count="exact")
        .eq("referrer_id", user_id)
        .execute()
    )
    rewarded_result = (
        _supabase().table("referrals")
        .select("reward_value", count="exact")
        .eq("referrer_id", user_id)
        .eq("status", "rewarded")
        .execute()
    )

    site_url = os.getenv("NEXT_PUBLIC_SITE_URL", "https://eduprompt.gr")
    return {
        "referral_code": referral_code,
        "referral_url": f"{site_url}/signup?ref={referral_code}",
        "total_referred": referred_result.count or 0,
        "total_rewarded": rewarded_result.count or 0,
    }


@router.post("/validate")
async def validate_referral(req: ValidateRequest) -> dict:
    """Επικύρωση referral code κατά εγγραφή. Δεν απαιτεί auth."""
    result = (
        _supabase().table("users")
        .select("id, referral_code")
        .eq("referral_code", req.code.upper().strip())
        .maybeSingle()
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Μη έγκυρο referral code")
    return {"valid": True, "referrer_id": result.data["id"]}


@router.post("/reward")
async def reward_referral(
    req: RewardRequest,
    x_internal_secret: str = Header(alias="x-internal-secret"),
) -> dict:
    """
    Πίστωση reward στον referrer — καλείται internal μετά από πληρωμή.
    Απαιτεί INTERNAL_API_SECRET header.
    """
    expected = os.getenv("INTERNAL_API_SECRET", "")
    if not expected or x_internal_secret != expected:
        raise HTTPException(403, "Μη εξουσιοδοτημένο internal call")

    # Ελέγξε μη duplicate
    existing = (
        _supabase().table("referrals")
        .select("id")
        .eq("referrer_id", req.referrer_user_id)
        .eq("referred_id", req.referred_user_id)
        .maybeSingle()
        .execute()
    )
    if existing.data:
        return {"already_rewarded": True}

    try:
        _supabase().table("referrals").insert({
            "referrer_id": req.referrer_user_id,
            "referred_id": req.referred_user_id,
            "status": "rewarded",
            "reward_type": "free_month",
            "reward_value": 14.99,
        }).execute()
        return {"rewarded": True}
    except Exception as e:
        logger.exception("reward_referral failed: %s", e)
        raise HTTPException(500, "Αποτυχία επιβράβευσης")
