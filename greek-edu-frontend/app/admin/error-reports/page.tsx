// app/admin/error-reports/page.tsx
//
// Admin inbox για τα user-reported προβλήματα σε prompts.
//
// Server component — φορτώνουμε την αρχική λίστα server-side ώστε:
//   (α) να μην τρέμει η πρώτη απεικόνιση περιμένοντας το fetch
//   (β) να χρησιμοποιήσουμε το `requireAdmin()` για redirect/404 αν δεν είσαι admin
//   (γ) οι filters (status/category/priority) να έρχονται από query params
//       και να γίνονται bookmarkable URLs
//
// Τα actions (αλλαγή status / priority / note) γίνονται client-side μέσω
// <ErrorReportActions> που καλεί PATCH /api/admin/error-reports/:id.
// ΔΕΝ κάνουμε router.refresh() μετά από κάθε PATCH· αν ο admin θέλει
// να δει την ανανεωμένη λίστα, πατάει το "Ανανέωση" link (plain anchor
// με ίδιο URL) που κάνει full reload της server component.

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin/guard'
import ErrorReportActions from '@/components/admin/ErrorReportActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Αναφορές λάθους — Admin inbox',
  robots: { index: false, follow: false },
}

// ── Types (PostgREST embed response shape) ──────────────────────
type Status = 'pending' | 'reviewing' | 'resolved' | 'dismissed'
type Priority = 'low' | 'normal' | 'high' | 'critical'
type Category =
  | 'pedagogical_error'
  | 'curriculum_mismatch'
  | 'inappropriate_content'
  | 'factual_error'
  | 'language_quality'
  | 'other'

interface EmbeddedPrompt {
  id: string
  title: string | null
  grade: string
  subject: string
  objective: string
}
interface EmbeddedReporter {
  email: string | null
}
interface ReportRow {
  id: string
  user_id: string
  prompt_id: string
  category: Category
  description: string
  status: Status
  priority: Priority
  resolved_by: string | null
  resolution_note: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  // PostgREST μπορεί να επιστρέψει είτε ένα object είτε array — το normalise
  // ο server component αμέσως μόλις φτάσει.
  prompt: EmbeddedPrompt | EmbeddedPrompt[] | null
  reporter: EmbeddedReporter | EmbeddedReporter[] | null
}

// ── Labels ──────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<Category, string> = {
  pedagogical_error: 'Παιδαγωγικό λάθος',
  curriculum_mismatch: 'Μη ταίριασμα ΑΠΣ',
  inappropriate_content: 'Ακατάλληλο περιεχόμενο',
  factual_error: 'Πραγματολογικό λάθος',
  language_quality: 'Γλωσσική ποιότητα',
  other: 'Άλλο',
}

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Εκκρεμεί',
  reviewing: 'Σε έλεγχο',
  resolved: 'Επιλύθηκε',
  dismissed: 'Απορρίφθηκε',
}

const STATUS_TONES: Record<Status, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  reviewing: 'bg-sky-50 text-sky-700 border-sky-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dismissed: 'bg-gray-100 text-gray-600 border-gray-200',
}

const PRIORITY_TONES: Record<Priority, string> = {
  low: 'text-gray-500',
  normal: 'text-sky-700',
  high: 'text-orange-600',
  critical: 'text-rose-600 font-semibold',
}

const ALLOWED_STATUS: readonly string[] = [
  'pending',
  'reviewing',
  'resolved',
  'dismissed',
  'all',
]
const ALLOWED_CATEGORY: readonly string[] = [
  'pedagogical_error',
  'curriculum_mismatch',
  'inappropriate_content',
  'factual_error',
  'language_quality',
  'other',
]
const ALLOWED_PRIORITY: readonly string[] = [
  'low',
  'normal',
  'high',
  'critical',
]

const PAGE_SIZE = 20

// Normalise του PostgREST embed (1-row FK → object στο Postgres αλλά ο
// type generator συχνά το δείχνει ως array). Το κάνουμε safe για runtime.
function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// ── Data loader (server-side fetch από το /api endpoint για single source of truth) ──
async function loadReports(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<{
  items: ReportRow[]
  total: number
  limit: number
  offset: number
  activeStatus: string
  activeCategory: string | null
  activePriority: string | null
} | null> {
  // Guard πρώτα για να μην τρέξει query αν δεν είσαι admin
  const guard = await requireAdmin()
  if (!guard.ok) {
    if (guard.status === 401) redirect('/login?next=/admin/error-reports')
    if (guard.status === 403) notFound()
    return null
  }
  const { supabase } = guard

  // Sanitise filters από τα query params
  const rawStatus = pickStr(searchParams.status) ?? 'pending'
  const status = ALLOWED_STATUS.includes(rawStatus) ? rawStatus : 'pending'

  const rawCategory = pickStr(searchParams.category)
  const category =
    rawCategory && ALLOWED_CATEGORY.includes(rawCategory) ? rawCategory : null

  const rawPriority = pickStr(searchParams.priority)
  const priority =
    rawPriority && ALLOWED_PRIORITY.includes(rawPriority) ? rawPriority : null

  const rawOffset = parseInt(pickStr(searchParams.offset) || '', 10)
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0

  let query = supabase
    .from('error_reports')
    .select(
      `
        id, user_id, prompt_id, category, description,
        status, priority,
        resolved_by, resolution_note, resolved_at,
        created_at, updated_at,
        prompt:prompts!error_reports_prompt_id_fkey (
          id, title, grade, subject, objective
        ),
        reporter:users!error_reports_user_id_fkey ( email )
      `,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (status !== 'all') query = query.eq('status', status)
  if (category) query = query.eq('category', category)
  if (priority) query = query.eq('priority', priority)

  const { data, count, error } = await query
  if (error) {
    console.error('admin error-reports page query failed', error)
    return {
      items: [],
      total: 0,
      limit: PAGE_SIZE,
      offset,
      activeStatus: status,
      activeCategory: category,
      activePriority: priority,
    }
  }

  return {
    items: (data ?? []) as unknown as ReportRow[],
    total: count ?? 0,
    limit: PAGE_SIZE,
    offset,
    activeStatus: status,
    activeCategory: category,
    activePriority: priority,
  }
}

function pickStr(v: string | string[] | undefined): string | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

// ── Page ────────────────────────────────────────────────────────
export default async function AdminErrorReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const res = await loadReports(searchParams)
  if (!res) notFound()

  const { items, total, limit, offset, activeStatus, activeCategory, activePriority } = res

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 text-gray-900">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Admin</p>
          <h1 className="text-2xl font-bold">Αναφορές λάθους</h1>
          <p className="text-sm text-gray-600 mt-1">
            Εκκρεμείς αναφορές χρηστών για προβλήματα σε παραγόμενα σενάρια.
          </p>
        </div>
        <Link
          href="/admin/error-reports"
          className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Ανανέωση
        </Link>
      </header>

      {/* ── Filters ─────────────────────────────────────────── */}
      <FilterBar
        activeStatus={activeStatus}
        activeCategory={activeCategory}
        activePriority={activePriority}
      />

      {/* ── Results summary ─────────────────────────────────── */}
      <p className="text-xs text-gray-500 mb-4">
        {total === 0
          ? 'Καμία αναφορά με αυτά τα φίλτρα.'
          : `${total} αναφορ${total === 1 ? 'ά' : 'ές'} — εμφανίζονται ${offset + 1}-${Math.min(offset + limit, total)}`}
      </p>

      {/* ── List ────────────────────────────────────────────── */}
      <ul className="space-y-4">
        {items.map((r) => {
          const prompt = firstOrNull(r.prompt)
          const reporter = firstOrNull(r.reporter)
          return (
            <li
              key={r.id}
              className="border border-gray-200 rounded-xl bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border font-medium ${STATUS_TONES[r.status]}`}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                    <span className={`uppercase tracking-wide ${PRIORITY_TONES[r.priority]}`}>
                      {r.priority}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-600">
                      {CATEGORY_LABELS[r.category]}
                    </span>
                    <span className="text-gray-400">•</span>
                    <time className="text-gray-500" dateTime={r.created_at}>
                      {formatDate(r.created_at)}
                    </time>
                  </div>

                  {prompt && (
                    <div className="mt-2">
                      <Link
                        href={`/prompts/${prompt.id}`}
                        className="text-base font-semibold hover:underline text-sky-700"
                        target="_blank"
                      >
                        {prompt.title || 'Σενάριο χωρίς τίτλο'}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {prompt.grade} Δημοτικού · {prompt.subject} · {clamp(prompt.objective, 120)}
                      </p>
                    </div>
                  )}

                  {/* Reporter description */}
                  <blockquote className="mt-3 border-l-2 border-gray-300 pl-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {r.description}
                  </blockquote>
                  <p className="mt-1 text-xs text-gray-400">
                    Από: {reporter?.email ?? '(άγνωστος)'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <ErrorReportActions
                  reportId={r.id}
                  initialStatus={r.status}
                  initialPriority={r.priority}
                  initialNote={r.resolution_note}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {/* ── Pagination ──────────────────────────────────────── */}
      {total > limit && (
        <Pagination
          offset={offset}
          limit={limit}
          total={total}
          activeStatus={activeStatus}
          activeCategory={activeCategory}
          activePriority={activePriority}
        />
      )}
    </main>
  )
}

// ── Subcomponents ───────────────────────────────────────────────
function FilterBar({
  activeStatus,
  activeCategory,
  activePriority,
}: {
  activeStatus: string
  activeCategory: string | null
  activePriority: string | null
}) {
  const statusOptions: { value: string; label: string }[] = [
    { value: 'pending', label: 'Εκκρεμή' },
    { value: 'reviewing', label: 'Σε έλεγχο' },
    { value: 'resolved', label: 'Επιλυμένα' },
    { value: 'dismissed', label: 'Απορριφθέντα' },
    { value: 'all', label: 'Όλα' },
  ]

  function href(overrides: Record<string, string | null>) {
    const params = new URLSearchParams()
    const status = 'status' in overrides ? overrides.status : activeStatus
    const category = 'category' in overrides ? overrides.category : activeCategory
    const priority = 'priority' in overrides ? overrides.priority : activePriority
    if (status) params.set('status', status)
    if (category) params.set('category', category)
    if (priority) params.set('priority', priority)
    const q = params.toString()
    return q ? `?${q}` : '?'
  }

  return (
    <div className="space-y-3 mb-6">
      {/* Status tabs */}
      <nav aria-label="Φίλτρο κατάστασης" className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-2">
        {statusOptions.map((o) => {
          const active = o.value === activeStatus
          return (
            <Link
              key={o.value}
              href={href({ status: o.value, offset: null as unknown as string })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                active
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {o.label}
            </Link>
          )
        })}
      </nav>

      {/* Secondary filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Κατηγορία:</span>
        <FilterChip
          href={href({ category: null })}
          active={!activeCategory}
          label="Όλες"
        />
        {(
          [
            'pedagogical_error',
            'curriculum_mismatch',
            'inappropriate_content',
            'factual_error',
            'language_quality',
            'other',
          ] as Category[]
        ).map((c) => (
          <FilterChip
            key={c}
            href={href({ category: c })}
            active={activeCategory === c}
            label={CATEGORY_LABELS[c]}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Προτεραιότητα:</span>
        <FilterChip href={href({ priority: null })} active={!activePriority} label="Όλες" />
        {(['critical', 'high', 'normal', 'low'] as Priority[]).map((p) => (
          <FilterChip
            key={p}
            href={href({ priority: p })}
            active={activePriority === p}
            label={p.toUpperCase()}
          />
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string
  active: boolean
  label: string
}) {
  return (
    <Link
      href={href}
      className={`px-2 py-0.5 rounded-full border ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {label}
    </Link>
  )
}

function Pagination({
  offset,
  limit,
  total,
  activeStatus,
  activeCategory,
  activePriority,
}: {
  offset: number
  limit: number
  total: number
  activeStatus: string
  activeCategory: string | null
  activePriority: string | null
}) {
  const prevOffset = Math.max(0, offset - limit)
  const nextOffset = offset + limit

  function hrefWithOffset(off: number) {
    const p = new URLSearchParams()
    if (activeStatus) p.set('status', activeStatus)
    if (activeCategory) p.set('category', activeCategory)
    if (activePriority) p.set('priority', activePriority)
    if (off > 0) p.set('offset', String(off))
    const q = p.toString()
    return q ? `?${q}` : '?'
  }

  return (
    <nav
      aria-label="Σελιδοποίηση"
      className="mt-6 flex items-center justify-between text-xs text-gray-500"
    >
      {offset > 0 ? (
        <Link
          href={hrefWithOffset(prevOffset)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          ← Προηγούμενα
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-gray-300">← Προηγούμενα</span>
      )}

      <span>
        Σελίδα {Math.floor(offset / limit) + 1} / {Math.max(1, Math.ceil(total / limit))}
      </span>

      {nextOffset < total ? (
        <Link
          href={hrefWithOffset(nextOffset)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          Επόμενα →
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-gray-300">Επόμενα →</span>
      )}
    </nav>
  )
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('el-GR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

function clamp(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + '…'
}
