// app/api/school/join/route.ts
// Χρήστης αποδέχεται school invite.
//
// FIXES εφαρμοσμένα:
// - H-8: επαλήθευση ότι το email του user ταιριάζει με το invite.email
// - H-9: αν ο user έχει ενεργό Pro subscription, ακύρωσέ το πρώτα
// - Invalidation FastAPI rate-limiter cache μετά το join, ώστε ο user
//   να δει τα school όρια άμεσα (αντί να περιμένει 60s TTL).
// - RLS fix: οι εγγραφές στο school_members/school_invites/users γίνονται
//   με service role client, γιατί το RLS του school_members επιτρέπει
//   INSERT μόνο στον school owner. Ο joining user δεν μπορεί να γράψει
//   την εγγραφή του μέσω anon key.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const BACKEND_URL = process.env.BACKEND_API_URL || ''
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''

async function invalidateRateLimit(userId: string): Promise<void> {
  if (!BACKEND_URL || !INTERNAL_SECRET) return
  try {
    await fetch(`${BACKEND_URL}/api/internal/rate-limit/invalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ user_id: userId }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // best-effort — 60s TTL θα καθαρίσει αυτόματα
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export async function POST(request: Request) {
  // User client — μόνο για auth. Τα writes γίνονται με service client (βλ. παρακάτω).
  const supabase = createClient()
  const supa = createServiceClient()  // service role — bypass RLS για cross-user writes
  const { token } = await request.json()

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Πρέπει να εγγραφείς πρώτα' },
      { status: 401 },
    )
  }

  // Επαλήθευσε το token — service client ώστε να μη φράξει RLS σε school_invites
  const { data: invite } = await supa
    .from('school_invites')
    .select('id, school_owner_id, email, expires_at')
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invite) {
    return NextResponse.json(
      { error: 'Άκυρος ή ληγμένος σύνδεσμος πρόσκλησης' },
      { status: 400 },
    )
  }

  // ── H-8 fix: Email match check ─────────────────────────────────
  if (user.email?.toLowerCase() !== invite.email?.toLowerCase()) {
    return NextResponse.json(
      {
        error:
          'Η πρόσκληση είναι για διαφορετική διεύθυνση email. ' +
          'Συνδέσου με τον λογαριασμό που κλήθηκε.',
      },
      { status: 403 },
    )
  }

  // ── H-9 fix: Cancel existing Pro subscription ──────────────────
  const { data: existing } = await supa
    .from('users')
    .select('subscription_status, stripe_subscription_id')
    .eq('id', user.id)
    .single()

  if (
    existing?.subscription_status === 'pro' &&
    existing.stripe_subscription_id
  ) {
    try {
      await stripe.subscriptions.cancel(existing.stripe_subscription_id, {
        prorate: true,
      })
    } catch (err) {
      console.error('failed to cancel existing pro subscription', err)
      return NextResponse.json(
        {
          error:
            'Δεν κατέστη δυνατή η ακύρωση της υπάρχουσας Pro συνδρομής. ' +
            'Επικοινώνησε με την υποστήριξη.',
        },
        { status: 500 },
      )
    }
  }

  // Πρόσθεσε στα school members — service client γιατί το RLS επιτρέπει
  // INSERT μόνο στον owner (ο joining user δεν είναι owner).
  const { error: memberErr } = await supa.from('school_members').insert({
    school_owner_id: invite.school_owner_id,
    member_id: user.id,
    joined_at: new Date().toISOString(),
  })

  if (memberErr) {
    console.error('school member insert failed', memberErr)
    return NextResponse.json(
      { error: 'Failed to add member' },
      { status: 500 },
    )
  }

  // Update χρήστη — service client για consistency (ο user client θα λειτουργούσε
  // επίσης εδώ λόγω users_manage_own RLS, αλλά κρατάμε uniformity).
  await supa
    .from('users')
    .update({
      school_owner_id: invite.school_owner_id,
      subscription_status: 'school',
      stripe_subscription_id: null, // καθάρισε το ακυρωμένο sub
    })
    .eq('id', user.id)

  // Mark invite as accepted — service client (owner RLS μόνο για αυτό το table)
  await supa
    .from('school_invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('id', invite.id)

  // Invalidate FastAPI rate-limiter cache — ο user να δει school όρια άμεσα.
  // fire-and-forget, best-effort
  invalidateRateLimit(user.id).catch(() => {})

  return NextResponse.json({ success: true })
}
