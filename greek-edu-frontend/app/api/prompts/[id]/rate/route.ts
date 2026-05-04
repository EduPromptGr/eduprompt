// app/api/prompts/[id]/rate/route.ts
//
// POST /api/prompts/:id/rate — δίνει 1-5 αστέρια σε ένα prompt.
//
// Body: { rating: 1 | 2 | 3 | 4 | 5 }
//
// Δομή:
// - Auth έλεγχος (cookie-based session).
// - UUID validation του `id` (404-hardening: invalid UUIDs → 400).
// - Rating validation (integer 1-5).
// - Καλεί το `rate_prompt(p_prompt_id, p_rating)` RPC (SECURITY DEFINER
//   με `auth.uid()` lookup), που ανανεώνει το `rating` + `rated_at` και
//   γράφει ένα quality signal (weight 0.5 / 1.5 ανάλογα).
//
// Security:
// - Η RPC ελέγχει ownership μέσω `auth.uid()` — δεν αρκεί το route
//   match για να "πειράξει" κάποιος ξένο prompt.
// - Column-level GRANTs στο `prompts` επιτρέπουν μόνο `rating`, `rated_at`,
//   `saved`, `saved_at` updates από `authenticated`, άρα ακόμα κι αν
//   κάποιος κάλεσε απευθείας με supabase-js θα αποτύγχανε στα άλλα cols.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// RFC4122 v4/v5/v1 tolerant — δεν πιάνουμε μόνο v4 γιατί το
// gen_random_uuid() του pgcrypto δίνει v4, αλλά μελλοντικό refactor
// σε uuidv7 δεν πρέπει να σπάσει τον regex.
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

  const rating = (body as { rating?: unknown })?.rating
  if (
    typeof rating !== 'number' ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return NextResponse.json(
      { error: 'rating must be integer between 1 and 5' },
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

  // ── Call RPC ───────────────────────────────────────────────────
  // Το RPC κάνει:
  //   1. auth.uid() check (ξαναελέγχει ότι είμαστε authed — defense in depth)
  //   2. Range check 1-5
  //   3. UPDATE prompts WHERE id=? AND user_id=auth.uid()
  //   4. ROW_COUNT check → EXCEPTION 'Prompt not found or not owned by user'
  //   5. INSERT στο prompt_quality_signals με κατάλληλο weight
  const { error } = await supabase.rpc('rate_prompt', {
    p_prompt_id: promptId,
    p_rating: rating,
  })

  if (error) {
    // Supabase γυρίζει PostgrestError με `message` / `code`. Το `code`
    // είναι το Postgres SQLSTATE (π.χ. 'P0001' για RAISE EXCEPTION).
    const msg = error.message || ''
    if (
      msg.includes('Prompt not found') ||
      msg.includes('not owned')
    ) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
    }
    if (msg.includes('Rating must')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    if (msg.includes('Not authenticated')) {
      // Δεν πρέπει να φτάσουμε εδώ αφού κάναμε ήδη auth.getUser() —
      // πιθανόν race με logout. Επέστρεψε 401 για σαφήνεια.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('rate_prompt rpc failed', error)
    return NextResponse.json(
      { error: 'Failed to save rating' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, rating })
}
