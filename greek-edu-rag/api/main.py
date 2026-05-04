"""
api/main.py — FastAPI entry point για το EduPrompt backend.

Routers:
- /api/generate            (scenario generator + quota)
- /api/prompts/*           (CRUD αποθηκευμένων σεναρίων)
- /api/journal/*           (παιδαγωγικό ημερολόγιο)
- /api/school/*            (school plan management)
- /api/referral/*          (referral program)
- /api/admin/*             (error reports — admin only)
- /api/webhooks/*          (Stripe webhooks)
- /api/class/*             (class profile endpoints)
- /api/internal/*          (service-to-service)

LLM: Anthropic Claude (ANTHROPIC_API_KEY)
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Φόρτωσε .env αν υπάρχει (για local development)
load_dotenv()

from api.routers import (
    class_profile,
    error_reports,
    generate,
    internal,
    journal,
    prompts,
    referral,
    school,
    webhooks,
    worksheets,
)


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)


app = FastAPI(
    title="EduPrompt API",
    description="Greek AI-powered teaching scenarios — powered by Anthropic Claude",
    version="1.0.0",
)


_allowed_origins = [
    o.strip()
    for o in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,https://eduprompt.gr",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ── Routers ─────────────────────────────────────────────────────
app.include_router(generate.router)
app.include_router(prompts.router)
app.include_router(journal.router)
app.include_router(school.router)
app.include_router(referral.router)
app.include_router(error_reports.router)
app.include_router(webhooks.router)
app.include_router(class_profile.router)
app.include_router(worksheets.router)
app.include_router(internal.router)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "eduprompt-api",
        "version": "1.0.0",
        "llm": "anthropic-claude",
    }
