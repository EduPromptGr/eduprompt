// app/api/admin/error-reports/route.ts
//
// GET /api/admin/error-reports — admin-only λίστα όλων των user-reported
// προβλημάτων σε prompts. Χρησιμοποιείται από το admin inbox UI για
// triage (assign priority, resolve, dismiss).
//
// Auth: requireAdmin() — αν δεν είσαι admin, 401/403.
// RLS: admins_view_all_error_reports επιτρέπει SELECT σε όλα τα rows
//      για is_admin=true users, οπότε το query δεν χρειάζεται service role.
//
// Query params:
//   ?status=pending|reviewing|resolved|dismissed|all   (default: pending)
//   ?category=<one of 6>                               (optional filter)
//   ?priority=low|normal|high|critical                 (optional filter)
//   ?limit=20                                          (default 20, max 100)
//   ?offset=0                                          (default 0)
//
// Response shape:
//   {
//     items: [{ ...report, prompt: {id, title, grade, subject}, reporter: {email} }],
//     total: number,
//     limit, offset
//   }

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

const ALLOWED_STATUS = ['pending', 'reviewing', 'resolved', 'dismissed'] as const
const ALLOWED_CATEGORY = [
  'pedagogical_error',
  'curriculum_mismatch',
  'inappropriate_content',
  'factual_error',
  'language_quality',
  'other',
] as const
const ALLOWED_PRIORITY = ['low', 'normal', 'high', 'critical'] as const

export async function GET(request: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }
  const { supabase } = guard

  const { searchParams } = new URL(request.url)

  // ── Filters ────────────────────────────────────────────────────
  const rawStatus = searchParams.get('status') ?? 'pending'
  const status = rawStatus === 'all' ? null : rawStatus
  if (status !== null && !(ALLOWED_STATUS as readonly string[]).includes(status)) {
    return NextResponse.json(
      {
        error: `status must be one of: ${ALLOWED_STATUS.join(', ')}, all`,
      },
      { status: 400 },
    )
  }

  const category = searchParams.get('category')
  if (category && !(ALLOWED_CATEGORY as readonly string[]).includes(category)) {
    return NextResponse.json(
      {
        error: `category must be one of: ${ALLOWED_CATEGORY.join(', ')}`,
      },
      { status: 400 },
    )
  }

  const priority = searchParams.get('priority')
  if (priority && !(ALLOWED_PRIORITY as readonly string[]).includes(priority)) {
    return NextResponse.json(
      {
        error: `priority must be one of: ${ALLOWED_PRIORITY.join(', ')}`,
      },
      { status: 400 },
    )
  }

  // ── Pagination ─────────────────────────────────────────────────
  const rawLimit = parseInt(searchParams.get('limit') || '', 10)
  const rawOffset = parseInt(searchParams.get('offset') || '', 10)
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0

  // ── Query ──────────────────────────────────────────────────────
  // Ordering: priority DESC (critical > high > normal > low) ΔΕΝ είναι
  // native alphabetical, οπότε βασιζόμαστε σε composite sort:
  // 1) status: pending πρώτα (για να βλέπει τα νέα)
  // 2) priority via CASE (αλλά στον PostgREST δεν έχουμε CASE — κάνουμε
  //    δύο passes στο client αν χρειαστεί). Για τώρα: newest first που
  //    ταιριάζει με το index (status, priority, created_at DESC).
  let query = supabase
    .from('error_reports')
    .select(
      `
        id,
        user_id,
        prompt_id,
        category,
        description,
        status,
        priority,
        resolved_by,
        resolution_note,
        resolved_at,
        created_at,
        updated_at,
        prompt:prompts!error_reports_prompt_id_fkey (
          id,
          title,
          grade,
          subject,
          objective
        ),
        reporter:users!error_reports_user_id_fkey (
          email
        )
      `,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status !== null) query = query.eq('status', status)
  if (category) query = query.eq('category', category)
  if (priority) query = query.eq('priority', priority)

  const { data, count, error } = await query

  if (error) {
    console.error('admin error-reports list failed', error)
    return NextResponse.json(
      { error: 'Failed to load error reports' },
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
