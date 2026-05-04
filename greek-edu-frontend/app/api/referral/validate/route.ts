// app/api/referral/validate/route.ts
// Δημιουργεί referral record όταν νέος χρήστης εγγράφεται
//
// SECURITY (C-3): Παίρνει το referred_user_id από το authenticated session,
// ΟΧΙ από το request body — αλλιώς οποιοσδήποτε θα μπορούσε να αλλάξει
// το referred_by άλλων χρηστών.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createClient()

  // ── Auth check (C-3 fix) ────────────────────────────────────────
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { referral_code } = await request.json()

  if (!referral_code || typeof referral_code !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid referral_code' },
      { status: 400 },
    )
  }

  // Βρες τον referrer με το referral_code
  const { data: referrer } = await supabase
    .from('users')
    .select('id')
    .eq('referral_code', referral_code)
    .single()

  if (!referrer) {
    return NextResponse.json(
      { error: 'Invalid referral code' },
      { status: 404 },
    )
  }

  // Αποτροπή self-referral
  if (referrer.id === user.id) {
    return NextResponse.json(
      { error: 'Cannot refer yourself' },
      { status: 400 },
    )
  }

  // Δημιούργησε referral record (referred_id = ο authenticated user)
  const { error: insertError } = await supabase.from('referrals').insert({
    referrer_id: referrer.id,
    referred_id: user.id,
    status: 'pending',
  })

  if (insertError && insertError.code !== '23505') {
    // 23505 = unique_violation (ήδη υπάρχει referral)
    console.error('referral insert failed', insertError)
    return NextResponse.json(
      { error: 'Failed to create referral' },
      { status: 500 },
    )
  }

  // Update referred_by στον τρέχοντα χρήστη (μόνο τον εαυτό του)
  await supabase
    .from('users')
    .update({ referred_by: referrer.id })
    .eq('id', user.id)

  return NextResponse.json({ success: true })
}
