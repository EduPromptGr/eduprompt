"""
api/routers/curriculum.py

GET  /api/curriculum            — λίστα στόχων ΑΠΣ (για CurriculumDrawer)
GET  /api/curriculum/subjects   — διαθέσιμα μαθήματα ανά τάξη

Αυτά τα endpoints είναι PUBLIC (authenticated, όχι rate-limited):
τα curriculum data είναι ΑΠΣ — δεν χρεώνουν LLM calls.

Flow:
    1. Auth (get_current_user_id) — απλώς επαληθεύουμε session
    2. Query curriculum_objectives στο Supabase
    3. Επιστροφή JSON ομαδοποιημένο σε unit → chapter → objectives

Query params:
    grade    : required  — "Α"-"ΣΤ"
    subject  : required  — π.χ. "Μαθηματικά"
    unit     : optional  — φιλτράρει σε συγκεκριμένη ενότητα
    q        : optional  — full-text αναζήτηση στα objectives
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
router = APIRouter(prefix="/api/curriculum", tags=["curriculum"])


# ── Supabase client (service role — read-only curriculum data) ──

@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE credentials required")
    return create_client(url, key)


# ── Response shapes ─────────────────────────────────────────────

class ObjectiveItem(BaseModel):
    id: str
    objective: str
    objective_code: Optional[str] = None
    keywords: list[str] = []
    source: str
    page_ref: Optional[str] = None
    sort_order: int


class ChapterGroup(BaseModel):
    chapter: Optional[str]
    objectives: list[ObjectiveItem]


class UnitGroup(BaseModel):
    unit: Optional[str]
    chapters: list[ChapterGroup]


class CurriculumResponse(BaseModel):
    grade: str
    subject: str
    total: int
    units: list[UnitGroup]


class SubjectEntry(BaseModel):
    subject: str
    count: int


# ── Endpoints ───────────────────────────────────────────────────

@router.get("", response_model=CurriculumResponse)
async def get_curriculum(
    grade: str = Query(..., description="Τάξη: Α, Β, Γ, Δ, Ε, ΣΤ"),
    subject: str = Query(..., description="Μάθημα π.χ. Μαθηματικά"),
    unit: Optional[str] = Query(None, description="Φίλτρο ενότητας"),
    q: Optional[str] = Query(None, description="Αναζήτηση κειμένου"),
    user_id: str = Depends(get_current_user_id),
) -> CurriculumResponse:
    """
    Επιστρέφει τους στόχους ΑΠΣ για τη δοθείσα τάξη+μάθημα,
    ομαδοποιημένους σε unit → chapter.

    Χρησιμοποιείται από το CurriculumDrawer του GenerateForm.
    """
    valid_grades = ('Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ')
    if grade not in valid_grades:
        raise HTTPException(422, f"grade must be one of: {valid_grades}")
    if not subject or len(subject) > 80:
        raise HTTPException(422, "subject required (max 80 chars)")

    try:
        query = (
            _supabase()
            .table("curriculum_objectives")
            .select("id, grade, subject, unit, chapter, objective, "
                    "objective_code, keywords, source, page_ref, sort_order")
            .eq("grade", grade)
            .eq("subject", subject)
            .order("sort_order", desc=False)
        )

        if unit:
            query = query.eq("unit", unit)

        result = query.execute()
    except Exception as e:
        logger.exception("Supabase curriculum query failed: %s", e)
        raise HTTPException(500, "DB error")

    rows = result.data or []

    # Client-side full-text filter (simple contains — Supabase fts via ilike)
    if q:
        q_lower = q.lower()
        rows = [r for r in rows if q_lower in r["objective"].lower()]

    # Group: unit → chapter → objectives
    unit_map: dict[str, dict[str, list[ObjectiveItem]]] = {}
    # Use a list to preserve insertion order
    unit_order: list[str] = []
    chapter_order: dict[str, list[str]] = {}

    for r in rows:
        u = r.get("unit") or "__none__"
        c = r.get("chapter") or "__none__"

        if u not in unit_map:
            unit_map[u] = {}
            unit_order.append(u)
            chapter_order[u] = []

        if c not in unit_map[u]:
            unit_map[u][c] = []
            chapter_order[u].append(c)

        unit_map[u][c].append(ObjectiveItem(
            id=r["id"],
            objective=r["objective"],
            objective_code=r.get("objective_code"),
            keywords=r.get("keywords") or [],
            source=r.get("source", "ΑΠΣ-2021"),
            page_ref=r.get("page_ref"),
            sort_order=r.get("sort_order", 0),
        ))

    units: list[UnitGroup] = []
    for u in unit_order:
        chapters: list[ChapterGroup] = []
        for c in chapter_order[u]:
            chapters.append(ChapterGroup(
                chapter=None if c == "__none__" else c,
                objectives=unit_map[u][c],
            ))
        units.append(UnitGroup(
            unit=None if u == "__none__" else u,
            chapters=chapters,
        ))

    return CurriculumResponse(
        grade=grade,
        subject=subject,
        total=len(rows),
        units=units,
    )


@router.get("/subjects", response_model=list[SubjectEntry])
async def get_subjects(
    grade: str = Query(..., description="Τάξη: Α, Β, Γ, Δ, Ε, ΣΤ"),
    user_id: str = Depends(get_current_user_id),
) -> list[SubjectEntry]:
    """
    Επιστρέφει τα διαθέσιμα μαθήματα για τη δοθείσα τάξη
    με αριθμό στόχων. Χρησιμοποιείται για populate του subject
    dropdown στο CurriculumDrawer.
    """
    valid_grades = ('Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ')
    if grade not in valid_grades:
        raise HTTPException(422, f"grade must be one of: {valid_grades}")

    try:
        result = (
            _supabase()
            .table("curriculum_objectives")
            .select("subject")
            .eq("grade", grade)
            .execute()
        )
    except Exception as e:
        logger.exception("Supabase subjects query failed: %s", e)
        raise HTTPException(500, "DB error")

    rows = result.data or []
    counts: dict[str, int] = {}
    for r in rows:
        s = r["subject"]
        counts[s] = counts.get(s, 0) + 1

    return [
        SubjectEntry(subject=s, count=c)
        for s, c in sorted(counts.items())
    ]
