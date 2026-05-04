// app/api/subscription/pause/route.ts
// Παύει τη συνδρομή για 1-3 μήνες (καλοκαιρινό feature).
//
// H-3 fix: dynamic plan price (Pro €14.99 / School €79.99).

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

const PLAN_PRICES: Record<string, number> = {
  pro: 14.99,
  school: 79.99,
}

export async function POST(request: Request) {
  const supabase = createClient()
  const body = await request.json()
  const months = Number(body?.months)

  if (!Number.isInteger(months) || months < 1 || months > 3) {
    return NextResponse.json(
      { error: 'Η παύση πρέπει να είναι 1-3 μήνες' },
      { status: 400 },
    )
  }

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status, stripe_subscription_id')
    .eq('id', user.id)
    .single()

  if (!userData || userData.subscription_status === 'free') {
    return NextResponse.json(
      { error: 'Δεν έχεις ενεργή συνδρομή' },
      { status: 400 },
    )
  }

  if (!userData.stripe_subscription_id) {
    return NextResponse.json(
      { error: 'Δεν βρέθηκε Stripe subscription' },
      { status: 400 },
    )
  }

  try {
    const pauseUntil = new Date()
    pauseUntil.setMonth(pauseUntil.getMonth() + months)

    await stripe.subscriptions.update(userData.stripe_subscription_id, {
      pause_collection: {
        behavior: 'void',
        resumes_at: Math.floor(pauseUntil.getTime() / 1000),
      },
    })

    // Update στη βάση
    await supabase
      .from('users')
      .update({ pause_until: pauseUntil.toISOString() })
      .eq('id', user.id)

    // Καταγραφή event με σωστή τιμή plan (H-3 fix)
    const planPrice = PLAN_PRICES[userData.subscription_status] ?? 0

    await supabase.from('subscription_events').insert({
      user_id: user.id,
      event_type: 'paused',
      plan: userData.subscription_status,
      mrr_impact: -(planPrice * months),
      metadata: {
        pause_months: months,
        pause_until: pauseUntil.toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      pause_until: pauseUntil.toISOString(),
      message: `Η συνδρομή σου παύει μέχρι ${pauseUntil.toLocaleDateString('el-GR')}`,
    })
  } catch (err) {
    console.error('subscription pause failed', err)
    return NextResponse.json(
      { error: 'Failed to pause subscription' },
      { status: 500 },
    )
  }
}
