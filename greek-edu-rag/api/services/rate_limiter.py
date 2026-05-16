"""
api/services/rate_limiter.py

Rate limiting — προσωρινά ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΟ.
Όλοι οι χρήστες έχουν unlimited πρόσβαση.

Το module διατηρεί τα ίδια interfaces (check_rate_limit, RateCheckResult,
get_reset_dates, invalidate_user_plan) ώστε ο κώδικας που τα χρησιμοποιεί
να μην χρειαστεί αλλαγή όταν ενεργοποιηθεί ξανά το monetization.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional


_UNLIMITED = 999_999


@dataclass
class RateCheckResult:
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
    Rate limiting απενεργοποιημένο — επιστρέφει πάντα unlimited result.
    Δεν κάνει DB call, δεν ρίχνει 429.
    """
    return RateCheckResult(
        plan="free",
        monthly_used=0,
        monthly_limit=_UNLIMITED,
        daily_used=0,
        daily_limit=_UNLIMITED,
    )


def get_reset_dates(today: Optional[date] = None) -> dict[str, str]:
    today = today or date.today()
    first_of_next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    return {
        "monthly_resets_on": first_of_next_month.isoformat(),
        "daily_resets_on": (today + timedelta(days=1)).isoformat(),
    }


def invalidate_user_plan(user_id: str) -> None:
    """No-op — δεν υπάρχει cache να καθαριστεί."""
    pass
