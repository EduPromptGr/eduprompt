"""
api/routers/worksheets.py

Δημιουργία φυλλαδίων εργασίας & αξιολόγησης βάσει σεναρίου.
"""
from __future__ import annotations

import json
import logging
import os
from functools import lru_cache

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client, create_client

from api.dependencies import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/worksheets", tags=["worksheets"])


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE credentials required")
    return create_client(url, key)


class WorksheetRequest(BaseModel):
    prompt_id: str


SYSTEM_PROMPT = """
Είσαι ειδικός παιδαγωγός για το ελληνικό Δημοτικό Σχολείο.
Δημιουργείς φυλλάδια εργασίας και αξιολόγησης που:
- Υποστηρίζουν άμεσα τις φάσεις του σεναρίου
- Είναι κατάλληλα για την ηλικία
- Έχουν ποικίλες, ελκυστικές δραστηριότητες
- Είναι έτοιμα για εκτύπωση και χρήση στην τάξη

Απάντησε ΜΟΝΟ με έγκυρο JSON — χωρίς markdown, χωρίς εξηγήσεις.
"""


@router.post("/generate")
async def generate_worksheets(
    req: WorksheetRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Δημιουργία φυλλαδίων εργασίας βάσει αποθηκευμένου σεναρίου."""

    # ── Βήμα 1: Fetch σενάριο από Supabase ─────────────────────────
    try:
        result = (
            _supabase()
            .table("prompts")
            .select("id, grade, subject, objective, title, body, theory, strategy")
            .eq("id", req.prompt_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.exception("Supabase fetch failed: %s", e)
        raise HTTPException(500, f"DB error: {e}")

    if not result.data:
        raise HTTPException(404, "Σενάριο δεν βρέθηκε")

    row = result.data[0]
    body = row.get("body") or {}
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            body = {}

    phases = body.get("phases") or []
    phases_text = "\n".join(
        f"Φάση {i + 1} — {p.get('label', '')}: {p.get('body', '')[:500]}"
        for i, p in enumerate(phases)
    )

    scenario_summary = f"""Τίτλος: {row.get('title', '')}
Τάξη: {row.get('grade', '')} Δημοτικού
Μάθημα: {row.get('subject', '')}
Στόχος: {row.get('objective', '')}

ΦΑΣΕΙΣ:
{phases_text}

Κοινά λάθη: {body.get('common_errors', '')}""".strip()

    user_message = f"""Δημιούργησε 1-2 φυλλάδια για το παρακάτω σενάριο.

{scenario_summary}

Επίστρεψε JSON ακριβώς σε αυτό το format:
{{
  "worksheets": [
    {{
      "title": "τίτλος φυλλαδίου",
      "type": "φύλλο_εργασίας",
      "image_keywords": ["keyword in english"],
      "instructions": "Οδηγίες για τον μαθητή",
      "activities": [
        {{
          "number": 1,
          "instruction": "Οδηγία δραστηριότητας",
          "type": "ανοιχτή_ερώτηση",
          "content": null,
          "answer_lines": 3
        }}
      ]
    }}
  ]
}}"""

    # ── Βήμα 2: Claude API call ────────────────────────────────────
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = message.content[0].text.strip()
    except Exception as e:
        logger.exception("Claude API call failed: %s", e)
        raise HTTPException(500, f"Claude error: {e}")

    # ── Βήμα 3: Parse JSON ─────────────────────────────────────────
    # Strip markdown fences
    if raw.startswith("```"):
        lines = raw.split("\n")[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Direct JSON parse failed, trying json_repair")
        try:
            from json_repair import repair_json
            data = repair_json(raw, return_objects=True)
        except Exception as e2:
            logger.error("json_repair also failed: %s | raw=%s", e2, raw[:300])
            raise HTTPException(500, f"JSON parse error: {e2}")

    if not isinstance(data, dict):
        logger.error("Claude returned non-dict: %s | raw=%s", type(data), raw[:200])
        raise HTTPException(500, "Unexpected response format from Claude")

    # Βεβαιώσου ότι υπάρχει το κλειδί worksheets
    if "worksheets" not in data:
        logger.error("Missing 'worksheets' key | keys=%s | raw=%s", list(data.keys()), raw[:200])
        # Δες αν επέστρεψε μεμονωμένο worksheet αντί για array
        if "activities" in data:
            data = {"worksheets": [data]}
        else:
            raise HTTPException(500, f"Claude response missing 'worksheets' key. Got: {list(data.keys())}")

    logger.info("Worksheets generated successfully: %d worksheets", len(data.get("worksheets", [])))
    return data
