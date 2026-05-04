"""
api/dependencies.py
FastAPI dependencies για authentication & authorization.

Χρησιμοποιεί το Supabase Admin API για επαλήθευση JWT —
λειτουργεί με HS256 και ES256 (νέα Supabase projects).
"""

import os
from functools import lru_cache
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
        )
    return create_client(url, key)


def decode_supabase_jwt(token: str) -> dict:
    """
    Επαλήθευση JWT μέσω Supabase Admin API.
    Δουλεύει με HS256 και ES256 — το Supabase αναλαμβάνει την επαλήθευση.
    """
    try:
        response = _supabase().auth.get_user(token)
        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"sub": response.user.id, "email": response.user.email}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        bearer_scheme
    ),
) -> str:
    """
    FastAPI dependency — εξάγει το user UUID από το Bearer token.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_supabase_jwt(credentials.credentials)
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has no subject claim",
        )

    return user_id


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        bearer_scheme
    ),
) -> Optional[str]:
    """
    Ίδιο με get_current_user_id αλλά επιστρέφει None αν δεν υπάρχει token.
    """
    if credentials is None or not credentials.credentials:
        return None

    try:
        payload = decode_supabase_jwt(credentials.credentials)
        return payload.get("sub")
    except HTTPException:
        return None
