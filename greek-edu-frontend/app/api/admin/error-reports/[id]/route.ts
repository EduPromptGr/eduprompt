// app/api/admin/error-reports/[id]/route.ts
//
// GET   /api/admin/error-reports/:id  → full detail (για το drill-down modal)
// PATCH /api/admin/error-reports/:id  → triage action (change status/priority
//                                        ή mark resolved/dismissed με σημείωση)
//
// Auth: requireAdmin().
// RLS:  admins_update_error_reports + admins_view_all_error_reports.
//
// PATCH body (όλα optional αλλά ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ):
//   { status?, priority?, resolution_note? }
//
// Όταν το status γίνεται resolved|dismissed, ο server βάζει:
//   resolved_by   = current admin user id
//   resolved_at   = NOW()  (ο DB trigger το κάνει ήδη αν δεν σταλεί)
//
// Αν ο admin αλλάξει status ξανά σε pending/reviewing (reopen), καθαρίζουμε
// τα resolved_by/resolved_at ώστε το count του business_health να παίζει σωστά.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_STATUS = ['pending', 'reviewing', 'resolved', 'dismissed'] as const
const ALLOWED_PRIORITY = ['low', 'normal', 'high', 'critical'] as const
type Status = (typeof ALLOWED_STATUS)[number]
type Priority = (typeof ALLOWED_PRIORITY)[number]

const MAX_NOTE_LEN = 2000

// ── GET ─────────────────────────────────────────────────────────
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const reportId = params.id
  if (!reportId || !UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })
  }

  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }
  const { supabase } = guard

  const { data, error } = await supabase
    .from('error_reports')
    .select(
      `
        id, user_id, prompt_id, category, description,
        status, priority,
        resolved_by, resolution_note, resolved_at,
        created_at, updated_at,
        prompt:prompts!error_reports_prompt_id_fkey (
          id, title, grade, subject, objective, body
        ),
        reporter:users!error_reports_user_id_fkey (
          email
        )
      `,
    )
    .eq('id', reportId)
    .maybeSingle()

  if (error) {
    console.error('admin error-report fetch failed', error)
    return NextResponse.json(
      { error: 'Failed to load report' },
      { status: 500 },
    )
  }
  if (!data) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  return NextResponse.json({ report: data })
}

// ── PATCH ───────────────────────────────────────────────────────
interface PatchBody {
  status?: Status
  priority?: Priority
  resolution_note?: string | null
}

function validatePatch(
  raw: unknown,
):
  | { ok: true; data: PatchBody }
  | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Body must be JSON object' }
  }
  const b = raw as Record<string, unknown>
  const data: PatchBody = {}

  if ('status' in b) {
    if (
      typeof b.status !== 'string' ||
      !(ALLOWED_STATUS as readonly string[]).includes(b.status)
    ) {
      return {
        ok: false,
        error: `status must be one of: ${ALLOWED_STATUS.join(', ')}`,
      }
    }
    data.status = b.status as Status
  }

  if ('priority' in b) {
    if (
      typeof b.priority !== 'string' ||
      !(ALLOWED_PRIORITY as readonly string[]).includes(b.priority)
    ) {
      return {
        ok: false,
        error: `priority must be one of: ${ALLOWED_PRIORITY.join(', ')}`,
      }
    }
    data.priority = b.priority as Priority
  }

  if ('resolution_note' in b) {
    if (b.resolution_note === null || b.resolution_note === '') {
      data.resolution_note = null
    } else if (typeof b.resolution_note !== 'string') {
      return { ok: false, error: 'resolution_note must be string or null' }
    } else {
      const trimmed = b.resolution_note.trim()
      if (trimmed.length > MAX_NOTE_LEN) {
        return {
          ok: false,
          error: `resolution_note max ${MAX_NOTE_LEN} chars (got ${trimmed.length})`,
        }
      }
      data.resolution_note = trimmed.length > 0 ? trimmed : null
    }
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: 'no fields to update' }
  }
  return { ok: true, data }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const reportId = params.id
  if (!reportId || !UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })
  }

  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }
  const { user, supabase } = guard

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = validatePatch(raw)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const patch = parsed.data

  // Build the row-level update. Αν ο admin αλλάζει status πρέπει να
  // συγχρονίσουμε τα resolution metadata ώστε οι analytic views να είναι
  // consistent (π.χ. business_health.pending_reports_count).
  const update: Record<string, unknown> = { ...patch }

  if (patch.status === 'resolved' || patch.status === 'dismissed') {
    update.resolved_by = user.id
    // resolved_at: ο DB trigger το βάζει αυτόματα αν είναι null,
    // αλλά το γράφουμε ρητά για να είναι predictable στο response.
    update.resolved_at = new Date().toISOString()
  } else if (patch.status === 'pending' || patch.status === 'reviewing') {
    // Reopen: καθαρίζουμε resolution metadata για να μην μείνει
    // stale "έλυσε αυτός ο admin" σε ticket που ξανανοίγει.
    update.resolved_by = null
    update.resolved_at = null
    if (!('resolution_note' in update)) {
      update.resolution_note = null
    }
  }

  const { data, error } = await supabase
    .from('error_reports')
    .update(update)
    .eq('id', reportId)
    .select(
      `
        id, user_id, prompt_id, category, description,
        status, priority,
        resolved_by, resolution_note, resolved_at,
        created_at, updated_at
      `,
    )
    .maybeSingle()

  if (error) {
    console.error('admin error-report update failed', error)
    if (error.code === '23514') {
      return NextResponse.json(
        { error: 'Invalid field value', detail: error.message },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { error: 'Failed to update report' },
      { status: 500 },
    )
  }
  if (!data) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, report: data })
}
