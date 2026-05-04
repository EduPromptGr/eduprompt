"""
api/routers/internal.py

Internal endpoints — χρησιμοποιούνται μόνο από άλλα services (π.χ. το
Next.js Stripe webhook handler), ΟΧΙ από το frontend των teachers.

Auth: header `x-internal-secret` με value από env `INTERNAL_API_SECRET`.
Το ίδιο secret το χρησιμοποιεί και το referral reward endpoint στο Next.js.

Endpoints:
    POST /api/internal/rate-limit/invalidate  → clear cached plan για user
    GET  /api/internal/health                 → έλεγχος ότι το secret δουλεύει
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from api.services.rate_limiter import invalidate_user_plan


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])


def _check_internal_secret(x_internal_secret: Optional[str]) -> None:
    expected = os.getenv("INTERNAL_API_SECRET")
    if not expected:
        # Fail-closed αν δεν είναι configured — δεν θέλουμε ανοιχτά
        # internal endpoints σε production.
        raise HTTPException(503, "Internal API not configured")
    if not x_internal_secret or x_internal_secret != expected:
        raise HTTPException(401, "Invalid internal secret")


class InvalidateRateLimitRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)


@router.post("/rate-limit/invalidate")
async def invalidate_rate_limit(
    req: InvalidateRateLimitRequest,
    x_internal_secret: Optional[str] = Header(default=None),
) -> dict:
    """
    Καθαρίζει το cached subscription plan για συγκεκριμένο user. Καλείται
    από το Next.js Stripe webhook μετά από plan change (upgrade/downgrade/
    cancel) ώστε το νέο limit να εφαρμοστεί άμεσα, όχι μετά από 60s TTL.
    """
    _check_internal_secret(x_internal_secret)
    invalidate_user_plan(req.user_id)
    logger.info("invalidated rate-limit cache for user=%s", req.user_id)
    return {"ok": True, "user_id": req.user_id}


@router.get("/health")
async def internal_health(
    x_internal_secret: Optional[str] = Header(default=None),
) -> dict:
    """Quick check ότι το INTERNAL_API_SECRET έχει ρυθμιστεί σωστά και στα δύο services."""
    _check_internal_secret(x_internal_secret)
    return {"status": "ok", "scope": "internal"}
