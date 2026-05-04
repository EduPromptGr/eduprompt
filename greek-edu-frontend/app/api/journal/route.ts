// app/api/journal/route.ts
//
// GET  /api/journal          → list τα journal entries του χρήστη (paginated)
// POST /api/journal          → δημιούργησε νέο entry
//
// Auth: cookie-based session (createClient με RLS).
// RLS: `users_crud_own_journal` επιτρέπει SELECT/INSERT/UPDATE/DELETE
//      μόνο σε rows όπου user_id = auth.uid().
//
// Pagination:
//   ?limit=20&offset=0       (defaults: 20/0, max limit 100)
// Filters:
//   ?prompt_id=<uuid>        → μόνο entries συνδεδεμένα με συγκεκριμένο prompt
//   ?has_rating=true         → μόνο entries με non-null overall_rating
//
// Response shape: { items: [...], total: number, limit, offset }

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  validateCreate,
  UUID_RE,
} from '@/lib/journal/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

// ── GET ─────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  // Parse pagination
  const rawLimit = parseInt(searchParams.get('limit') || '', 10)
  const rawOffset = parseInt(searchParams.get('offset') || '', 10)
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0

  // Parse filters
  const promptFilter = searchParams.get('prompt_id')
  if (promptFilter && !UUID_RE.test(promptFilter)) {
    return NextResponse.json(
      { error: 'prompt_id filter must be UUID' },
      { status: 400 },
    )
  }
  const hasRating = searchParams.get('has_rating') === 'true'

  // Query. RLS φιλτράρει αυτόματα user_id=auth.uid(), οπότε
  // δεν χρειάζεται .eq('user_id', user.id) — αλλά το βάζουμε
  // για ρητό intent + lightly faster plans.
  let query = supabase
    .from('journal')
    .select(
      'id, prompt_id, title, reflection_text, overall_rating, students_engaged_pct, tags, applied_on, created_at, updated_at',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (promptFilter) query = query.eq('prompt_id', promptFilter)
  if (hasRating) query = query.not('overall_rating', 'is', null)

  const { data, count, error } = await query

  if (error) {
    console.error('journal list fetch failed', error)
    return NextResponse.json(
      { error: 'Failed to load journal' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  })
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // Auth
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = validateCreate(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.errors },
      { status: 400 },
    )
  }
  const input = parsed.data

  // Αν έχει prompt_id, επιβεβαίωσε ότι ανήκει στον user — η RLS policy
  // μιλάει για journal.user_id, ΔΕΝ τσεκάρει prompts.user_id. Χωρίς
  // αυτό τον έλεγχο, ένας user θα μπορούσε να συνδέσει δικό του journal
  // με ξένο prompt και να το δει στο school report.
  if (input.prompt_id) {
    const { data: owned } = await supabase
      .from('prompts')
      .select('id')
      .eq('id', input.prompt_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!owned) {
      return NextResponse.json(
        { error: 'Prompt not found or not owned by user' },
        { status: 400 },
      )
    }
  }

  const row = {
    user_id: user.id,
    title: input.title ?? null,
    reflection_text: input.reflection_text,
    overall_rating: input.overall_rating ?? null,
    students_engaged_pct: input.students_engaged_pct ?? null,
    tags: input.tags ?? null,
    applied_on: input.applied_on ?? null,
    prompt_id: input.prompt_id ?? null,
  }

  const { data, error } = await supabase
    .from('journal')
    .insert(row)
    .select(
      'id, prompt_id, title, reflection_text, overall_rating, students_engaged_pct, tags, applied_on, created_at, updated_at',
    )
    .single()

  if (error) {
    console.error('journal insert failed', error)
    // Αν πέσει σε CHECK constraint
    if (error.code === '23514') {
      return NextResponse.json(
        { error: 'Invalid field value', detail: error.message },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { error: 'Failed to create journal entry' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, entry: data }, { status: 201 })
}
