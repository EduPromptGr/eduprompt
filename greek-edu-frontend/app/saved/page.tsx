// app/saved/page.tsx
//
// Η σελίδα "Αποθηκευμένα σενάρια" — λίστα από όλα τα prompts που ο user
// έχει πατήσει το bookmark στο PromptFeedback.
//
// Server component · φορτώνει directly μέσω Supabase client με RLS
// (users_view_own_prompts) — δεν χρειαζόμαστε extra /api endpoint γιατί
// το αποτέλεσμα σερβίρεται μόνο SSR και δεν κάνει re-fetch client-side.
//
// Η βάση έχει partial index `idx_prompts_user_saved ON (user_id, saved_at DESC)
// WHERE saved = true` που καλύπτει το κύριο query εδώ.
//
// Query params:
//   ?grade=Α|Β|Γ|Δ|Ε|ΣΤ
//   ?subject=<free text filter, ILIKE match>
//   ?offset=0    (σελιδοποίηση, limit fixed στις 20)
//
// Unauth → redirect σε /login
// Empty state → friendly CTA πίσω στο /generate

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import SavedPromptCard from '@/components/SavedPromptCard'
import { EmptyState } from '@/components/EmptyState'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Αποθηκευμένα σενάρια — EduPrompt',
  robots: { index: false, follow: false },
}

// ── Labels (μοιράζονται με το prompt view) ─────────────────────
// Κράτα τα sync με το prompt_service.py και το app/prompts/[id]/page.tsx.
const THEORY_LABELS: Record<string, string> = {
  vygotsky_zpd: 'Vygotsky (ZPD)',
  bloom: 'Bloom',
  piaget: 'Piaget',
  udl: 'UDL',
  gardner: 'Πολλαπλή νοημοσύνη',
  kolb: 'Kolb',
}
const STRATEGY_LABELS: Record<string, string> = {
  inquiry_based: 'Διερευνητική',
  project_based: 'Project-based',
  discovery: 'Ανακαλυπτική',
  collaborative: 'Συνεργατική',
  flipped: 'Ανεστραμμένη',
}

const ALLOWED_GRADES = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ'] as const
type Grade = (typeof ALLOWED_GRADES)[number]
const PAGE_SIZE = 20

// ── Types ───────────────────────────────────────────────────────
interface SavedRow {
  id: string
  grade: string
  subject: string
  objective: string
  title: string
  theory: string | null
  strategy: string | null
  saved_at: string
}

// ── Page ────────────────────────────────────────────────────────
export default async function SavedPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?next=/saved')
  }

  // Parse filters
  const gradeParam = pickStr(searchParams.grade)
  const grade: Grade | null =
    gradeParam && (ALLOWED_GRADES as readonly string[]).includes(gradeParam)
      ? (gradeParam as Grade)
      : null

  const subjectParam = pickStr(searchParams.subject)
  const subject = subjectParam ? subjectParam.trim().slice(0, 100) : null

  const rawOffset = parseInt(pickStr(searchParams.offset) || '', 10)
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0

  // Query — RLS φιλτράρει user_id=auth.uid() αυτόματα, αλλά βάζουμε
  // και ρητό eq('user_id') για index hint + ρητό intent.
  let query = supabase
    .from('prompts')
    .select(
      'id, grade, subject, objective, title, theory, strategy, saved_at',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .eq('saved', true)
    .order('saved_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (grade) query = query.eq('grade', grade)
  if (subject) query = query.ilike('subject', `%${subject}%`)

  const { data, count, error } = await query

  if (error) {
    console.error('saved page query failed', error)
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Αποθηκευμένα σενάρια</h1>
        <p className="text-sm text-rose-600">
          Κάτι πήγε στραβά στη φόρτωση. Δοκίμασε ξανά σε λίγο.
        </p>
      </main>
    )
  }

  const items = (data ?? []) as SavedRow[]
  const total = count ?? 0

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">Αποθηκευμένα σενάρια</h1>
        <p className="text-sm text-gray-600 mt-1">
          Τα σενάρια που έβαλες στα αγαπημένα σου — πατώντας το bookmark στη
          σελίδα του κάθε σεναρίου.
        </p>
      </header>

      <FilterBar activeGrade={grade} activeSubject={subject} />

      {total === 0 ? (
        <SavedEmptyState hasFilters={!!(grade || subject)} />
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            {total} σενάρι{total === 1 ? 'ο' : 'α'} · εμφανίζονται{' '}
            {offset + 1}-{Math.min(offset + PAGE_SIZE, total)}
          </p>
          <ul className="space-y-3">
            {items.map((row) => (
              <SavedPromptCard
                key={row.id}
                id={row.id}
                title={row.title}
                grade={row.grade}
                subject={row.subject}
                objective={row.objective}
                savedAt={row.saved_at}
                theoryLabel={row.theory ? THEORY_LABELS[row.theory] ?? null : null}
                strategyLabel={
                  row.strategy ? STRATEGY_LABELS[row.strategy] ?? null : null
                }
              />
            ))}
          </ul>

          {total > PAGE_SIZE && (
            <Pagination
              offset={offset}
              total={total}
              grade={grade}
              subject={subject}
            />
          )}
        </>
      )}
    </main>
  )
}

// ── Subcomponents ───────────────────────────────────────────────
function FilterBar({
  activeGrade,
  activeSubject,
}: {
  activeGrade: Grade | null
  activeSubject: string | null
}) {
  function href(overrides: Record<string, string | null>) {
    const params = new URLSearchParams()
    const g = 'grade' in overrides ? overrides.grade : activeGrade
    const s = 'subject' in overrides ? overrides.subject : activeSubject
    if (g) params.set('grade', g)
    if (s) params.set('subject', s)
    const q = params.toString()
    return q ? `?${q}` : '?'
  }

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-gray-500">Τάξη:</span>
        <Chip href={href({ grade: null })} active={!activeGrade} label="Όλες" />
        {(ALLOWED_GRADES as readonly string[]).map((g) => (
          <Chip
            key={g}
            href={href({ grade: g })}
            active={activeGrade === g}
            label={g}
          />
        ))}
      </div>

      {/* Subject text filter — GET form ώστε το URL να παραμένει
          bookmarkable και server-rendered. */}
      <form method="get" action="/saved" className="flex items-center gap-2">
        {activeGrade && (
          <input type="hidden" name="grade" value={activeGrade} />
        )}
        <label htmlFor="subject" className="text-xs text-gray-500 shrink-0">
          Μάθημα:
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          defaultValue={activeSubject ?? ''}
          placeholder="π.χ. Μαθηματικά"
          maxLength={100}
          className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700"
        >
          Φιλτράρισμα
        </button>
        {activeSubject && (
          <Link
            href={href({ subject: null })}
            className="text-xs text-gray-500 hover:underline"
          >
            Καθαρισμός
          </Link>
        )}
      </form>
    </div>
  )
}

function Chip({
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

// Local wrapper γύρω από το shared <EmptyState> — κρατάει το page-specific
// copy μαζί με τα props που του ταιριάζουν, ώστε η σελίδα να μένει καθαρή.
function SavedEmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <EmptyState
        variant="filtered"
        title="Καμία αντιστοιχία"
        description="Κανένα αποθηκευμένο σενάριο δεν ταιριάζει με αυτά τα φίλτρα. Δοκίμασε άλλη τάξη ή θέμα."
        primaryCta={{ label: 'Καθαρισμός φίλτρων', href: '/saved' }}
      />
    )
  }
  return (
    <EmptyState
      icon="bookmark"
      title="Δεν έχεις αποθηκευμένα σενάρια ακόμη"
      description="Όταν βρεις ένα σενάριο που σου αρέσει, πάτα τον σελιδοδείκτη — θα το βρεις εδώ έτοιμο για να το ξαναδείς ή να το προσαρμόσεις."
      primaryCta={{ label: 'Δημιουργία σεναρίου', href: '/generate' }}
      hints={[
        'Όλα τα σενάρια μένουν προσωπικά — μόνο εσύ τα βλέπεις.',
        'Φίλτραρε ανά τάξη ή θέμα όταν συγκεντρωθούν αρκετά.',
        'Σύνδεσε ένα αποθηκευμένο σενάριο με μια καταχώρηση στο ημερολόγιο για να μετράς τι δουλεύει στην τάξη σου.',
      ]}
    />
  )
}

function Pagination({
  offset,
  total,
  grade,
  subject,
}: {
  offset: number
  total: number
  grade: Grade | null
  subject: string | null
}) {
  const prev = Math.max(0, offset - PAGE_SIZE)
  const next = offset + PAGE_SIZE

  function hrefWith(off: number) {
    const p = new URLSearchParams()
    if (grade) p.set('grade', grade)
    if (subject) p.set('subject', subject)
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
          href={hrefWith(prev)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          ← Προηγούμενα
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-gray-300">← Προηγούμενα</span>
      )}

      <span>
        Σελίδα {Math.floor(offset / PAGE_SIZE) + 1} /{' '}
        {Math.max(1, Math.ceil(total / PAGE_SIZE))}
      </span>

      {next < total ? (
        <Link
          href={hrefWith(next)}
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

function pickStr(v: string | string[] | undefined): string | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}
