// app/api/journal/[id]/route.ts
//
// GET    /api/journal/:id    → fetch single entry
// PATCH  /api/journal/:id    → partial update (only fields που στέλνεις)
// DELETE /api/journal/:id    → permanent delete
//
// RLS: `users_crud_own_journal` + ρητό eq('user_id', user.id) στο query —
// double-lock για να μην εξαρτιόμαστε μόνο στην policy.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  validateUpdate,
  UUID_RE,
} from '@/lib/journal/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── GET ─────────────────────────────────────────────────────────
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const entryId = params.id
  if (!entryId || !UUID_RE.test(entryId)) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('journal')
    .select(
      'id, prompt_id, title, reflection_text, overall_rating, students_engaged_pct, tags, applied_on, created_at, updated_at',
    )
    .eq('id', entryId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('journal fetch failed', error)
    return NextResponse.json(
      { error: 'Failed to load entry' },
      { status: 500 },
    )
  }
  if (!data) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  return NextResponse.json({ entry: data })
}

// ── PATCH ───────────────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const entryId = params.id
  if (!entryId || !UUID_RE.test(entryId)) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = validateUpdate(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.errors },
      { status: 400 },
    )
  }
  const patch = parsed.data

  // Αν αλλάζει το prompt_id, επιβεβαίωσε ownership του νέου prompt
  if (patch.prompt_id) {
    const { data: owned } = await supabase
      .from('prompts')
      .select('id')
      .eq('id', patch.prompt_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!owned) {
      return NextResponse.json(
        { error: 'Prompt not found or not owned by user' },
        { status: 400 },
      )
    }
  }

  const { data, error } = await supabase
    .from('journal')
    .update(patch)
    .eq('id', entryId)
    .eq('user_id', user.id)
    .select(
      'id, prompt_id, title, reflection_text, overall_rating, students_engaged_pct, tags, applied_on, created_at, updated_at',
    )
    .maybeSingle()

  if (error) {
    console.error('journal update failed', error)
    if (error.code === '23514') {
      return NextResponse.json(
        { error: 'Invalid field value', detail: error.message },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { error: 'Failed to update entry' },
      { status: 500 },
    )
  }

  if (!data) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, entry: data })
}

// ── DELETE ──────────────────────────────────────────────────────
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const entryId = params.id
  if (!entryId || !UUID_RE.test(entryId)) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delete με .select() για να ξέρουμε αν έσβησε κάτι (και να κάνουμε 404 αν όχι)
  const { data, error } = await supabase
    .from('journal')
    .delete()
    .eq('id', entryId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('journal delete failed', error)
    return NextResponse.json(
      { error: 'Failed to delete entry' },
      { status: 500 },
    )
  }

  if (!data) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, deletedId: data.id })
}
