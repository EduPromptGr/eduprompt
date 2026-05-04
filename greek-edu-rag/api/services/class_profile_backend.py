"""
⚠️ DEPRECATED — αυτό το αρχείο έχει διαχωριστεί.

Το αρχικό περιείχε 3 "αρχεία-σε-ένα":
  1. service (build_class_context_prompt, extract_insights_from_observation)
  2. FastAPI router (endpoints)
  3. integration guide για το generate router (σε docstring)

Νέες θέσεις:
  api/services/class_profile_service.py  — logic
  api/routers/class_profile.py           — endpoints
  docs/CLASS_PROFILE_INTEGRATION.md      — integration guide (TODO)

Καθαρό import path για παλιά references:
"""

from api.services.class_profile_service import (  # noqa: F401
    build_class_context_prompt,
    extract_insights_from_observation,
    get_class_context_for_generate,
)

__all__ = [
    "build_class_context_prompt",
    "extract_insights_from_observation",
    "get_class_context_for_generate",
]
