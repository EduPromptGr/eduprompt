// app/api/webhooks/stripe/route.ts
// Stripe webhook handler — η μόνη εξωτερική entry point για subscription
// lifecycle events. Όλη η business logic για referral rewards /
// MRR tracking / subscription status updates περνάει από εδώ.
//
// SECURITY:
// - Verify Stripe signature με constructEvent() (H-7 fix)
// - Ιδιαίτερο Next config για να πάρουμε raw body (απαιτείται για sig check)
//
// Webhook URL στο Stripe dashboard:
//   https://eduprompt.gr/api/webhooks/stripe

import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, invoicePaidEmail } from '@/lib/emails'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs' // crypto needed for sig verification
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!
// URL του FastAPI backend — για cache invalidation στον rate_limiter
const BACKEND_URL = process.env.BACKEND_API_URL || ''

export async function POST(request: Request) {
  // ── 1. Verify Stripe signature ─────────────────────────────────
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET)
  } catch (err) {
    console.error('webhook signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // ── 2. Idempotency — έχουμε ήδη δει αυτό το event; ─────────────
  const { data: existing } = await supabase
    .from('subscription_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true, deduplicated: true })
  }

  // ── 3. Handle event type ───────────────────────────────────────
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id,
          supabase,
          request.url,
        )
        break

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(
          event.data.object as Stripe.Subscription,
          event.id,
          event.type,
          supabase,
        )
        break

      case 'invoice.paid':
        await handleInvoicePaid(
          event.data.object as Stripe.Invoice,
          event.id,
          supabase,
        )
        break

      default:
        // Unhandled event type — log only
        console.log(`[stripe webhook] unhandled type: ${event.type}`)
    }
  } catch (err) {
    console.error(`webhook handler failed for ${event.type}`, err)
    // Επιστρέφουμε 500 ώστε το Stripe να κάνει retry
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ── Handler helpers ────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
  supabase: ReturnType<typeof createServiceClient>,
  webhookUrl: string,
) {
  const userId = session.metadata?.user_id
  const plan = session.metadata?.plan // 'pro' | 'school'
  const customerId =
    typeof session.customer === 'string' ? session.customer : null
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : null

  if (!userId || !plan) {
    console.warn('checkout.session.completed χωρίς metadata', session.id)
    return
  }

  // Update user → paid plan
  await supabase
    .from('users')
    .update({
      subscription_status: plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    })
    .eq('id', userId)

  // Log event (MRR tracking)
  // LTV ΔΕΝ αυξάνεται εδώ — το invoice.paid handler το κάνει.
  // Αν και το checkout και το invoice.paid καλούσαν increment_user_ltv,
  // το πρώτο invoice θα μετρούσε δύο φορές (double-count bug).
  const planPrice = plan === 'school' ? 79.99 : 14.99
  await supabase.from('subscription_events').insert({
    user_id: userId,
    event_type: 'converted',
    plan,
    mrr_impact: planPrice,
    stripe_event_id: eventId,
    metadata: { session_id: session.id },
  })

  // Referral reward — κάλεσε internal endpoint
  await triggerReferralReward(userId, webhookUrl)

  // Invalidate rate-limiter cache στο FastAPI ώστε ο user να
  // δει άμεσα το νέο όριο (όχι μετά από 60s TTL).
  await invalidateRateLimitCache(userId)
}

async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  eventId: string,
  eventType: string,
  supabase: ReturnType<typeof createServiceClient>,
) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : null
  if (!customerId) return

  const { data: userData } = await supabase
    .from('users')
    .select('id, subscription_status')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!userData) return

  const isActive =
    subscription.status === 'active' || subscription.status === 'trialing'
  const newStatus = isActive
    ? userData.subscription_status === 'free'
      ? 'pro'
      : userData.subscription_status
    : 'free'

  await supabase
    .from('users')
    .update({
      subscription_status: newStatus,
      stripe_subscription_id: isActive ? subscription.id : null,
    })
    .eq('id', userData.id)

  // Αν άλλαξε το plan, καθάρισε το rate-limiter cache
  if (newStatus !== userData.subscription_status) {
    await invalidateRateLimitCache(userData.id)
  }

  if (!isActive && userData.subscription_status !== 'free') {
    const planPrice =
      userData.subscription_status === 'school' ? 79.99 : 14.99
    await supabase.from('subscription_events').insert({
      user_id: userData.id,
      event_type:
        eventType === 'customer.subscription.deleted' ? 'churned' : 'updated',
      plan: userData.subscription_status,
      mrr_impact: -planPrice,
      stripe_event_id: eventId,
      metadata: { stripe_status: subscription.status },
    })
  }
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  eventId: string,
  supabase: ReturnType<typeof createServiceClient>,
) {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : null
  if (!customerId || !invoice.amount_paid) return

  const { data: userData } = await supabase
    .from('users')
    .select('id, email, subscription_status')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!userData) return

  const amount = invoice.amount_paid / 100

  await supabase.from('subscription_events').insert({
    user_id: userData.id,
    event_type: 'invoice_paid',
    plan: userData.subscription_status,
    mrr_impact: 0, // ενημερώνεται μέσω LTV
    stripe_event_id: eventId,
    metadata: { invoice_id: invoice.id, amount },
  })

  await supabase.rpc('increment_user_ltv', {
    p_user_id: userData.id,
    p_amount: amount,
  })

  // Στείλε branded confirmation email (παράλληλα με το Stripe receipt).
  // Skip όταν:
  // - Ο user δεν έχει email (δεν πρέπει να συμβαίνει, αλλά defense-in-depth)
  // - Το invoice είναι $0 (π.χ. μετά από referral credit)
  // - Ο χρήστης είναι σε free plan (δεν έχει νόημα thank-you)
  if (
    userData.email &&
    amount > 0 &&
    userData.subscription_status !== 'free'
  ) {
    const result = await sendEmail({
      to: userData.email,
      ...invoicePaidEmail({
        amount,
        plan: userData.subscription_status,
        paidAt: invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : new Date(),
        invoiceUrl: invoice.hosted_invoice_url || undefined,
      }),
      tags: [
        { name: 'category', value: 'invoice_paid' },
        { name: 'plan', value: userData.subscription_status || 'unknown' },
      ],
    })

    if (!result.ok) {
      // Non-fatal — το Stripe στέλνει κιόλας δικό του receipt
      console.error('invoice_paid email failed:', result.error)
    }
  }
}

async function invalidateRateLimitCache(userId: string) {
  // Best-effort call — αν αποτύχει, ο user απλά περιμένει τον 60s TTL.
  // ΔΕΝ κάνουμε throw — ένα failed invalidation δεν πρέπει να σταματήσει
  // το webhook (αλλιώς το Stripe θα κάνει retry και θα πάρουμε duplicate
  // subscription_events, ακόμα και με το idempotency check).
  if (!BACKEND_URL) {
    console.warn('BACKEND_API_URL missing — skipping rate-limit invalidation')
    return
  }
  try {
    const res = await fetch(`${BACKEND_URL}/api/internal/rate-limit/invalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ user_id: userId }),
    })
    if (!res.ok) {
      console.warn(`rate-limit invalidation returned ${res.status}`)
    }
  } catch (err) {
    console.warn('rate-limit invalidation failed', err)
  }
}

async function triggerReferralReward(userId: string, webhookUrl: string) {
  // Build το URL του internal endpoint από το current webhook URL
  const url = new URL(webhookUrl)
  url.pathname = '/api/referral/reward'
  url.search = ''

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ referred_user_id: userId }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`referral reward returned ${res.status}: ${text}`)
    }
  } catch (err) {
    // Μη μπλοκάρεις το webhook αν αποτύχει — το reward είναι
    // "nice to have", η συνδρομή πρέπει να περνά κανονικά.
    console.error('referral reward trigger failed', err)
  }
}
