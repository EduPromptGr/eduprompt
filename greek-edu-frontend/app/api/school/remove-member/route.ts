// app/api/school/remove-member/route.ts
//
// Αφαιρεί μέλος από το school plan του owner.
// Ο owner μπορεί να αφαιρέσει οποιοδήποτε μέλος του.
// Το μέλος επιστρέφει αυτόματα σε free plan.
//
// Bug fixes:
// - Καθαρίζει τη γραμμή από το school_members table (πριν έμενε stale).
// - Invalidate FastAPI rate-limiter cache ώστε ο πρώην member να χάσει
//   άμεσα τα school όρια, όχι μετά από 60s TTL.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const BACKEND_URL = process.env.BACKEND_API_URL || ''
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''

async function invalidateMemberRateLimit(memberId: string): Promise<void> {
  if (!BACKEND_URL || !INTERNAL_SECRET) return
  try {
    await fetch(`${BACKEND_URL}/api/internal/rate-limit/invalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ user_id: memberId }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // best-effort — 60s TTL θα καθαρίσει αυτόματα
  }
}

export async function POST(request: Request) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const memberId = body?.member_id
  if (!memberId || typeof memberId !== 'string') {
    return NextResponse.json({ error: 'member_id required' }, { status: 400 })
  }

  // Verify ότι ο caller είναι school owner
  const { data: caller } = await supabase
    .from('users')
    .select('subscription_status, school_owner_id')
    .eq('id', user.id)
    .single()

  if (
    caller?.subscription_status !== 'school' ||
    caller?.school_owner_id != null
  ) {
    return NextResponse.json(
      { error: 'School owner access required' },
      { status: 403 },
    )
  }

  // Verify ότι το μέλος ανήκει σε αυτόν τον owner
  const { data: member } = await supabase
    .from('users')
    .select('id, school_owner_id')
    .eq('id', memberId)
    .single()

  if (!member || member.school_owner_id !== user.id) {
    return NextResponse.json(
      { error: 'Το μέλος δεν ανήκει στο σχολείο σου' },
      { status: 403 },
    )
  }

  // Αφαίρεση: καθάρισε school_owner_id + υποβίβασε σε free
  const { error } = await supabase
    .from('users')
    .update({
      school_owner_id: null,
      subscription_status: 'free',
    })
    .eq('id', memberId)

  if (error) {
    console.error('remove-member failed', error)
    return NextResponse.json(
      { error: 'Αποτυχία αφαίρεσης μέλους' },
      { status: 500 },
    )
  }

  // Καθάρισε τη γραμμή από το school_members table.
  // Αποτυχία εδώ είναι non-fatal (το users update ήδη έγινε) — η
  // stale γραμμή δεν δίνει access, απλά εμφανίζει τον user στα reports.
  const { error: memberErr } = await supabase
    .from('school_members')
    .delete()
    .eq('school_owner_id', user.id)
    .eq('member_id', memberId)

  if (memberErr) {
    console.warn('remove-member: school_members cleanup failed', memberErr)
  }

  // Invalidate FastAPI rate-limiter cache — ο user να χάσει άμεσα τα school όρια.
  // fire-and-forget, best-effort
  invalidateMemberRateLimit(memberId).catch(() => {})

  return NextResponse.json({ success: true })
}
