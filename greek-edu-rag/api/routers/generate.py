"""
api/routers/generate.py

POST /api/generate      — ο κύριος generator.
GET  /api/generate/quota — current usage counters (no 429).

Flow:
    1. Auth (get_current_user_id)
    2. rate_limiter.check_rate_limit — plan lookup + monthly/daily counts
    3. Delegate στο prompt_service.generate_scenario
    4. Επιστροφή JSON με prompt_id + scenario

Rate limits (από pricing cards):
    Free   : 3 / month,  1 / day
    Pro    : 150 / month, 12 / day
    School : 400 / month (pool όλου του σχολείου), 12 / day ανά user

Το πραγματικό rate-limiting logic ζει στο api/services/rate_limiter.py
ώστε να μπορεί να επαναχρησιμοποιηθεί και από άλλα endpoints.
"""

from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.dependencies import get_current_user_id
from api.services.prompt_service import (
    GenerateInput,
    GenerateOutput,
    VALID_ENVIRONMENTS,
    generate_scenario,
)
from api.services.rate_limiter import (
    check_rate_limit,
    get_reset_dates,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["generate"])


# ── Request schema ─────────────────────────────────────────────

class GenerateRequest(BaseModel):
    """Thin request wrapper — μεταφέρεται 1:1 στο service."""
    grade: str = Field(pattern=r"^(Α|Β|Γ|Δ|Ε|ΣΤ)$")
    subject: str = Field(min_length=1, max_length=80)
    unit: Optional[str] = Field(default=None, max_length=200)
    chapter: Optional[str] = Field(default=None, max_length=200)
    objective: str = Field(min_length=5, max_length=500)
    theory: Optional[str] = None
    strategy: Optional[str] = None
    environments: list[str] = Field(default_factory=list, max_length=6)
    class_profile_id: Optional[str] = None
    extra_instructions: Optional[str] = Field(default=None, max_length=400)
    # Tutoring Mode
    mode: Literal["classroom", "tutoring"] = "classroom"
    student_id: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────

@router.post("/generate", response_model=GenerateOutput)
async def generate(
    req: GenerateRequest,
    user_id: str = Depends(get_current_user_id),
) -> GenerateOutput:
    """
    Παράγει παιδαγωγικά τεκμηριωμένο σενάριο για ελληνικό ΑΠΣ.

    Errors:
        401 — Missing/invalid auth
        429 — Rate limit reached (monthly ή daily)
        422 — Validation error (invalid grade/subject/etc.)
        500 — User lookup / usage counter failure
        502 — LLM call failed
    """
    # Extra whitelist check για environments (Pydantic max_length δεν
    # ελέγχει membership).
    bad_envs = [e for e in req.environments if e not in VALID_ENVIRONMENTS]
    if bad_envs:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_environments", "values": bad_envs},
        )

    rate = check_rate_limit(user_id)  # ρίχνει 429 αν υπάρχει υπέρβαση
    logger.info(
        "generate user=%s plan=%s monthly=%d/%d daily=%d/%d",
        user_id, rate.plan,
        rate.monthly_used, rate.monthly_limit,
        rate.daily_used, rate.daily_limit,
    )

    service_input = GenerateInput(
        grade=req.grade,
        subject=req.subject,
        unit=req.unit,
        chapter=req.chapter,
        objective=req.objective,
        theory=req.theory,
        strategy=req.strategy,
        environments=req.environments,
        class_profile_id=req.class_profile_id,
        extra_instructions=req.extra_instructions,
        mode=req.mode,
        student_id=req.student_id,
    )

    try:
        return await generate_scenario(service_input, user_id=user_id)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except RuntimeError as e:
        logger.error("generate_scenario failed for user %s: %s", user_id, e)
        raise HTTPException(502, "Generator service failed") from e


@router.get("/generate/quota")
async def get_quota(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """
    Επιστρέφει τα τρέχοντα usage counters — το frontend το καλεί
    για να εμφανίσει "X / Y prompts χρησιμοποιήθηκαν".

    Δεν ρίχνει 429 εδώ — απλά επιστρέφει τα νούμερα.
    """
    rate = check_rate_limit(user_id, raise_on_exceeded=False)
    resets = get_reset_dates()

    return {
        "plan": rate.plan,
        "monthly": {
            "used": rate.monthly_used,
            "limit": rate.monthly_limit,
            "resets_on": resets["monthly_resets_on"],
        },
        "daily": {
            "used": rate.daily_used,
            "limit": rate.daily_limit,
            "resets_on": resets["daily_resets_on"],
        },
    }
