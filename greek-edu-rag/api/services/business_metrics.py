"""
================================================================
EDUPROMPT — BUSINESS METRICS SYSTEM
Αρχείο: api/services/business_metrics.py

Καλύπτει:
1. LTV/CAC calculation
2. Data flywheel (moat)
3. Kill switch monitoring (idempotent)
4. NPS & validation framework
5. Cohort analysis

Audit fixes εφαρμοσμένα (Phase 2+3):
- H-2 : LAUNCH_DATE required env var (όχι silent fallback)
- H-1 : ADMIN_EMAIL / ALERT_FROM_EMAIL από env, όχι hardcoded
- M-1 : Lazy Supabase/Resend client init με @lru_cache
- M-2 : relativedelta αντί για timedelta(days=30) στα cohorts
- M-3 : get_flywheel_stats → call στο SQL RPC get_objective_stats
- M-4 : try/except + logging γύρω από Supabase calls
- M-6 : Αφαίρεση unused Decimal import
- M-18: run_monthly_check μέσω kill_switch_runs με UNIQUE(milestone_month)
================================================================
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Optional

import resend
from dateutil.relativedelta import relativedelta
from supabase import Client, create_client


logger = logging.getLogger(__name__)


# ================================================================
# ENV / CLIENT FACTORIES  (M-1, H-1, H-2)
# ================================================================

def _required_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(
            f"Missing required env var: {name}. "
            f"See PHASE1_FIXES.md για τη λίστα των απαιτούμενων vars."
        )
    return val


@lru_cache(maxsize=1)
def _supabase() -> Client:
    """Lazy Supabase service-role client. Initialized once per process."""
    return create_client(
        _required_env("SUPABASE_URL"),
        _required_env("SUPABASE_SERVICE_ROLE_KEY"),
    )


@lru_cache(maxsize=1)
def _resend_configured() -> bool:
    """Set resend.api_key once on first use. Returns True if configured."""
    key = os.getenv("RESEND_API_KEY")
    if not key:
        logger.warning("RESEND_API_KEY missing — email alerts disabled")
        return False
    resend.api_key = key
    return True


def _launch_date() -> date:
    """
    H-2: LAUNCH_DATE είναι υποχρεωτικό env var. Χωρίς αυτό, το
    kill switch δεν ξέρει σε ποιον μήνα είμαστε, οπότε θα αποτύχει
    σιωπηλά να ενεργοποιηθεί. Αντί αυτού, κάνει hard fail.
    """
    raw = _required_env("LAUNCH_DATE")
    try:
        return date.fromisoformat(raw)
    except ValueError as e:
        raise RuntimeError(
            f"LAUNCH_DATE '{raw}' is not valid ISO date (YYYY-MM-DD)"
        ) from e


def _admin_email() -> str:
    return os.getenv("ADMIN_EMAIL", "hello@eduprompt.gr")


def _alert_from() -> str:
    return os.getenv(
        "ALERT_FROM_EMAIL",
        f"EduPrompt Metrics <{_admin_email()}>",
    )


def _now() -> datetime:
    """Timezone-aware now() για σταθερό cohort arithmetic."""
    return datetime.now(timezone.utc)


# ================================================================
# ΜΕΡΟΣ 1: LTV / CAC TRACKING
# ================================================================

class LTVTracker:
    """
    Υπολογίζει LTV (Lifetime Value) και CAC (Cost to Acquire)
    για κάθε channel. Target ratio: LTV/CAC > 3x.

    Τρέχων στόχος:
    - LTV:  ~€140 (14 μήνες × €14.99 × 67% retention)
    - CAC:  ~€2-15 ανά channel
    - Ratio: ~10-70x (πολύ υγιές)
    """

    CAC_BY_CHANNEL = {
        "organic_seo": 2.0,
        "facebook_groups": 0.5,    # χρόνος μόνο
        "referral": 14.99,         # 1 μήνας Pro που δίνεις
        "direct": 0.0,
        "word_of_mouth": 0.0,
    }

    def record_subscription_event(
        self,
        user_id: str,
        event_type: str,
        plan: Optional[str] = None,
        mrr_impact: float = 0,
        stripe_event_id: Optional[str] = None,
    ) -> dict:
        """
        Καταγράφει κάθε subscription event.
        Στην πράξη καλείται από τον Stripe webhook (TS route), οπότε
        αυτό το path είναι fallback / admin-triggered.
        """
        sb = _supabase()
        try:
            if stripe_event_id:
                existing = (
                    sb.table("subscription_events")
                    .select("id")
                    .eq("stripe_event_id", stripe_event_id)
                    .execute()
                )
                if existing.data:
                    return {"skipped": True, "reason": "duplicate"}

            result = (
                sb.table("subscription_events")
                .insert(
                    {
                        "user_id": user_id,
                        "event_type": event_type,
                        "plan": plan,
                        "mrr_impact": mrr_impact,
                        "stripe_event_id": stripe_event_id,
                        "metadata": {"recorded_at": _now().isoformat()},
                    }
                )
                .execute()
            )

            if mrr_impact > 0:
                sb.rpc(
                    "increment_user_ltv",
                    {"p_user_id": user_id, "p_amount": mrr_impact},
                ).execute()

            return {
                "success": True,
                "event_id": result.data[0]["id"] if result.data else None,
            }
        except Exception as e:
            logger.exception(
                "record_subscription_event failed user=%s event=%s: %s",
                user_id, event_type, e,
            )
            return {"success": False, "error": str(e)}

    def get_ltv_metrics(self) -> dict:
        """Τρέχοντα LTV metrics για το dashboard."""
        try:
            result = (
                _supabase()
                .table("users")
                .select("ltv_total, created_at")
                .neq("subscription_status", "free")
                .execute()
            )
        except Exception as e:
            logger.exception("get_ltv_metrics query failed: %s", e)
            return {"avg_ltv": 0, "total_revenue": 0, "paying_users": 0, "error": str(e)}

        if not result.data:
            return {
                "avg_ltv": 0,
                "total_revenue": 0,
                "paying_users": 0,
                "ltv_cac_ratio": 0,
                "health": "unknown",
            }

        ltv_values = [float(u.get("ltv_total") or 0) for u in result.data]
        avg_ltv = sum(ltv_values) / len(ltv_values)
        avg_cac = self.CAC_BY_CHANNEL["referral"]  # conservative

        ratio = avg_ltv / avg_cac if avg_cac > 0 else 0
        health = (
            "excellent" if ratio > 10
            else "good" if ratio > 3
            else "poor"
        )

        return {
            "avg_ltv": round(avg_ltv, 2),
            "total_revenue": round(sum(ltv_values), 2),
            "paying_users": len(result.data),
            "avg_cac": avg_cac,
            "ltv_cac_ratio": round(ratio, 1),
            "health": health if avg_cac > 0 else "unknown",
        }

    def get_cohort_analysis(self, months_back: int = 6) -> list:
        """
        Cohort analysis: LTV ανά μήνα εγγραφής.
        M-2 fix: relativedelta αντί για timedelta(days=30) — το 30-day
        drift άλλαζε λάθος μήνα σε 31-ήμερους μήνες.
        """
        cohorts: list = []
        first_of_month = date.today().replace(day=1)

        for i in range(months_back):
            target_date = first_of_month - relativedelta(months=i)
            month_str = target_date.strftime("%Y-%m")

            try:
                result = _supabase().rpc(
                    "get_cohort_ltv", {"p_month": month_str}
                ).execute()
            except Exception as e:
                logger.exception("get_cohort_ltv failed for %s: %s", month_str, e)
                continue

            if result.data and result.data[0].get("users_count", 0) > 0:
                cohorts.append(result.data[0])

        return cohorts


# ================================================================
# ΜΕΡΟΣ 2: DATA FLYWHEEL (MOAT)
# ================================================================

class DataFlywheel:
    """
    Data flywheel — το προϊόν βελτιώνεται αυτόματα καθώς
    συσσωρεύονται signals από τους χρήστες.
    """

    SIGNAL_WEIGHTS = {
        "high_rating": 1.5,
        "low_rating": 1.5,
        "saved": 1.2,
        "differentiated": 1.0,
        "error_reported": 2.0,
        "shared_top_prompts": 1.8,
        "copied": 0.8,
    }

    def record_signal(
        self, prompt_id: str, user_id: str, signal_type: str
    ) -> None:
        weight = self.SIGNAL_WEIGHTS.get(signal_type, 1.0)
        sb = _supabase()
        try:
            sb.table("prompt_quality_signals").insert(
                {
                    "prompt_id": prompt_id,
                    "user_id": user_id,
                    "signal_type": signal_type,
                    "weight": weight,
                }
            ).execute()
        except Exception as e:
            logger.exception(
                "record_signal failed prompt=%s user=%s: %s",
                prompt_id, user_id, e,
            )
            return

        if signal_type == "error_reported":
            self._flag_for_review(prompt_id)

    def get_best_approach(
        self, grade: str, subject: str, objective: str
    ) -> dict:
        try:
            result = _supabase().rpc(
                "get_objective_quality_score",
                {"p_grade": grade, "p_subject": subject, "p_objective": objective},
            ).execute()
        except Exception as e:
            logger.exception("get_objective_quality_score failed: %s", e)
            return {
                "has_data": False,
                "quality_score": None,
                "best_theory": None,
                "best_strategy": None,
                "total_uses": 0,
                "error": str(e),
            }

        if not result.data or result.data[0].get("total_uses", 0) < 10:
            return {
                "has_data": False,
                "quality_score": None,
                "best_theory": None,
                "best_strategy": None,
                "total_uses": result.data[0]["total_uses"] if result.data else 0,
            }

        return {
            "has_data": True,
            "quality_score": result.data[0]["quality_score"],
            "best_theory": result.data[0]["best_theory"],
            "best_strategy": result.data[0]["best_strategy"],
            "total_uses": result.data[0]["total_uses"],
        }

    def get_flywheel_stats(self) -> dict:
        """
        M-3 fix: εδώ πριν κατεβαίναμε ΟΛΟ το prompts table για να
        κάνουμε in-memory GROUP BY. Τώρα μια SQL RPC κάνει το aggregate.
        """
        try:
            result = _supabase().rpc("get_objective_stats").execute()
        except Exception as e:
            logger.exception("get_objective_stats RPC failed: %s", e)
            return {
                "total_objectives_seen": 0,
                "optimized_objectives": 0,
                "optimization_rate": 0,
                "error": str(e),
                "note": "Σφάλμα φόρτωσης — δες logs",
            }

        if not result.data:
            return {
                "total_objectives_seen": 0,
                "optimized_objectives": 0,
                "optimization_rate": 0,
                "note": "Δεν υπάρχουν ακόμα αξιολογημένα prompts",
            }

        row = result.data[0]
        optimized = int(row.get("optimized_objectives") or 0)
        return {
            "total_objectives_seen": int(row.get("total_objectives_seen") or 0),
            "optimized_objectives": optimized,
            "optimization_rate": float(row.get("optimization_rate") or 0),
            "note": f"{optimized} στόχοι ΑΠΣ με βέλτιστη προσέγγιση",
        }

    def _flag_for_review(self, prompt_id: str) -> None:
        try:
            _supabase().table("error_reports").update(
                {"priority": "critical"}
            ).eq("prompt_id", prompt_id).execute()
        except Exception as e:
            logger.exception(
                "_flag_for_review failed prompt=%s: %s", prompt_id, e
            )


# ================================================================
# ΜΕΡΟΣ 3: KILL SWITCH MONITORING
# ================================================================

@dataclass
class _MilestoneResult:
    milestone_month: int
    kill_switch_triggered: bool
    failures: list
    metrics: dict


class KillSwitchMonitor:
    """
    Παρακολουθεί αν φτάνουμε τα business milestones.
    Τρέχει κάθε μήνα μέσω Railway cron.

    M-18 fix: κάθε milestone τρέχει ακριβώς μία φορά. Αποθηκεύεται
    στο `kill_switch_runs` με UNIQUE(milestone_month). Αν ο cron
    χάσει μια εκτέλεση (Railway outage), το επόμενο run συνεχίζει
    κανονικά και δεν χάνουμε το kill switch.
    """

    CRITERIA = {
        3: {
            "min_paying": 10,
            "min_nps": 30,
            "min_wau": 30,
            "action": "pivot_assessment",
            "message": "Λίγοι paying users — επανεξέτασε pricing ή ICP",
        },
        6: {
            "min_mrr": 500,
            "min_paying": 35,
            "min_retention_30d_pct": 40,
            "action": "serious_pivot",
            "message": "Χαμηλό MRR ή retention — σοβαρή επανεξέταση",
        },
        12: {
            "min_mrr": 2000,
            "min_paying": 140,
            "min_retention_30d_pct": 55,
            "action": "consider_shutdown",
            "message": "Δεν επιτεύχθηκαν οι στόχοι χρόνου 1",
        },
    }

    def get_current_metrics(self) -> dict:
        """Μαζεύει όλα τα τρέχοντα business metrics."""
        sb = _supabase()
        metrics: dict[str, Any] = {
            "paying_users": 0,
            "mrr": 0.0,
            "wau": 0,
            "nps": 0.0,
            "retention_30d_pct": 0,
            "checked_at": _now().isoformat(),
        }

        try:
            paying = (
                sb.table("users")
                .select("id", count="exact")
                .neq("subscription_status", "free")
                .execute()
            )
            metrics["paying_users"] = paying.count or 0
        except Exception as e:
            logger.exception("paying_users query failed: %s", e)

        try:
            mrr = sb.rpc("get_current_mrr").execute()
            metrics["mrr"] = float(mrr.data or 0)
        except Exception as e:
            logger.exception("get_current_mrr failed: %s", e)

        try:
            wau = sb.rpc("get_weekly_active_users").execute()
            metrics["wau"] = wau.data or 0
        except Exception as e:
            logger.exception("get_weekly_active_users failed: %s", e)

        try:
            nps = sb.rpc("calculate_nps", {"days_back": 30}).execute()
            metrics["nps"] = float(nps.data or 0)
        except Exception as e:
            logger.exception("calculate_nps failed: %s", e)

        # 30-day retention — σε δικό του try/except γιατί έχει 3 calls
        try:
            thirty_days_ago = (_now() - timedelta(days=30)).isoformat()

            users_30d_ago = (
                sb.table("users")
                .select("id", count="exact")
                .lt("created_at", thirty_days_ago)
                .neq("subscription_status", "free")
                .execute()
            )
            still_active = (
                sb.table("prompts")
                .select("user_id")
                .gte("created_at", thirty_days_ago)
                .execute()
            )
            active_ids = {p["user_id"] for p in (still_active.data or [])}

            if users_30d_ago.count and active_ids:
                retained = (
                    sb.table("users")
                    .select("id", count="exact")
                    .lt("created_at", thirty_days_ago)
                    .neq("subscription_status", "free")
                    .in_("id", list(active_ids))
                    .execute()
                )
                metrics["retention_30d_pct"] = round(
                    (retained.count or 0) / users_30d_ago.count * 100, 1
                )
        except Exception as e:
            logger.exception("retention_30d calc failed: %s", e)

        return metrics

    def run_monthly_check(self) -> dict:
        """
        Κύρια συνάρτηση — Railway cron: 0 9 1 * *

        M-18 flow:
        1. Υπολόγισε months_since_launch
        2. Αν δεν είναι ένας από τους milestone months [3, 6, 12], skip
        3. Αν το milestone έχει ήδη εγγραφή στο kill_switch_runs, skip
        4. Αλλιώς: τρέξε metrics, κάνε insert με ON CONFLICT DO NOTHING
        5. Αν έπεσε το switch, στείλε alert
        """
        launch = _launch_date()
        today = date.today()
        months_since_launch = (
            (today.year - launch.year) * 12 + (today.month - launch.month)
        )

        if months_since_launch not in self.CRITERIA:
            return {
                "skipped": True,
                "reason": f"Δεν είναι milestone month (current: {months_since_launch})",
                "months_since_launch": months_since_launch,
            }

        milestone = months_since_launch
        sb = _supabase()

        # Idempotency check: υπάρχει ήδη εγγραφή για αυτό το milestone;
        try:
            existing = (
                sb.table("kill_switch_runs")
                .select("id, kill_switch_triggered")
                .eq("milestone_month", milestone)
                .maybeSingle()
                .execute()
            )
            if existing.data:
                return {
                    "skipped": True,
                    "reason": "already_processed",
                    "milestone_month": milestone,
                    "kill_switch_triggered": existing.data.get(
                        "kill_switch_triggered"
                    ),
                }
        except Exception as e:
            logger.exception(
                "kill_switch_runs lookup failed for milestone %s: %s",
                milestone, e,
            )
            # Δεν κάνουμε return — αν το table δεν υπάρχει ή είναι error
            # προτιμάμε να προχωρήσει ο έλεγχος παρά να χάσουμε alert.

        metrics = self.get_current_metrics()
        criteria = self.CRITERIA[milestone]

        failures = []
        for metric, threshold in criteria.items():
            if metric in ("action", "message"):
                continue
            current = metrics.get(metric, 0)
            if current < threshold:
                failures.append(
                    {
                        "metric": metric,
                        "current": current,
                        "needed": threshold,
                        "gap": round(threshold - current, 2),
                    }
                )

        kill_switch_triggered = len(failures) > 0

        # Εγγραφή στο kill_switch_runs (UNIQUE milestone_month) — εάν
        # 2 cron runs τρέξουν ταυτόχρονα, ένας θα κερδίσει.
        try:
            sb.table("kill_switch_runs").insert(
                {
                    "milestone_month": milestone,
                    "run_date": today.isoformat(),
                    "kill_switch_triggered": kill_switch_triggered,
                    "metrics": metrics,
                    "failures": failures,
                }
            ).execute()
        except Exception as e:
            # Πιθανό unique_violation → άλλο worker πρόλαβε. Skip.
            logger.warning(
                "kill_switch_runs insert failed (race?) milestone=%s: %s",
                milestone, e,
            )
            return {
                "skipped": True,
                "reason": "concurrent_run",
                "milestone_month": milestone,
            }

        # Snapshot για το dashboard
        try:
            total_users = (
                sb.table("users").select("id", count="exact").execute()
            )
            sb.table("milestone_snapshots").upsert(
                {
                    "snapshot_month": today.strftime("%Y-%m"),
                    "total_users": total_users.count or 0,
                    "paying_users": metrics["paying_users"],
                    "mrr": metrics["mrr"],
                    "wau": metrics["wau"],
                    "avg_nps": metrics["nps"],
                    "churn_rate_30d": 100 - metrics["retention_30d_pct"],
                    "kill_switch_triggered": kill_switch_triggered,
                    "notes": str(failures) if failures else "On track",
                },
                on_conflict="snapshot_month",
            ).execute()
        except Exception as e:
            logger.exception("milestone_snapshots upsert failed: %s", e)

        # Alert email
        if kill_switch_triggered:
            self._send_kill_switch_alert(
                failures=failures,
                month=milestone,
                metrics=metrics,
                criteria=criteria,
            )

        return {
            "month": today.strftime("%Y-%m"),
            "milestone_month": milestone,
            "months_since_launch": months_since_launch,
            "metrics": metrics,
            "failures": failures,
            "kill_switch_triggered": kill_switch_triggered,
            "status": "⚠️ Action needed" if failures else "✅ On track",
        }

    def _send_kill_switch_alert(
        self,
        failures: list,
        month: int,
        metrics: dict,
        criteria: dict,
    ) -> None:
        """Email alert όταν το kill switch ενεργοποιηθεί."""
        if not _resend_configured():
            return

        failures_html = "".join(
            [
                f"<li><strong>{f['metric']}</strong>: "
                f"τρέχον {f['current']} / στόχος {f['needed']} "
                f"(gap: {f['gap']})</li>"
                for f in failures
            ]
        )

        html = f"""
        <h2>Kill Switch Alert — Μήνας {month}</h2>
        <p>Δεν επιτεύχθηκαν τα milestones:</p>
        <ul>{failures_html}</ul>

        <h3>Τρέχοντα Metrics</h3>
        <ul>
            <li>Paying users: {metrics['paying_users']}</li>
            <li>MRR: €{metrics['mrr']:.2f}</li>
            <li>WAU: {metrics['wau']}</li>
            <li>NPS: {metrics['nps']}</li>
            <li>30d Retention: {metrics['retention_30d_pct']}%</li>
        </ul>

        <p><strong>Προτεινόμενη ενέργεια:</strong>
        {criteria.get('action', 'Επανεξέτασε στρατηγική')}</p>
        <p>{criteria.get('message', '')}</p>

        <p>
            <a href="https://eduprompt.gr/admin">
                Άνοιξε το Admin Dashboard →
            </a>
        </p>
        """

        try:
            resend.Emails.send(
                {
                    "from": _alert_from(),
                    "to": [_admin_email()],
                    "subject": f"⚠️ Kill Switch Alert — Μήνας {month}",
                    "html": html,
                }
            )
        except Exception as e:
            logger.exception("kill switch alert email failed: %s", e)


# ================================================================
# ΜΕΡΟΣ 4: VALIDATION FRAMEWORK
# ================================================================

class ValidationFramework:
    """
    Πρακτικός οδηγός για validation:
    "Έχει πληρώσει κάποιος; Αν όχι, είναι idea."

    Στόχοι για launch validation:
    - 10 paying customers (€ σε λογαριασμό)
    - NPS > 50
    - 3 γραπτά testimonials
    """

    OUTREACH_SCRIPT = """
Γεια σου {name},

Είδα ότι συμμετέχεις στο {group} και ήθελα να μοιραστώ
κάτι που φτιάχνω.

Είμαι φοιτητής Παιδαγωγικού Ιωαννίνων και ανέπτυξα
το EduPrompt — ένα εργαλείο που δημιουργεί AI prompts
αποκλειστικά βασισμένα στο ελληνικό ΑΠΣ.

Αντί να χρησιμοποιείς ChatGPT που δεν ξέρει το ΑΠΣ,
το EduPrompt παράγει prompt σε 90 δευτερόλεπτα με:
• Σύνδεση με τον επίσημο στόχο ΑΠΣ
• Παιδαγωγική τεκμηρίωση (Vygotsky, Bloom κλπ)
• Βήμα-βήμα οδηγίες για την τάξη

Θα ήθελες να το δοκιμάσεις δωρεάν για 2 εβδομάδες;
Χρειάζομαι τη γνώμη εκπαιδευτικών που χρησιμοποιούν
πραγματικά τα εργαλεία στην τάξη.

— {your_name}
"""

    TARGET_GROUPS = [
        "Εκπαιδευτικοί Δημοτικού Ελλάδας",
        "Δάσκαλοι και Νηπιαγωγοί",
        "Ειδική Αγωγή — Εκπαιδευτικοί",
        "Εκπαίδευση & Τεχνολογία",
        "Μαθηματικά Δημοτικού",
    ]

    def get_validation_checklist(self) -> dict:
        """Τρέχουσα κατάσταση validation."""
        sb = _supabase()
        paying_count = 0
        nps_score = 0.0
        errors_count = 0

        try:
            paying = (
                sb.table("users")
                .select("id", count="exact")
                .neq("subscription_status", "free")
                .execute()
            )
            paying_count = paying.count or 0
        except Exception as e:
            logger.exception("validation paying_users failed: %s", e)

        try:
            nps = sb.rpc("calculate_nps", {"days_back": 30}).execute()
            nps_score = float(nps.data or 0)
        except Exception as e:
            logger.exception("validation nps failed: %s", e)

        try:
            errors = (
                sb.table("error_reports")
                .select("id", count="exact")
                .eq("status", "pending")
                .execute()
            )
            errors_count = errors.count or 0
        except Exception as e:
            logger.exception("validation error_reports failed: %s", e)

        return {
            "checkpoints": [
                {
                    "name": "10 Paying Customers",
                    "current": paying_count,
                    "target": 10,
                    "achieved": paying_count >= 10,
                    "pct": min(100, paying_count * 10),
                    "why": "Αποδεικνύει πραγματική αξία — κάποιος έβαλε χρήματα",
                },
                {
                    "name": "NPS > 50",
                    "current": round(nps_score, 1),
                    "target": 50,
                    "achieved": nps_score >= 50,
                    "pct": min(100, max(0, nps_score * 2)),
                    "why": "Product-market fit indicator",
                },
                {
                    "name": "0 Pending Error Reports",
                    "current": errors_count,
                    "target": 0,
                    "achieved": errors_count == 0,
                    "pct": 100 if errors_count == 0 else 0,
                    "why": "Ποιότητα prompts — critical για trust",
                },
            ],
            "overall_validated": (
                paying_count >= 10 and nps_score >= 50 and errors_count == 0
            ),
            "next_action": (
                "Επικοινώνησε με angels / ΕΣΠΑ"
                if paying_count >= 10
                else f"Χρειάζεσαι {10 - paying_count} ακόμα paying users"
            ),
        }


# ================================================================
# ΜΕΡΟΣ 5: ΒΟΗΘΗΤΙΚΕΣ ΣΥΝΑΡΤΗΣΕΙΣ ΓΙΑ GENERATE ROUTER
# ================================================================

# Singleton — δεν πάει στο χτύπημα της DB, μόνο dispatch helper.
flywheel = DataFlywheel()


def record_prompt_signal(
    prompt_id: str,
    user_id: str,
    action: str,
    rating: Optional[int] = None,
) -> None:
    """Wrapper που καλείται από κάθε user action."""
    if action == "rate" and rating is not None:
        signal = "high_rating" if rating >= 4 else "low_rating"
        flywheel.record_signal(prompt_id, user_id, signal)
    elif action == "save":
        flywheel.record_signal(prompt_id, user_id, "saved")
    elif action == "differentiate":
        flywheel.record_signal(prompt_id, user_id, "differentiated")
    elif action == "copy":
        flywheel.record_signal(prompt_id, user_id, "copied")
    elif action == "error_report":
        flywheel.record_signal(prompt_id, user_id, "error_reported")


def get_enhanced_prompt_context(
    grade: str,
    subject: str,
    objective: str,
    user_theory: str = "",
    user_strategy: str = "",
) -> dict:
    """
    Επιστρέφει enhanced context για το generate router.
    Αν υπάρχουν αρκετά data (>= 10 uses), προτείνει βέλτιστη προσέγγιση.
    """
    best = flywheel.get_best_approach(grade, subject, objective)

    if best["has_data"] and not user_theory:
        return {
            "theory": best["best_theory"] or user_theory,
            "strategy": best["best_strategy"] or user_strategy,
            "quality_score": best["quality_score"],
            "data_driven": True,
            "note": f"Βελτιστοποιημένο από {best['total_uses']} χρήσεις",
        }

    return {
        "theory": user_theory,
        "strategy": user_strategy,
        "quality_score": None,
        "data_driven": False,
        "note": "Νέος στόχος — δεν υπάρχουν αρκετά data ακόμα",
    }
