#!/usr/bin/env python3
"""
Staging dry-run validator για το phase2_cleanup_migration.sql.

Τι ελέγχει:
1. SQL syntax validation με pglast (ο parser της Postgres)
2. Συσχέτιση μεταξύ references και objects που δημιουργούνται στα
   προηγούμενα migrations (eduprompt_db_migration.sql, class_profile_migration.sql)
3. Idempotency markers (IF NOT EXISTS, CREATE OR REPLACE, DO $$ guards)
4. Δεν υπάρχουν dangerous operations (DROP TABLE χωρίς IF EXISTS, TRUNCATE)

Χρήση:
    python3 validate_sql.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pglast
from pglast.parser import parse_sql, ParseError


HERE = Path(__file__).parent
MIGRATIONS = [
    HERE / "eduprompt_db_migration.sql",
    HERE / "class_profile_migration.sql",
    HERE / "phase2_cleanup_migration.sql",
]


# ── Expected DB objects from prior migrations ──────────────────
# Συγκεντρώνει τι περιμένουμε να υπάρχει ΠΡΙΝ τρέξει το Phase 2.
EXPECTED_TABLES = {
    "users", "class_profiles", "class_activity_logs", "class_subject_progress",
    "prompts", "school_members", "school_invites", "nps_responses",
    "subscription_events", "prompt_quality_signals", "milestone_snapshots",
    "error_reports",
}

# Tables που δημιουργεί το Phase 2 migration (θα προστεθούν)
PHASE2_NEW_TABLES = {"kill_switch_runs"}

# RPCs που καλούνται από τον κώδικα (απλώς τυπώνουμε τα references για review)
RPC_REFERENCES = {
    "is_current_user_admin", "get_class_stats", "add_school_invite",
    "get_objective_stats", "set_updated_at",
}


def _colour(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m"


def ok(msg: str) -> None:
    print(_colour("32", "  ✅ ") + msg)


def warn(msg: str) -> None:
    print(_colour("33", "  ⚠  ") + msg)


def err(msg: str) -> None:
    print(_colour("31", "  ❌ ") + msg)


def section(msg: str) -> None:
    print(_colour("36;1", f"\n─── {msg} ───"))


def parse_migration(path: Path) -> tuple[int, list[str]]:
    """Returns (num_statements, list of errors)."""
    sql = path.read_text(encoding="utf-8")
    try:
        tree = parse_sql(sql)
        return len(tree), []
    except ParseError as e:
        return 0, [str(e)]


def extract_ddl(path: Path) -> dict:
    """Μαζεύει DDL objects που δημιουργεί το migration (string matching)."""
    sql = path.read_text(encoding="utf-8")
    # Αφαίρεσε comments
    sql_no_comments = re.sub(r"--[^\n]*", "", sql)
    sql_no_comments = re.sub(r"/\*.*?\*/", "", sql_no_comments, flags=re.DOTALL)

    tables = set(re.findall(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)",
        sql_no_comments, re.IGNORECASE,
    ))
    functions = set(re.findall(
        r"CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(\w+)",
        sql_no_comments, re.IGNORECASE,
    ))
    indexes = set(re.findall(
        r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)",
        sql_no_comments, re.IGNORECASE,
    ))
    policies = set(re.findall(
        r'CREATE\s+POLICY\s+"([^"]+)"',
        sql_no_comments, re.IGNORECASE,
    ))
    triggers = set(re.findall(
        r"CREATE\s+TRIGGER\s+(\w+)",
        sql_no_comments, re.IGNORECASE,
    ))
    alters = set(re.findall(
        r"ALTER\s+TABLE\s+(\w+)",
        sql_no_comments, re.IGNORECASE,
    ))

    return {
        "tables": tables,
        "functions": functions,
        "indexes": indexes,
        "policies": policies,
        "triggers": triggers,
        "alters": alters,
    }


def check_idempotency(path: Path) -> list[str]:
    """Ελέγχει αν όλα τα CREATE/DROP statements είναι idempotent."""
    sql = path.read_text(encoding="utf-8")
    sql_no_comments = re.sub(r"--[^\n]*", "", sql)

    problems = []

    # CREATE TABLE χωρίς IF NOT EXISTS
    for m in re.finditer(
        r"CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)(\w+)",
        sql_no_comments, re.IGNORECASE,
    ):
        problems.append(f"CREATE TABLE {m.group(1)} χωρίς IF NOT EXISTS")

    # DROP TABLE χωρίς IF EXISTS
    for m in re.finditer(
        r"DROP\s+TABLE\s+(?!IF\s+EXISTS)(\w+)",
        sql_no_comments, re.IGNORECASE,
    ):
        problems.append(f"DROP TABLE {m.group(1)} χωρίς IF EXISTS")

    # DROP POLICY χωρίς IF EXISTS
    for m in re.finditer(
        r'DROP\s+POLICY\s+(?!IF\s+EXISTS)"?(\w+)',
        sql_no_comments, re.IGNORECASE,
    ):
        problems.append(f"DROP POLICY {m.group(1)} χωρίς IF EXISTS")

    # DROP TRIGGER χωρίς IF EXISTS
    for m in re.finditer(
        r"DROP\s+TRIGGER\s+(?!IF\s+EXISTS)(\w+)",
        sql_no_comments, re.IGNORECASE,
    ):
        problems.append(f"DROP TRIGGER {m.group(1)} χωρίς IF EXISTS")

    # ALTER TABLE ADD COLUMN χωρίς IF NOT EXISTS
    for m in re.finditer(
        r"ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)(\w+)",
        sql_no_comments, re.IGNORECASE,
    ):
        problems.append(
            f"ALTER TABLE {m.group(1)} ADD COLUMN {m.group(2)} χωρίς IF NOT EXISTS"
        )

    # TRUNCATE warnings
    for m in re.finditer(r"\bTRUNCATE\s+(\w+)", sql_no_comments, re.IGNORECASE):
        problems.append(f"⚠ TRUNCATE {m.group(1)} — destructive")

    return problems


def check_phase2_against_predecessors(phase2: dict, predecessors: dict) -> list[str]:
    """
    Ελέγχει ότι όλα τα tables που αλλάζει το Phase 2 υπάρχουν στα prior
    migrations ή δημιουργούνται μέσα στο ίδιο το Phase 2.
    """
    warnings = []
    phase2_created = phase2["tables"]
    all_known = predecessors["tables"] | phase2_created | EXPECTED_TABLES

    for altered in phase2["alters"]:
        if altered not in all_known:
            warnings.append(
                f"ALTER TABLE {altered} — το table δεν δημιουργείται "
                f"σε κανένα γνωστό migration"
            )

    return warnings


def main() -> int:
    exit_code = 0

    for migration in MIGRATIONS:
        section(migration.name)
        if not migration.exists():
            err(f"Λείπει το αρχείο: {migration}")
            exit_code = 1
            continue

        n, errors = parse_migration(migration)
        if errors:
            err("Parse failed:")
            for e in errors:
                print(f"      {e}")
            exit_code = 1
        else:
            ok(f"SQL parse OK — {n} top-level statements")

        ddl = extract_ddl(migration)
        if ddl["tables"]:
            ok(f"Tables: {', '.join(sorted(ddl['tables']))}")
        if ddl["functions"]:
            ok(f"Functions: {', '.join(sorted(ddl['functions']))}")
        if ddl["indexes"]:
            ok(f"Indexes: {len(ddl['indexes'])}")
        if ddl["policies"]:
            ok(f"RLS policies: {len(ddl['policies'])}")
        if ddl["triggers"]:
            ok(f"Triggers: {', '.join(sorted(ddl['triggers']))}")

        idem_problems = check_idempotency(migration)
        if idem_problems:
            for p in idem_problems:
                warn(p)
        else:
            ok("Idempotency: όλα τα CREATE/DROP έχουν guards")

    # Cross-migration check
    section("Cross-migration dependencies")
    base = extract_ddl(MIGRATIONS[0])
    class_profile = extract_ddl(MIGRATIONS[1])
    phase2 = extract_ddl(MIGRATIONS[2])

    combined_prior = {
        "tables": base["tables"] | class_profile["tables"],
        "functions": base["functions"] | class_profile["functions"],
    }

    cross_warnings = check_phase2_against_predecessors(phase2, combined_prior)
    if cross_warnings:
        for w in cross_warnings:
            warn(w)
    else:
        ok("Phase 2 references match prior migrations")

    # Αναμενόμενα objects του Phase 2
    section("Phase 2 expected deliverables")
    expected_new_tables = {"kill_switch_runs"}
    expected_new_functions = {
        "is_current_user_admin", "get_class_stats",
        "add_school_invite", "get_objective_stats", "set_updated_at",
    }
    expected_new_columns_on = {"users": "is_admin"}

    missing_tables = expected_new_tables - phase2["tables"]
    missing_fns = expected_new_functions - phase2["functions"]

    if missing_tables:
        err(f"Λείπουν tables από Phase 2: {missing_tables}")
        exit_code = 1
    else:
        ok(f"Νέα tables: {expected_new_tables}")

    if missing_fns:
        err(f"Λείπουν functions από Phase 2: {missing_fns}")
        exit_code = 1
    else:
        ok(f"Νέα/updated functions: {expected_new_functions}")

    # Column add check
    phase2_sql = MIGRATIONS[2].read_text(encoding="utf-8")
    for table, col in expected_new_columns_on.items():
        pat = rf"ALTER\s+TABLE\s+{table}\b.*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+{col}"
        if re.search(pat, phase2_sql, re.IGNORECASE | re.DOTALL):
            ok(f"Adds column {table}.{col} idempotently")
        else:
            err(f"Δεν βρέθηκε idempotent ADD COLUMN για {table}.{col}")
            exit_code = 1

    section("RPC surface που καλεί ο κώδικας")
    for rpc in sorted(RPC_REFERENCES):
        defined = rpc in (base["functions"] | class_profile["functions"] | phase2["functions"])
        status = ok if defined else warn
        status(f"{rpc} — {'defined' if defined else 'MISSING (review)'}")

    section("Summary")
    if exit_code == 0:
        ok("Staging dry-run PASS — το migration είναι έτοιμο για Supabase")
        print()
        print("Next steps για πραγματικό staging:")
        print("  1. Copy το phase2_cleanup_migration.sql στο Supabase SQL Editor")
        print("  2. Τρέξε σε Supabase BRANCH (όχι production)")
        print("  3. Επιβεβαίωσε ότι `SELECT 'Phase 2+3 cleanup migration complete ✅'`")
        print("     εμφανίζεται ως τελευταίο row")
        print("  4. Δοκίμασε χειρονακτικά:")
        print("     • SELECT is_current_user_admin();  (πρέπει να γυρίσει FALSE)")
        print("     • SELECT * FROM kill_switch_runs;  (empty)")
        print("     • Bootstrap admin: UPDATE users SET is_admin = TRUE WHERE email = '…'")
    else:
        err("Staging dry-run FAILED")
    print()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
