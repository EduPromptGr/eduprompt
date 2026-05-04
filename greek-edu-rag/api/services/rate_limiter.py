"""
api/services/rate_limiter.py

Plan-based rate limiting για το EduPrompt API.

Χρησιμοποιείται κυρίως από τον generate router, αλλά γραμμένο ώστε
να είναι reusable για μελλοντικά endpoints (π.χ. bulk generation,
advanced refinement, κ.λπ.).

Plans & limits (από pricing cards):
    free   : 3 / month,  1 / day
    pro    : 150 / month, 12 / day
    school : 400 / month (pool όλου του σχολείου), 12 / day ανά user

Semantics:
    - Ο monthly counter για 'school' μετρά prompts με user_id = school_owner_id
      (pool — όλοι οι καθηγητές του σχολείου μοιράζονται το όριο).
    - Ο daily counter μετρά πάντα per-user.
    - Τα counters μετρώνται από την `prompts` table via SELECT count=exact.

Audit fixes εφαρμοσμένα:
    - M-1  : Lazy Supabase client με @lru_cache
    - M-4  : try/except γύρω από DB calls + proper logging
    - M-19 : Plan lookup cached για 60s (short TTL για να πιάνει
             upgrades χωρίς να χτυπά τη DB σε κάθε request)
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from functools import lru_cache
from threading import Lock
from typing import Optional

from fastapi import HTTPException
from supabase import Client, create_client


logger = logging.getLogger(__name__)


# ── Plan configuration ─────────────────────────────────────────

PLAN_LIMITS: dict[str, dict[str, int]] = {
    "free":   {"month": 3,   "day": 1},
    "pro":    {"month": 150, "day": 12},
    "school": {"month": 400, "day": 12},  # month = pool, day = per-user
}

# Default fallback για άγνωστο plan.
_DEFAULT_PLAN = "free"


# ── Lazy Supabase client (audit M-1) ────────────────────────────

@lru_cache(maxsize=1)
def _supabase() -> Client:
    """Lazy Supabase client με service role — singleton μέσω lru_cache."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
        )
    return create_client(url, key)


# ── Short-TTL cache για user plan (audit M-19) ─────────────────
#
# Σκοπός: να μην χτυπάμε DB σε κάθε request για plan lookup, αλλά να
# πιάνουμε upgrades/downgrades μέσα σε λογικό χρόνο.
#
# TTL = 60s : σε upgrade μέσω Stripe webhook, ο χρήστης θα δει νέο
# limit το πολύ σε 1 λεπτό. Για invalidate πριν το TTL, κάλεσε
# `invalidate_user_plan(user_id)`.

_PLAN_CACHE_TTL_SEC = 60


@dataclass
class _PlanCacheEntry:
    plan: str
    school_owner_id: Optional[str]
    cached_at: float = field(default_factory=time.time)


# Ένα απλό dict με lock αρκεί — ελαφρύ contention, όχι hot path.
_plan_cache: dict[str, _PlanCacheEntry] = {}
_plan_cache_lock = Lock()


def _fetch_user_plan(user_id: str) -> _PlanCacheEntry:
    """Single DB hit — subscription_status + school_owner_id."""
    sb = _supabase()
    try:
        row = (
            sb.table("users")
            .select("subscription_status, school_owner_id")
            .eq("id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.exception("user plan lookup failed for %s: %s", user_id, e)
        raise HTTPException(500, "User lookup failed") from e

    data = row.data or {}
    plan = (data.get("subscription_status") or _DEFAULT_PLAN).lower()
    if plan not in PLAN_LIMITS:
        logger.warning("Unknown plan %r for user %s — falling back to free", plan, user_id)
        plan = _DEFAULT_PLAN
    return _PlanCacheEntry(
        plan=plan,
        school_owner_id=data.get("school_owner_id"),
    )


def _get_cached_plan(user_id: str) -> _PlanCacheEntry:
    """TTL-cached plan lookup. Thread-safe."""
    now = time.time()
    with _plan_cache_lock:
        entry = _plan_cache.get(user_id)
        if entry and (now - entry.cached_at) < _PLAN_CACHE_TTL_SEC:
            return entry

    # Miss — fetch outside the lock για να μην κρατάμε το lock όση
    # ώρα τρέχει το DB call.
    fresh = _fetch_user_plan(user_id)
    with _plan_cache_lock:
        _plan_cache[user_id] = fresh
        # Απλό cleanup αν γεμίσει — crude αλλά αρκετό για την κλίμακα.
        if len(_plan_cache) > 5000:
            _cleanup_cache()
    return fresh


def _cleanup_cache() -> None:
    """Αφαιρεί stale entries. Πρέπει να καλείται μέσα στο lock."""
    now = time.time()
    stale = [
        uid for uid, entry in _plan_cache.items()
        if (now - entry.cached_at) >= _PLAN_CACHE_TTL_SEC
    ]
    for uid in stale:
        _plan_cache.pop(uid, None)


def invalidate_user_plan(user_id: str) -> None:
    """
    Καθαρίζει το cached plan για τον συγκεκριμένο user.

    Κάλεσέ το από τον Stripe webhook όταν αλλάζει το subscription_status
    ώστε ο χρήστης να δει το νέο όριο άμεσα.
    """
    with _plan_cache_lock:
        _plan_cache.pop(user_id, None)


# ── Usage counters ─────────────────────────────────────────────

def _count_prompts(
    user_id: str,
    since_iso: str,
) -> int:
    """Counts prompts for a user since `since_iso` (ISO date string)."""
    sb = _supabase()
    try:
        resp = (
            sb.table("prompts")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", since_iso)
            .execute()
        )
    except Exception as e:
        logger.exception("prompt count failed for %s since %s: %s", user_id, since_iso, e)
        raise HTTPException(500, "Usage counter failed") from e
    return resp.count or 0


# ── Public API ─────────────────────────────────────────────────

@dataclass
class RateCheckResult:
    """Αποτέλεσμα του check_rate_limit — όλα όσα χρειάζεται ο router για logging/response."""
    plan: str
    monthly_used: int
    monthly_limit: int
    daily_used: int
    daily_limit: int
    school_owner_id: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "plan": self.plan,
            "monthly_used": self.monthly_used,
            "monthly_limit": self.monthly_limit,
            "daily_used": self.daily_used,
            "daily_limit": self.daily_limit,
        }


def check_rate_limit(user_id: str, *, raise_on_exceeded: bool = True) -> RateCheckResult:
    """
    Κάνει plan lookup + counts και επιστρέφει RateCheckResult.

    Args:
        user_id: Supabase user id.
        raise_on_exceeded: Αν True (default), ρίχνει HTTP 429 όταν
            ξεπεραστεί κάποιο όριο. Βάλ' το False από το quota endpoint
            που θέλει μόνο να εμφανίσει νούμερα χωρίς να block-άρει.

    Returns:
        RateCheckResult με τα current counters.

    Raises:
        HTTPException 429: Αν `raise_on_exceeded=True` και έχει ξεπεραστεί
            monthly ή daily όριο. Το detail περιέχει:
                { "error", "plan", "used", "limit", "message" }
        HTTPException 500: Αν αποτύχει η DB (user lookup ή counters).
    """
    plan_entry = _get_cached_plan(user_id)
    plan = plan_entry.plan
    limits = PLAN_LIMITS[plan]

    today = date.today()
    month_start = today.replace(day=1).isoformat()
    day_start = today.isoformat()

    # School plan → monthly counter έρχεται από τον owner (pool),
    # daily πάντα per-user.
    monthly_scope_user = (
        plan_entry.school_owner_id or user_id
        if plan == "school"
        else user_id
    )

    monthly_used = _count_prompts(monthly_scope_user, month_start)
    daily_used = _count_prompts(user_id, day_start)

    result = RateCheckResult(
        plan=plan,
        monthly_used=monthly_used,
        monthly_limit=limits["month"],
        daily_used=daily_used,
        daily_limit=limits["day"],
        school_owner_id=plan_entry.school_owner_id,
    )

    if not raise_on_exceeded:
        return result

    if monthly_used >= limits["month"]:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "monthly_limit_reached",
                "plan": plan,
                "used": monthly_used,
                "limit": limits["month"],
                "message": (
                    "Εξαντλήθηκε το μηνιαίο όριο. "
                    + ("Αναβάθμισε σε Pro." if plan == "free" else "Δοκίμασε τον επόμενο μήνα.")
                ),
            },
        )

    if daily_used >= limits["day"]:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "daily_limit_reached",
                "plan": plan,
                "used": daily_used,
                "limit": limits["day"],
                "message": "Εξαντλήθηκε το ημερήσιο όριο. Δοκίμασε αύριο.",
            },
        )

    return result


def get_reset_dates(today: Optional[date] = None) -> dict[str, str]:
    """
    Επιστρέφει τις ISO ημερομηνίες reset για monthly/daily counters.
    Χρήσιμο για το /api/generate/quota response.
    """
    today = today or date.today()
    first_of_next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    return {
        "monthly_resets_on": first_of_next_month.isoformat(),
        "daily_resets_on": (today + timedelta(days=1)).isoformat(),
    }
