// app/api/referral/reward/route.ts
// Internal endpoint — καλείται μόνο από το /api/webhooks/stripe handler.
//
// SECURITY (H-7): Προστατεύεται με INTERNAL_API_SECRET header.
// Δεν δέχεται απευθείας POST από έξω. Η Stripe webhook δουλειά
// γίνεται στο /api/webhooks/stripe/route.ts (signature verification εκεί).

import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, referralRewardEmail } from '@/lib/emails'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export async function POST(request: Request) {
  // ── Internal-only auth (H-7 fix) ────────────────────────────────
  const internalSecret = request.headers.get('x-internal-secret')
  if (
    !process.env.INTERNAL_API_SECRET ||
    internalSecret !== process.env.INTERNAL_API_SECRET
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Service-role client — bypass RLS για cross-user updates
  const supabase = createServiceClient()
  const { referred_user_id } = await request.json()

  if (!referred_user_id) {
    return NextResponse.json(
      { error: 'Missing referred_user_id' },
      { status: 400 },
    )
  }

  // Βρες pending referral
  const { data: referral } = await supabase
    .from('referrals')
    .select('*, referrer:referrer_id(id, email, stripe_customer_id)')
    .eq('referred_id', referred_user_id)
    .eq('status', 'pending')
    .single()

  if (!referral) {
    return NextResponse.json({ skipped: true, reason: 'no pending referral' })
  }

  try {
    // Δώσε credit στον referrer μέσω Stripe
    if (referral.referrer?.stripe_customer_id) {
      await stripe.customers.createBalanceTransaction(
        referral.referrer.stripe_customer_id,
        {
          amount: -1499, // €14.99 σε cents, αρνητικό = credit
          currency: 'eur',
          description: 'Referral reward — 1 μήνας Pro',
        },
      )
    }

    // Update status σε rewarded
    await supabase
      .from('referrals')
      .update({
        status: 'rewarded',
        rewarded_at: new Date().toISOString(),
      })
      .eq('id', referral.id)

    // Στείλε email στον referrer (best-effort)
    if (referral.referrer?.email) {
      await sendEmail({
        to: referral.referrer.email,
        ...referralRewardEmail({
          referrerEmail: referral.referrer.email,
          months: 1,
        }),
        tags: [{ name: 'category', value: 'referral_reward' }],
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('reward processing failed', err)
    return NextResponse.json(
      { error: 'Failed to process reward' },
      { status: 500 },
    )
  }
}
