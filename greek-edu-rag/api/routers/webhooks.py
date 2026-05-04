"""
api/routers/webhooks.py

Stripe webhook handler — λαμβάνει events από το Stripe και ενημερώνει
τη βάση δεδομένων ανάλογα.

Endpoints:
    POST /api/webhooks/stripe

Events που χειριζόμαστε:
    checkout.session.completed        → ενεργοποίηση συνδρομής
    customer.subscription.updated     → αλλαγή plan / status
    customer.subscription.deleted     → ακύρωση
    invoice.payment_succeeded         → ανανέωση (reset usage αν χρειαστεί)
    invoice.payment_failed            → ειδοποίηση
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache

import stripe
from fastapi import APIRouter, HTTPException, Request
from supabase import Client, create_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@lru_cache(maxsize=1)
def _supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


def _stripe_plan_from_price(price_id: str) -> str:
    """Μετατρέπει Stripe price_id → EduPrompt plan name."""
    pro_price = os.getenv("STRIPE_PRO_PRICE_ID", "")
    school_price = os.getenv("STRIPE_SCHOOL_PRICE_ID", "")
    if price_id == pro_price:
        return "pro"
    if price_id == school_price:
        return "school"
    return "free"


def _status_to_plan(stripe_status: str, price_id: str | None = None) -> str:
    """Μετατρέπει Stripe subscription status → EduPrompt subscription_status."""
    if stripe_status in ("active", "trialing"):
        return _stripe_plan_from_price(price_id or "")
    if stripe_status == "past_due":
        return _stripe_plan_from_price(price_id or "")  # grace period
    if stripe_status == "paused":
        return "paused"
    return "free"  # canceled, incomplete, unpaid


@router.post("/stripe")
async def stripe_webhook(request: Request) -> dict:
    """
    Stripe webhook. Verifies signature πριν από κάθε επεξεργασία.
    Επιστρέφει πάντα 200 για να μην κάνει retry το Stripe σε non-critical errors.
    """
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        logger.error("STRIPE_WEBHOOK_SECRET not set")
        raise HTTPException(500, "Webhook secret not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
    except stripe.SignatureVerificationError:
        logger.warning("Invalid Stripe webhook signature")
        raise HTTPException(400, "Invalid signature")
    except Exception as e:
        logger.exception("Webhook construct failed: %s", e)
        raise HTTPException(400, "Bad payload")

    # Χρησιμοποιούμε json.loads(payload) αντί για το StripeObject
    # γιατί το Stripe SDK v15 επιστρέφει StripeObject που δεν υποστηρίζει .get()
    event_dict = json.loads(payload)
    event_type = event_dict["type"]
    data = event_dict["data"]["object"]
    logger.info("Stripe webhook: %s", event_type)

    try:
        if event_type == "checkout.session.completed":
            await _handle_checkout_completed(data)
        elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
            await _handle_subscription_change(data)
        elif event_type == "invoice.payment_succeeded":
            await _handle_payment_succeeded(data)
        elif event_type == "invoice.payment_failed":
            await _handle_payment_failed(data)
        else:
            logger.debug("Unhandled Stripe event: %s", event_type)
    except Exception as e:
        # Log αλλά επέστρεψε 200 — το Stripe δεν πρέπει να κάνει retry
        logger.exception("Webhook handler error for %s: %s", event_type, e)

    return {"received": True}


async def _handle_checkout_completed(session: dict) -> None:
    """Ενεργοποίηση συνδρομής μετά από επιτυχή πληρωμή."""
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    metadata = session.get("metadata") or {}
    client_ref = metadata.get("user_id") or session.get("client_reference_id")

    if not client_ref:
        logger.warning("checkout.session.completed missing user_id in metadata")
        return

    # Βρες plan από subscription
    plan = "pro"
    stripe_sub_id = None
    if subscription_id:
        try:
            sub = stripe.Subscription.retrieve(subscription_id)
            price_id = sub["items"]["data"][0]["price"]["id"]
            plan = _stripe_plan_from_price(price_id)
            stripe_sub_id = subscription_id
        except Exception as e:
            logger.warning("Could not retrieve subscription %s: %s", subscription_id, e)

    try:
        _supabase().table("users").update({
            "subscription_status": plan,
            "stripe_customer_id": customer_id,
            "stripe_subscription_id": stripe_sub_id,
        }).eq("id", client_ref).execute()
        logger.info("User %s activated plan=%s", client_ref, plan)
    except Exception as e:
        logger.exception("Failed to update user %s plan: %s", client_ref, e)


async def _handle_subscription_change(subscription: dict) -> None:
    """Ενημέρωση plan όταν αλλάζει ή ακυρώνεται η συνδρομή."""
    customer_id = subscription.get("customer")
    stripe_status = subscription.get("status", "")
    price_id = None
    try:
        price_id = subscription["items"]["data"][0]["price"]["id"]
    except (KeyError, IndexError):
        pass

    plan = _status_to_plan(stripe_status, price_id)

    try:
        _supabase().table("users").update({
            "subscription_status": plan,
        }).eq("stripe_customer_id", customer_id).execute()
        logger.info("Subscription change: customer=%s status=%s → plan=%s", customer_id, stripe_status, plan)
    except Exception as e:
        logger.exception("Failed to update subscription for customer %s: %s", customer_id, e)


async def _handle_payment_succeeded(invoice: dict) -> None:
    """Invoice paid — ανανέωση. Τίποτα extra χρειάζεται αν η subscription είναι ήδη active."""
    customer_id = invoice.get("customer")
    logger.info("Payment succeeded for customer=%s", customer_id)


async def _handle_payment_failed(invoice: dict) -> None:
    """Invoice payment failed — το Stripe θα ξαναδοκιμάσει. Καταγραφή μόνο."""
    customer_id = invoice.get("customer")
    attempt = invoice.get("attempt_count", 1)
    logger.warning(
        "Payment failed for customer=%s attempt=%d", customer_id, attempt
    )
