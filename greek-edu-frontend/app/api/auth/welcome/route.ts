// app/api/auth/welcome/route.ts
//
// Στέλνει welcome email στον τρέχοντα authenticated user — μία φορά.
//
// Χρήση από το client:
//   await fetch('/api/auth/welcome', { method: 'POST' })
//
// Πότε καλείται:
// - Μετά από επιτυχημένο signup + email verification (δηλαδή το πρώτο login)
// - Ή από την onboarding σελίδα στο completion step
//
// Idempotency:
// Χρησιμοποιούμε το υπάρχον `onboarding_completed_at` column ως marker.
// Αν είναι set, επιστρέφουμε { skipped: true } χωρίς να ξαναστείλουμε email.
// Το κλειδί: τo column γίνεται set ΜΕΤΑ την επιτυχή αποστολή, άρα ένα
// retry μετά από email failure θα δοκιμάσει ξανά.
//
// Security:
// Requires authenticated session (auth.getUser()) — δεν μπορεί κάποιος
// να σπαμάρει welcome emails σε ξένα accounts.

import { createClient } from '@/lib/supabase/server'
import { sendEmail, welcomeEmail } from '@/lib/emails'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = createClient()

  // ── Auth ────────────────────────────────────────────────────────
  // Δύο τρόποι auth:
  // 1. Cookie-based (browser calls from /profile etc.)
  // 2. Bearer JWT (server-to-server call από /api/auth/callback)
  let user
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7)
    const { data } = await supabase.auth.getUser(jwt)
    user = data.user
  } else {
    const { data } = await supabase.auth.getUser()
    user = data.user
  }

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Idempotency check ──────────────────────────────────────────
  const { data: row, error: fetchErr } = await supabase
    .from('users')
    .select('id, email, onboarding_completed_at')
    .eq('id', user.id)
    .single()

  if (fetchErr || !row) {
    console.error('welcome: could not fetch user row', fetchErr)
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 },
    )
  }

  if (row.onboarding_completed_at) {
    // Έχει ήδη σταλεί — return 200 ώστε το client να θεωρήσει ότι όλα OK
    return NextResponse.json({ success: true, skipped: true })
  }

  // ── Extract first name από Supabase auth metadata αν υπάρχει ──
  // Ο user μπορεί να έχει δώσει `full_name` ή `name` στο signup form
  // (ή αν έκανε login μέσω OAuth provider).
  const metadata = user.user_metadata || {}
  const rawName =
    (typeof metadata.full_name === 'string' && metadata.full_name) ||
    (typeof metadata.name === 'string' && metadata.name) ||
    null
  const firstName = extractFirstName(rawName)

  // ── Send the welcome email ─────────────────────────────────────
  const result = await sendEmail({
    to: row.email,
    ...welcomeEmail({ firstName }),
    tags: [{ name: 'category', value: 'welcome' }],
  })

  if (!result.ok) {
    // Δεν markάρουμε completion — ο user θα μπορεί να retry
    console.error('welcome email send failed:', result.error)
    return NextResponse.json(
      { error: 'Failed to send welcome email' },
      { status: 500 },
    )
  }

  // ── Mark onboarding_completed_at ── όταν το email πέρασε ────────
  // Ακόμα κι αν αυτό το update αποτύχει, το email ήδη στάλθηκε. Σε επόμενη
  // κλήση θα ξαναστείλουμε — που είναι rare edge case με Supabase
  // (write failures after successful read).
  const { error: updateErr } = await supabase
    .from('users')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateErr) {
    console.warn('welcome: failed to mark onboarding_completed_at', updateErr)
  }

  return NextResponse.json({
    success: true,
    skipped: result.skipped ?? false,
    messageId: result.id,
  })
}

/**
 * Εξάγει το πρώτο όνομα από full_name. Επιστρέφει undefined αν δεν μπορεί
 * να βρει κάτι χρήσιμο (empty, just whitespace, numbers etc).
 */
function extractFirstName(fullName: string | null | undefined): string | undefined {
  if (!fullName || typeof fullName !== 'string') return undefined
  const trimmed = fullName.trim()
  if (!trimmed) return undefined
  const first = trimmed.split(/\s+/)[0]
  if (!first || /^\d+$/.test(first)) return undefined
  return first
}
