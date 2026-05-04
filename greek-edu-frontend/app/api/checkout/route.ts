// app/api/checkout/route.ts
//
// POST /api/checkout
// Δημιουργεί Stripe Checkout Session και επιστρέφει { url }.
//
// Flow:
//   1. Auth check (supabase.auth.getUser)
//   2. Validate plan ('pro' | 'school')
//   3. Αν ο user έχει ήδη active paid plan → 409
//   4. stripe.checkout.sessions.create με:
//        - customer_email pre-filled
//        - metadata: { user_id, plan }  ← το webhook χρησιμοποιεί αυτά
//        - success_url / cancel_url
//   5. Return { url } — το client κάνει redirect
//
// Env vars που χρειάζονται:
//   STRIPE_SECRET_KEY
//   STRIPE_PRO_PRICE_ID       ← από Stripe Dashboard > Products
//   STRIPE_SCHOOL_PRICE_ID
//   NEXT_PUBLIC_SITE_URL      ← για success/cancel URLs

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

const PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID!,
  school: process.env.STRIPE_SCHOOL_PRICE_ID!,
}

const PLAN_NAMES: Record<string, string> = {
  pro: 'EduPrompt Pro',
  school: 'EduPrompt Σχολείο',
}

export async function POST(request: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Validate plan ───────────────────────────────────────────
  let body: { plan?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const plan = body.plan
  if (!plan || !PRICE_IDS[plan]) {
    return NextResponse.json(
      { error: 'Μη έγκυρο πλάνο. Επίλεξε pro ή school.' },
      { status: 400 },
    )
  }

  // ── 3. Έλεγχος αν έχει ήδη ενεργό πλάνο ──────────────────────
  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status, stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (userData?.subscription_status === plan) {
    return NextResponse.json(
      { error: `Είσαι ήδη συνδρομητής του πλάνου ${PLAN_NAMES[plan]}.` },
      { status: 409 },
    )
  }

  // ── 4. Δημιουργία Stripe Checkout Session ─────────────────────
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://eduprompt.gr'

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      // Pre-fill email — ο user δεν χρειάζεται να το ξαναγράψει.
      customer_email: user.email,
      // Αν ο user έχει ήδη Stripe customer (π.χ. παλιός συνδρομητής)
      // χρησιμοποίησε τον ίδιο customer ώστε να κρατηθεί το ιστορικό.
      ...(userData?.stripe_customer_id
        ? { customer: userData.stripe_customer_id, customer_email: undefined }
        : {}),
      metadata: {
        user_id: user.id,   // ← το webhook διαβάζει αυτό
        plan,               // ← και αυτό
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
        },
      },
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/cancel?plan=${plan}`,
      // Προτιμητέα γλώσσα checkout page — το Stripe δεν έχει el,
      // χρησιμοποιούμε auto (browser language detection).
      locale: 'auto',
      // Επιτρέπουμε promotion codes (για referral codes κλπ.)
      allow_promotion_codes: true,
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('stripe checkout session creation failed', err)
    return NextResponse.json(
      { error: 'Αδυναμία δημιουργίας checkout. Δοκίμασε ξανά.' },
      { status: 500 },
    )
  }
}
