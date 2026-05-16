#!/usr/bin/env python3
"""
scripts/seed_pinecone.py

Seeds το Pinecone index με ΑΠΣ excerpts + (optional) past scenarios.

Input format (JSONL, ένα entry per line):
    {
        "grade": "Δ",
        "subject": "Μαθηματικά",
        "unit": "Κλάσματα",             // optional
        "chapter": "Ισοδύναμα κλάσματα", // optional
        "source": "ΑΠΣ-2021-Δ-ΜΑΘ-p.47", // unique identifier
        "text": "Οι μαθητές ..."
    }

Usage:
    # Bootstrap (first time) — creates index if missing
    python scripts/seed_pinecone.py --input scripts/data/sample_curriculum.jsonl \\
        --namespace curriculum --bootstrap

    # Incremental
    python scripts/seed_pinecone.py --input path/to/new_entries.jsonl \\
        --namespace curriculum

    # Dry-run (no API calls)
    python scripts/seed_pinecone.py --input scripts/data/sample_curriculum.jsonl \\
        --dry-run

Env vars required:
    PINECONE_API_KEY
    PINECONE_INDEX   (default: eduprompt-curriculum)
    PINECONE_CLOUD   (default: aws)
    PINECONE_REGION  (default: us-east-1)
    EMBED_MODEL      (default: multilingual-e5-large, dim=1024)

Idempotent:
    Το vector_id γίνεται deterministic hash από (source + chunk_index),
    ώστε re-runs να κάνουν upsert overwrite, όχι duplicates.

Chunking:
    - Αν text > 1400 chars, χωρίζεται σε chunks των ~1000 chars με 150
      chars overlap.
    - Αλλιώς μπαίνει ως single chunk.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

try:
    from pinecone import Pinecone, ServerlessSpec
except ImportError:
    print("ERROR: pinecone package missing. Run: pip install pinecone>=5.0", file=sys.stderr)
    sys.exit(1)


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s — %(message)s",
)
logger = logging.getLogger("seed_pinecone")


# ── Config ─────────────────────────────────────────────────────

DEFAULT_INDEX_NAME = os.getenv("PINECONE_INDEX", "eduprompt-curriculum")
DEFAULT_CLOUD = os.getenv("PINECONE_CLOUD", "aws")
DEFAULT_REGION = os.getenv("PINECONE_REGION", "us-east-1")
EMBED_MODEL = os.getenv("EMBED_MODEL", "multilingual-e5-large")
EMBED_DIM = 1024           # multilingual-e5-large
MAX_CHUNK_CHARS = 1000
CHUNK_OVERLAP_CHARS = 150
MIN_CHUNK_CHARS = 60        # skip tiny chunks (headers etc.)
EMBED_BATCH_SIZE = 64       # Pinecone Inference API — συντηρητικό batch size
UPSERT_BATCH_SIZE = 100     # Pinecone recommends <= 100/request


VALID_GRADES = {"Α", "Β", "Γ", "Δ", "Ε", "ΣΤ"}
VALID_SUBJECTS = {
    "Μαθηματικά", "Γλώσσα", "Μελέτη Περιβάλλοντος",
    "Ιστορία", "Φυσική", "Γεωγραφία",
}


# ── Data shapes ────────────────────────────────────────────────

@dataclass
class SourceEntry:
    grade: str
    subject: str
    source: str
    text: str
    unit: Optional[str] = None
    chapter: Optional[str] = None


@dataclass
class Chunk:
    vector_id: str
    text: str
    metadata: dict


# ── Helpers ────────────────────────────────────────────────────

def _validate_entry(raw: dict, line_no: int) -> Optional[SourceEntry]:
    """Επιστρέφει SourceEntry ή None αν είναι invalid — logs το reason."""
    for field in ("grade", "subject", "source", "text"):
        if not raw.get(field):
            logger.warning("Line %d: missing required field %r — skipping", line_no, field)
            return None

    if raw["grade"] not in VALID_GRADES:
        logger.warning("Line %d: invalid grade %r — skipping", line_no, raw["grade"])
        return None

    if raw["subject"] not in VALID_SUBJECTS:
        logger.warning(
            "Line %d: non-standard subject %r — proceeding anyway",
            line_no, raw["subject"],
        )

    text = (raw["text"] or "").strip()
    if len(text) < MIN_CHUNK_CHARS:
        logger.warning(
            "Line %d: text too short (%d chars) — skipping",
            line_no, len(text),
        )
        return None

    return SourceEntry(
        grade=raw["grade"],
        subject=raw["subject"],
        source=str(raw["source"]).strip(),
        text=text,
        unit=(raw.get("unit") or None),
        chapter=(raw.get("chapter") or None),
    )


def _chunk_text(text: str) -> list[str]:
    """
    Word-aware chunking. Κόβει σε ~1000-char windows με 150-char overlap.
    Δεν σπάει λέξη στη μέση.
    """
    text = " ".join(text.split())  # collapse whitespace
    if len(text) <= MAX_CHUNK_CHARS:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + MAX_CHUNK_CHARS
        if end >= len(text):
            chunks.append(text[start:].strip())
            break
        # βρες την τελευταία λέξη-σύνορο
        slice_ = text[start:end]
        last_space = slice_.rfind(" ")
        if last_space > MAX_CHUNK_CHARS * 0.7:
            end = start + last_space
        chunks.append(text[start:end].strip())
        start = end - CHUNK_OVERLAP_CHARS
    return [c for c in chunks if len(c) >= MIN_CHUNK_CHARS]


def _make_vector_id(source: str, chunk_index: int) -> str:
    """Deterministic ID — ίδιο source+index = ίδιο ID → idempotent upsert."""
    h = hashlib.sha1(f"{source}::{chunk_index}".encode("utf-8")).hexdigest()[:16]
    return f"doc-{h}"


def _entry_to_chunks(entry: SourceEntry) -> list[Chunk]:
    pieces = _chunk_text(entry.text)
    chunks: list[Chunk] = []
    for i, piece in enumerate(pieces):
        meta: dict = {
            "grade": entry.grade,
            "subject": entry.subject,
            "source": entry.source,
            "text": piece,
            "chunk_index": i,
        }
        if entry.unit:
            meta["unit"] = entry.unit
        if entry.chapter:
            meta["chapter"] = entry.chapter
        chunks.append(
            Chunk(
                vector_id=_make_vector_id(entry.source, i),
                text=piece,
                metadata=meta,
            )
        )
    return chunks


def _read_jsonl(path: Path) -> Iterator[SourceEntry]:
    with path.open("r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, start=1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as e:
                logger.error("Line %d: invalid JSON — %s", lineno, e)
                continue
            entry = _validate_entry(raw, lineno)
            if entry:
                yield entry


# ── Pinecone Inference ─────────────────────────────────────────

def _ensure_index(pc: Pinecone, index_name: str) -> None:
    """Δημιουργεί το index αν δεν υπάρχει (bootstrap mode)."""
    existing = {i["name"] for i in pc.list_indexes()}
    if index_name in existing:
        logger.info("Index %r already exists", index_name)
        return
    logger.info("Creating index %r (dim=%d, metric=cosine, %s/%s)…",
                index_name, EMBED_DIM, DEFAULT_CLOUD, DEFAULT_REGION)
    pc.create_index(
        name=index_name,
        dimension=EMBED_DIM,
        metric="cosine",
        spec=ServerlessSpec(cloud=DEFAULT_CLOUD, region=DEFAULT_REGION),
    )
    # Wait for index to be ready
    for _ in range(30):
        desc = pc.describe_index(index_name)
        if desc.status.get("ready"):
            logger.info("Index %r ready", index_name)
            return
        time.sleep(2)
    logger.warning("Index creation timeout — continuing anyway")


def _embed_batch(pc: Pinecone, texts: list[str]) -> list[list[float]]:
    """
    Embed a batch χρησιμοποιώντας Pinecone Inference API.
    input_type="passage" για indexing (vs "query" για search queries).
    Retry-once σε network/API errors.
    """
    for attempt in (1, 2):
        try:
            result = pc.inference.embed(
                model=EMBED_MODEL,
                inputs=texts,
                parameters={"input_type": "passage", "truncate": "END"},
            )
            return [item.values for item in result]
        except Exception as e:
            if attempt == 1:
                logger.warning("Embed batch failed (attempt 1): %s — retrying in 3s", e)
                time.sleep(3)
            else:
                raise


def _upsert_batch(index, namespace: str, vectors: list[dict]) -> None:
    """Pinecone upsert με retry-once."""
    for attempt in (1, 2):
        try:
            index.upsert(vectors=vectors, namespace=namespace)
            return
        except Exception as e:
            if attempt == 1:
                logger.warning("Upsert batch failed (attempt 1): %s — retrying", e)
                time.sleep(2)
            else:
                raise


# ── Main ───────────────────────────────────────────────────────

def seed(
    input_path: Path,
    namespace: str,
    bootstrap: bool,
    dry_run: bool,
) -> tuple[int, int]:
    """
    Returns (num_entries, num_chunks_upserted).
    """
    entries = list(_read_jsonl(input_path))
    if not entries:
        logger.error("No valid entries found in %s", input_path)
        return 0, 0

    all_chunks: list[Chunk] = []
    for e in entries:
        all_chunks.extend(_entry_to_chunks(e))

    logger.info("Parsed %d entries → %d chunks", len(entries), len(all_chunks))

    if dry_run:
        logger.info("DRY RUN — no API calls")
        for c in all_chunks[:3]:
            logger.info("Sample chunk: id=%s meta=%s text=%r",
                        c.vector_id, {k: v for k, v in c.metadata.items() if k != "text"},
                        c.text[:80] + "…" if len(c.text) > 80 else c.text)
        return len(entries), 0

    # Init Pinecone client (no OpenAI needed!)
    pc_key = os.getenv("PINECONE_API_KEY", "").strip()
    if not pc_key:
        raise RuntimeError("PINECONE_API_KEY is required")
    pc = Pinecone(api_key=pc_key)

    if bootstrap:
        _ensure_index(pc, DEFAULT_INDEX_NAME)
    index = pc.Index(DEFAULT_INDEX_NAME)

    # Embed + upsert in batches
    upserted = 0
    total_batches = (len(all_chunks) + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE
    for batch_no, i in enumerate(range(0, len(all_chunks), EMBED_BATCH_SIZE), start=1):
        batch = all_chunks[i:i + EMBED_BATCH_SIZE]
        texts = [c.text for c in batch]
        logger.info("Embedding batch %d/%d (%d chunks)…", batch_no, total_batches, len(texts))
        try:
            vectors_embeddings = _embed_batch(pc, texts)
        except Exception as e:
            logger.error("Embed batch %d failed — skipping: %s", batch_no, e)
            continue

        pine_vectors = [
            {
                "id": c.vector_id,
                "values": emb,
                "metadata": c.metadata,
            }
            for c, emb in zip(batch, vectors_embeddings)
        ]

        for j in range(0, len(pine_vectors), UPSERT_BATCH_SIZE):
            sub = pine_vectors[j:j + UPSERT_BATCH_SIZE]
            try:
                _upsert_batch(index, namespace, sub)
                upserted += len(sub)
                logger.info("Upserted %d/%d (namespace=%s)",
                            upserted, len(all_chunks), namespace)
            except Exception as e:
                logger.error("Upsert batch failed — skipping %d vectors: %s", len(sub), e)

    logger.info("DONE — entries=%d chunks=%d upserted=%d",
                len(entries), len(all_chunks), upserted)
    return len(entries), upserted


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Seed Pinecone index με ΑΠΣ excerpts (JSONL input).",
    )
    ap.add_argument("--input", required=True, type=Path,
                    help="Path σε .jsonl αρχείο με entries")
    ap.add_argument("--namespace", default="curriculum",
                    help="Pinecone namespace (default: curriculum)")
    ap.add_argument("--bootstrap", action="store_true",
                    help="Δημιουργία index αν λείπει")
    ap.add_argument("--dry-run", action="store_true",
                    help="Validate + chunk χωρίς API calls")
    args = ap.parse_args()

    if not args.input.exists():
        logger.error("Input file not found: %s", args.input)
        return 2

    try:
        n, up = seed(
            input_path=args.input,
            namespace=args.namespace,
            bootstrap=args.bootstrap,
            dry_run=args.dry_run,
        )
    except Exception as e:
        logger.exception("Seeding failed: %s", e)
        return 1

    if not args.dry_run and up == 0 and n > 0:
        logger.error("Entries parsed but nothing upserted — check errors above")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
