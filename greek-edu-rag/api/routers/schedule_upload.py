"""
api/routers/schedule_upload.py

POST /api/schedules/parse-file

Δέχεται ένα αρχείο (CSV / Excel / εικόνα), το αναλύει και επιστρέφει
το ωρολόγιο πρόγραμμα σε JSON — χωρίς να το αποθηκεύει.
Ο χρήστης το βλέπει στο grid, κάνει τυχόν διορθώσεις και μετά
αποθηκεύει με POST /api/schedules.

Υποστηριζόμενοι τύποι:
  • CSV  (.csv)           — ημι-αυτόματη ανάλυση με csv module
  • Excel (.xls, .xlsx)   — ανάλυση με openpyxl
  • Εικόνα (.jpg,.jpeg,.png,.webp) — Claude Vision API (claude-sonnet-4-6)

Αναμενόμενη δομή CSV/Excel:
  Γραμμή κεφαλίδας: [κενό/αριθμός], Δευτέρα, Τρίτη, Τετάρτη, Πέμπτη, Παρασκευή
  Επόμενες γραμμές: 1η ώρα → 7η ώρα (ή 1 → 7)
  Κελιά: μάθημα (π.χ. "Μαθηματικά 45'", "Γλώσσα", κενό)

  Ευέλικτη ανάλυση: αναγνωρίζει διαφορετικά ονόματα ημερών, αριθμούς
  ωρών ως αριθμούς ή με υπογραμμισμό ("1η", "1", "Ώρα 1", κλπ).

Επιστρεφόμενο JSON:
  {
    "schedule": {
      "monday": [{"period":1,"subject":"Μαθηματικά","start":"08:00","duration":45}, ...],
      ...
    },
    "upload_method": "csv" | "excel" | "image_ocr",
    "notes": ["Δεν αναγνωρίστηκε η στήλη 'Σάββατο'", ...]  // warnings
  }
"""

from __future__ import annotations

import base64
import csv
import io
import json
import logging
import os
import re
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from api.dependencies import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/schedules", tags=["schedules"])

# ── Constants ───────────────────────────────────────────────────

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

DAY_ALIASES: dict[str, str] = {
    # Greek full
    "δευτέρα": "monday",  "τριτη": "tuesday",   "τρίτη": "tuesday",
    "τετάρτη": "wednesday", "τεταρτη": "wednesday",
    "πέμπτη": "thursday", "πεμπτη": "thursday",
    "παρασκευή": "friday", "παρασκευη": "friday",
    # Greek abbreviated
    "δευτ": "monday", "τρι": "tuesday", "τετ": "wednesday",
    "πεμ": "thursday", "παρ": "friday",
    # English
    "monday": "monday", "mon": "monday",
    "tuesday": "tuesday", "tue": "tuesday",
    "wednesday": "wednesday", "wed": "wednesday",
    "thursday": "thursday", "thu": "thursday",
    "friday": "friday", "fri": "friday",
}

PERIOD_STARTS = [
    "08:00", "08:45", "09:30", "10:15", "11:00", "11:45", "12:30",
]

DEFAULT_DURATION = 45


# ── Response model ───────────────────────────────────────────────

class ParsedSchedule(BaseModel):
    schedule: dict[str, list[dict[str, Any]]]
    upload_method: str
    notes: list[str] = []


# ── Helpers ──────────────────────────────────────────────────────

def _period_start(period: int) -> str:
    idx = period - 1
    if 0 <= idx < len(PERIOD_STARTS):
        return PERIOD_STARTS[idx]
    total = (period - 1) * DEFAULT_DURATION
    return f"{8 + total // 60:02d}:{total % 60:02d}"


def _normalize_day(raw: str) -> str | None:
    """Επιστρέφει το canonical day key ή None αν δεν αναγνωριστεί."""
    key = raw.strip().lower()
    # strip trailing punctuation / spaces
    key = re.sub(r"[^\w]", "", key)
    return DAY_ALIASES.get(key)


def _normalize_period(raw: str) -> int | None:
    """Εξάγει τον αριθμό ώρας από "1η", "1", "Ώρα 1", κλπ."""
    m = re.search(r"\d+", str(raw))
    if m:
        n = int(m.group())
        if 1 <= n <= 12:
            return n
    return None


def _parse_subject_cell(cell: str) -> tuple[str, int]:
    """
    Εξάγει μάθημα + διάρκεια από ένα κελί.
    Παραδείγματα: "Μαθηματικά 45'", "Γλώσσα (40)", "Φυσική", "45 Ιστορία"
    Επιστρέφει (subject, duration).
    """
    cell = cell.strip()
    if not cell:
        return "", DEFAULT_DURATION

    # Ψάξε αριθμό (διάρκεια)
    duration = DEFAULT_DURATION
    m = re.search(r"\b(\d{2,3})\b", cell)
    if m:
        candidate = int(m.group(1))
        if 15 <= candidate <= 180:
            duration = candidate
            cell = cell.replace(m.group(0), "").strip(" '()'")

    subject = re.sub(r"['\(\)\[\]]", "", cell).strip()
    return subject, duration


def _build_day_slots(
    day_cells: dict[int, str],  # period → raw cell text
) -> list[dict[str, Any]]:
    slots = []
    for period in sorted(day_cells.keys()):
        raw = day_cells[period]
        subject, duration = _parse_subject_cell(raw)
        if not subject:
            continue
        slots.append({
            "period": period,
            "subject": subject,
            "start": _period_start(period),
            "duration": duration,
        })
    return slots


def _grid_to_schedule(
    grid: list[list[str]],
) -> tuple[dict[str, list[dict]], list[str]]:
    """
    Μετατρέπει έναν 2D πίνακα (rows × cols) σε schedule dict.
    Υποθέτει: header row με ονόματα ημερών, πρώτη στήλη με αριθμούς ωρών.
    Επιστρέφει (schedule, notes).
    """
    notes: list[str] = []
    schedule: dict[str, list[dict]] = {
        "monday": [], "tuesday": [], "wednesday": [],
        "thursday": [], "friday": [],
    }

    if not grid:
        return schedule, ["Κενό αρχείο"]

    # Βρες header row (πρώτη γραμμή με τουλάχιστον 2 non-empty cells)
    header_row_idx = 0
    for i, row in enumerate(grid[:5]):
        non_empty = [c for c in row if str(c).strip()]
        if len(non_empty) >= 2:
            header_row_idx = i
            break

    header = grid[header_row_idx]

    # Map column index → day key
    col_to_day: dict[int, str] = {}
    for ci, cell in enumerate(header):
        day = _normalize_day(str(cell))
        if day:
            col_to_day[ci] = day
        elif str(cell).strip() and ci > 0:
            notes.append(f"Δεν αναγνωρίστηκε η στήλη «{cell}» ως ημέρα")

    if not col_to_day:
        notes.append(
            "Δεν βρέθηκαν ημέρες στην κεφαλίδα. "
            "Βεβαιώσου ότι η πρώτη γραμμή περιέχει: "
            "Δευτέρα, Τρίτη, Τετάρτη, Πέμπτη, Παρασκευή"
        )
        return schedule, notes

    # Map day → {period: cell}
    day_data: dict[str, dict[int, str]] = {d: {} for d in col_to_day.values()}
    period_counter: dict[str, int] = {d: 1 for d in col_to_day.values()}

    for row in grid[header_row_idx + 1:]:
        if not row or not any(str(c).strip() for c in row):
            continue

        # Πρώτη στήλη: αριθμός ώρας
        period = _normalize_period(str(row[0])) if row else None

        for ci, day in col_to_day.items():
            if ci >= len(row):
                continue
            cell = str(row[ci]).strip()
            if not cell:
                continue

            if period is not None:
                day_data[day][period] = cell
            else:
                # Auto-increment αν δεν υπάρχει αριθμός ώρας
                p = period_counter[day]
                day_data[day][p] = cell
                period_counter[day] += 1

    for day, cells in day_data.items():
        schedule[day] = _build_day_slots(cells)

    return schedule, notes


# ── Parsers ──────────────────────────────────────────────────────

def _parse_csv(content: bytes) -> tuple[dict[str, list[dict]], list[str]]:
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    grid = [row for row in reader]
    return _grid_to_schedule(grid)


def _parse_excel(content: bytes) -> tuple[dict[str, list[dict]], list[str]]:
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(
            422,
            "Η ανάλυση Excel απαιτεί openpyxl. "
            "Εκτέλεσε: pip install openpyxl"
        )

    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    grid = []
    for row in ws.iter_rows(values_only=True):
        grid.append([str(c) if c is not None else "" for c in row])
    return _grid_to_schedule(grid)


async def _parse_image(content: bytes, mime_type: str) -> tuple[dict[str, list[dict]], list[str]]:
    """
    Χρησιμοποιεί Claude Vision για OCR + δομική εξαγωγή ωρολογίου.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")

    import anthropic

    b64 = base64.standard_b64encode(content).decode()
    client = anthropic.Anthropic(api_key=api_key)

    system = (
        "Είσαι ειδικός στην ανάλυση ωρολογίων προγραμμάτων ελληνικών σχολείων. "
        "Εξάγεις το πρόγραμμα από εικόνες και επιστρέφεις ΜΟΝΟ έγκυρο JSON."
    )

    user = """Δες αυτή την εικόνα ωρολογίου προγράμματος δημοτικού σχολείου.
Εξήγαγε το πρόγραμμα και επέστρεψε JSON ακριβώς σε αυτό το format:

{
  "schedule": {
    "monday":    [{"period":1,"subject":"Μαθηματικά","start":"08:00","duration":45}, ...],
    "tuesday":   [...],
    "wednesday": [...],
    "thursday":  [...],
    "friday":    [...]
  },
  "notes": ["τυχόν σχόλια για αδύνατη ανάγνωση ή αμφίβολες τιμές"]
}

Κανόνες:
- Χρησιμοποίησε ΜΟΝΟ τα κλειδιά monday/tuesday/wednesday/thursday/friday
- period: ακέραιος 1-7
- subject: ελληνική ονομασία μαθήματος (π.χ. "Μαθηματικά", "Γλώσσα")
- duration: διάρκεια σε λεπτά (συνήθως 45, μπορεί να είναι 40 ή 50)
- start: ώρα έναρξης HH:MM (αν δεν φαίνεται, υπολόγισε από 08:00 + 45' ανά ώρα)
- Αν ένα κελί είναι κενό ή "Διάλειμμα", παράλειψέ το
- Απάντησε ΜΟΝΟ με JSON — χωρίς markdown, χωρίς εξηγήσεις"""

    try:
        msg = client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
            max_tokens=2048,
            system=system,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime_type,
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": user},
                ],
            }],
        )
    except Exception as e:
        logger.exception("Claude Vision failed: %s", e)
        raise HTTPException(502, f"Claude Vision error: {e}")

    raw = msg.content[0].text.strip()

    # Strip markdown fences
    if raw.startswith("```"):
        lines = raw.split("\n")[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        try:
            from json_repair import repair_json
            data = repair_json(raw, return_objects=True)
        except Exception as e2:
            raise HTTPException(500, f"Αδύνατη ανάλυση απάντησης Claude: {e2}")

    schedule = data.get("schedule", {})
    notes = data.get("notes", [])

    # Validate + normalize
    valid_keys = {"monday", "tuesday", "wednesday", "thursday", "friday"}
    clean: dict[str, list[dict]] = {k: [] for k in valid_keys}
    for day_key, slots in schedule.items():
        if day_key not in valid_keys:
            continue
        for slot in slots:
            if not isinstance(slot, dict) or not slot.get("subject"):
                continue
            clean[day_key].append({
                "period": int(slot.get("period", 1)),
                "subject": str(slot["subject"]),
                "start": str(slot.get("start", "08:00")),
                "duration": int(slot.get("duration", DEFAULT_DURATION)),
            })

    return clean, [str(n) for n in notes]


# ── Endpoint ─────────────────────────────────────────────────────

@router.post("/parse-file", response_model=ParsedSchedule)
async def parse_schedule_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
) -> ParsedSchedule:
    """
    Αναλύει ένα αρχείο ωρολογίου (CSV / Excel / εικόνα) και επιστρέφει
    το schedule JSON χωρίς αποθήκευση. Ο client το εμφανίζει στο grid
    για review πριν POST /api/schedules.

    Υποστηριζόμενα formats:
      - .csv             → csv module
      - .xls, .xlsx      → openpyxl
      - .jpg/.jpeg/.png/.webp → Claude Vision API
    """
    if not file.filename:
        raise HTTPException(422, "Δεν δόθηκε αρχείο")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            413,
            f"Το αρχείο υπερβαίνει το όριο {MAX_FILE_SIZE // 1024 // 1024} MB"
        )

    fname = file.filename.lower()
    notes: list[str] = []
    upload_method: str

    if fname.endswith(".csv"):
        upload_method = "csv"
        try:
            schedule, notes = _parse_csv(content)
        except Exception as e:
            logger.exception("CSV parse failed: %s", e)
            raise HTTPException(422, f"Σφάλμα ανάλυσης CSV: {e}")

    elif fname.endswith((".xls", ".xlsx")):
        upload_method = "csv"  # treat as structured
        try:
            schedule, notes = _parse_excel(content)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Excel parse failed: %s", e)
            raise HTTPException(422, f"Σφάλμα ανάλυσης Excel: {e}")

    elif fname.endswith((".jpg", ".jpeg", ".png", ".webp")):
        upload_method = "image_ocr"
        mime_map = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".webp": "image/webp",
        }
        ext = "." + fname.rsplit(".", 1)[-1]
        mime = mime_map.get(ext, "image/jpeg")
        schedule, notes = await _parse_image(content, mime)

    else:
        raise HTTPException(
            415,
            "Μη υποστηριζόμενος τύπος αρχείου. "
            "Χρησιμοποίησε CSV, Excel (.xlsx) ή εικόνα (JPG/PNG/WebP)."
        )

    # Σύνολο slots που βρέθηκαν
    total_slots = sum(len(v) for v in schedule.values())
    if total_slots == 0:
        notes.insert(0, "⚠️ Δεν βρέθηκαν μαθήματα. Βεβαιώσου για τη δομή του αρχείου.")

    logger.info(
        "parse-file user=%s method=%s file=%s slots=%d",
        user_id, upload_method, file.filename, total_slots,
    )

    return ParsedSchedule(
        schedule=schedule,
        upload_method=upload_method,
        notes=notes,
    )
