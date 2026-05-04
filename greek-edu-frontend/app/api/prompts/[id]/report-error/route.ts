// app/api/prompts/[id]/report-error/route.ts
//
// POST /api/prompts/:id/report-error — ο user αναφέρει πρόβλημα στο
// prompt (λάθος παιδαγωγική, ΑΠΣ mismatch, ακατάλληλο περιεχόμενο, κλπ.).
//
// Body: { category: ErrorCategory, description: string (1-2000 chars) }
//
// Το endpoint καλεί το `record_error_report(p_prompt_id, p_category, p_description)`
// RPC, το οποίο:
//  1. Εξάγει το user από `auth.uid()` (όχι από param — anti-spoofing).
//  2. Επιβεβαιώνει ότι το prompt ανήκει στον user.
//  3. INSERT … ON CONFLICT (prompt_id, user_id) DO UPDATE —
//     idempotent: αν ο ίδιος user έχει ήδη κάνει report, ενημερώνει
//     το υπάρχον.
//  4. Γράφει quality signal type='error_reported' με weight 2.0.
//
// Ο λόγος που έχουμε UNIQUE(prompt_id, user_id): κάποιος που διαφωνεί
// 5 φορές με το ίδιο σενάριο δεν πρέπει να "τραντάξει" πολλαπλά το
// quality score — 1 ψήφος, 1 signal.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Πρέπει να ταιριάζουν ΑΚΡΙΒΩΣ με το CHECK constraint στο error_reports
// (αλλιώς ο Postgres θα πετάξει 23514 και θα χάσουμε καθαρό 400 message).
const ALLOWED_CATEGORIES = [
  'pedagogical_error',
  'curriculum_mismatch',
  'inappropriate_content',
  'factual_error',
  'language_quality',
  'other',
] as const
type ErrorCategory = (typeof ALLOWED_CATEGORIES)[number]

const MAX_DESCRIPTION_LEN = 2000
const MIN_DESCRIPTION_LEN = 1

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

  const raw = body as { category?: unknown; description?: unknown }

  if (
    typeof raw.category !== 'string' ||
    !(ALLOWED_CATEGORIES as readonly string[]).includes(raw.category)
  ) {
    return NextResponse.json(
      {
        error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`,
      },
      { status: 400 },
    )
  }
  const category = raw.category as ErrorCategory

  if (typeof raw.description !== 'string') {
    return NextResponse.json(
      { error: 'description must be string' },
      { status: 400 },
    )
  }
  const description = raw.description.trim()
  if (description.length < MIN_DESCRIPTION_LEN) {
    return NextResponse.json(
      { error: 'description cannot be empty' },
      { status: 400 },
    )
  }
  if (description.length > MAX_DESCRIPTION_LEN) {
    return NextResponse.json(
      {
        error: `description max ${MAX_DESCRIPTION_LEN} characters (got ${description.length})`,
      },
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
  const { data: newId, error } = await supabase.rpc('record_error_report', {
    p_prompt_id: promptId,
    p_category: category,
    p_description: description,
  })

  if (error) {
    const msg = error.message || ''

    if (msg.includes('Prompt not found') || msg.includes('not owned')) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
    }
    if (msg.includes('Not authenticated')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Defense-in-depth: αν κάπως γλιτώσει ένα invalid category μέχρι την ΒΔ
    if (error.code === '23514') {
      return NextResponse.json(
        { error: 'Invalid category or description' },
        { status: 400 },
      )
    }

    console.error('record_error_report rpc failed', error)
    return NextResponse.json(
      { error: 'Failed to record error report' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    reportId: newId,
    category,
  })
}
