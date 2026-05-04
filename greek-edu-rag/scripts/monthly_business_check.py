"""
================================================================
scripts/monthly_business_check.py

Railway cron (0 9 1 * *) — τρέχει κάθε 1η του μήνα 09:00.

Audit fixes:
- M-7 : αφαίρεση unused `json` import
- M-4 : per-section try/except, ώστε αν ένα κομμάτι σπάσει
        το υπόλοιπο report να τυπώνεται κανονικά
- M-18: το run_monthly_check μπορεί τώρα να επιστρέψει
        {"skipped": True, "reason": ...} — χειρίζεται και αυτό
================================================================
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from api.services.business_metrics import (  # noqa: E402
    KillSwitchMonitor,
    LTVTracker,
    ValidationFramework,
)


logger = logging.getLogger(__name__)


def _print_header(title: str) -> None:
    print(f"\n{'=' * 50}")
    print(title)
    print(f"{'=' * 50}\n")


def _run_kill_switch() -> dict:
    print("📊 Running kill switch check...")
    kill_switch = KillSwitchMonitor()
    try:
        result = kill_switch.run_monthly_check()
    except Exception as e:
        logger.exception("kill switch failed: %s", e)
        print(f"  ❌ Kill switch check failed: {e}")
        return {"error": str(e)}

    if result.get("skipped"):
        print(f"  ⏭  Skipped ({result.get('reason')})")
        return result

    print(f"Status: {result['status']}")
    print(f"Months since launch: {result['months_since_launch']}")

    metrics = result["metrics"]
    print("\nCurrent metrics:")
    print(f"  Paying users:  {metrics['paying_users']}")
    print(f"  MRR:           €{metrics['mrr']:.2f}")
    print(f"  WAU:           {metrics['wau']}")
    print(f"  NPS:           {metrics['nps']:.1f}")
    print(f"  30d Retention: {metrics['retention_30d_pct']}%")

    if result.get("failures"):
        print("\n⚠️  FAILURES:")
        for f in result["failures"]:
            print(f"  {f['metric']}: {f['current']} / {f['needed']}")

    return result


def _run_ltv_section() -> None:
    print("\n💰 LTV Analysis...")
    try:
        ltv = LTVTracker()
        ltv_metrics = ltv.get_ltv_metrics()
        print(f"  Avg LTV:     €{ltv_metrics.get('avg_ltv', 0)}")
        print(f"  Avg CAC:     €{ltv_metrics.get('avg_cac', 0)}")
        print(f"  LTV/CAC:     {ltv_metrics.get('ltv_cac_ratio', 0)}x")
        print(f"  Health:      {ltv_metrics.get('health', 'unknown')}")
    except Exception as e:
        logger.exception("LTV section failed: %s", e)
        print(f"  ❌ LTV Analysis failed: {e}")


def _run_cohort_section() -> None:
    print("\n📈 Cohort Analysis (last 3 months)...")
    try:
        ltv = LTVTracker()
        cohorts = ltv.get_cohort_analysis(months_back=3)
        if not cohorts:
            print("  (no cohort data yet)")
            return
        for c in cohorts:
            print(
                f"  {c.get('cohort_month', '?')}: "
                f"{c.get('users_count', 0)} users, "
                f"avg LTV €{c.get('avg_ltv', 0)}"
            )
    except Exception as e:
        logger.exception("cohort section failed: %s", e)
        print(f"  ❌ Cohort analysis failed: {e}")


def _run_validation_section() -> None:
    print("\n✅ Validation Checklist...")
    try:
        validation = ValidationFramework()
        val = validation.get_validation_checklist()
        for cp in val["checkpoints"]:
            status = "✅" if cp["achieved"] else "❌"
            print(
                f"  {status} {cp['name']}: "
                f"{cp['current']} / {cp['target']}"
            )
        print(f"\nNext action: {val['next_action']}")
    except Exception as e:
        logger.exception("validation section failed: %s", e)
        print(f"  ❌ Validation check failed: {e}")


def run_monthly_check() -> dict:
    _print_header(f"MONTHLY BUSINESS CHECK — {date.today().isoformat()}")

    ks_result = _run_kill_switch()
    _run_ltv_section()
    _run_cohort_section()
    _run_validation_section()

    _print_header("Monthly check complete.")
    return ks_result


if __name__ == "__main__":
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    result = run_monthly_check()
    # Railway: non-zero exit ⇒ failed job ⇒ notification
    if result.get("kill_switch_triggered"):
        sys.exit(1)
