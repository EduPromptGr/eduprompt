// app/api/prompts/[id]/save/route.ts
//
// POST /api/prompts/:id/save — toggle αποθήκευσης ενός prompt στο
// "saved list" του χρήστη.
//
// Body: { saved: boolean }
//
// Γιατί direct UPDATE αντί για RPC:
// - Το `saved` δεν συνδέεται με quality-signal flywheel (αντίθετα με το
//   rating), οπότε δεν χρειάζεται atomicity πέρα από ένα single UPDATE.
// - Τα column-level GRANTs στο `prompts` επιτρέπουν UPDATE μόνο σε
//   (rating, rated_at, saved, saved_at), και το RLS policy
//   `prompts_update_own` κλειδώνει το row σε user_id=auth.uid(). Άρα
//   μπορούμε να πάμε κατευθείαν μέσω supabase-js.
//
// Η βάση έχει trigger `set_prompt_updated_at` που γεμίζει αυτόματα το
// `saved_at` όταν αλλάζει το `saved` — οπότε εδώ γράφουμε μόνο το `saved`.
// Για defense-in-depth γράφουμε κι εμείς το saved_at (null αν unsaving).

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  // ── URL param validation ───────────────────────────────────────
  const promptId = params.id
  if (!promptId || !UUID_RE.test(promptId)) {
    return NextResponse.json({ error: 'Invalid prompt id' }, { status: 400 })
  }

  // ── Body validation ────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const saved = (body as { saved?: unknown })?.saved
  if (typeof saved !== 'boolean') {
    return NextResponse.json(
      { error: 'saved must be boolean' },
      { status: 400 },
    )
  }

  // ── Auth ───────────────────────────────────────────────────────
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Update ─────────────────────────────────────────────────────
  // RLS + column GRANTs εγγυώνται:
  //  (α) δεν μπορεί να πειράξει ξένο prompt
  //  (β) δεν μπορεί να πειράξει άλλες στήλες πέρα από saved/saved_at
  const savedAt = saved ? new Date().toISOString() : null

  const { data, error } = await supabase
    .from('prompts')
    .update({ saved, saved_at: savedAt })
    .eq('id', promptId)
    .eq('user_id', user.id) // redundant με RLS αλλά κάνει το intent ρητό
    .select('id, saved, saved_at')
    .maybeSingle()

  if (error) {
    console.error('prompts save update failed', error)
    return NextResponse.json(
      { error: 'Failed to update saved state' },
      { status: 500 },
    )
  }

  if (!data) {
    // 0 rows matched — ή το prompt δεν υπάρχει ή δεν είναι του user
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    saved: data.saved,
    savedAt: data.saved_at,
  })
}
