// app/journal/page.tsx
//
// Η σελίδα "Ημερολόγιο" — λίστα από όλες τις αναστοχαστικές καταχωρήσεις
// του χρήστη. Δίνει quick-peek προεπισκόπηση του reflection και
// metadata (date, rating, engagement%, tags), και link σε detail.
//
// Server component · τραβάει direct μέσω RLS, ακριβώς όπως το /saved.
// Δεν πάμε από το /api/journal γιατί αυτό το endpoint δεν προσθέτει
// κάτι πέρα από ίδιο query — SSR → 1 round-trip λιγότερος.
//
// Query params:
//   ?rating=1..5
//   ?has_prompt=true|false
//   ?offset=0  (PAGE_SIZE=15, όχι 20 — το reflection preview είναι πιο tall)

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ημερολόγιο — EduPrompt',
  robots: { index: false, follow: false },
}

const PAGE_SIZE = 15

// ── Types ───────────────────────────────────────────────────────
interface JournalRow {
  id: string
  prompt_id: string | null
  title: string | null
  reflection_text: string
  overall_rating: number | null
  students_engaged_pct: number | null
  tags: string[] | null
  applied_on: string | null
  created_at: string
  updated_at: string
}

// Κράτα τα sync με lib/journal/validation.ts — αλλιώς ο list δεν θα
// εμφανίζει labels για tags που γράφτηκαν πρόσφατα.
const TAG_LABELS: Record<string, string> = {
  worked_well: 'Λειτούργησε καλά',
  need_differentiation: 'Χρειάζεται διαφοροποίηση',
  time_exceeded: 'Ξεπέρασα τον χρόνο',
  time_short: 'Νωρίτερα',
  high_engagement: 'Ψηλή συμμετοχή',
  low_engagement: 'Χαμηλή συμμετοχή',
  missed_objective: 'Δεν πέτυχα τον στόχο',
  exceeded_objective: 'Πέτυχα παραπάνω',
  materials_issue: 'Πρόβλημα υλικών',
  classroom_management: 'Διαχείριση τάξης',
}

export default async function JournalListPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/journal')

  // ── Filters ─────────────────────────────────────────────────
  const ratingRaw = parseInt(pickStr(searchParams.rating) || '', 10)
  const rating =
    Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5
      ? ratingRaw
      : null

  const hasPromptRaw = pickStr(searchParams.has_prompt)
  const hasPrompt =
    hasPromptRaw === 'true'
      ? true
      : hasPromptRaw === 'false'
        ? false
        : null

  const rawOffset = parseInt(pickStr(searchParams.offset) || '', 10)
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0

  // ── Query ───────────────────────────────────────────────────
  let query = supabase
    .from('journal')
    .select(
      'id, prompt_id, title, reflection_text, overall_rating, students_engaged_pct, tags, applied_on, created_at, updated_at',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .order('applied_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (rating !== null) query = query.eq('overall_rating', rating)
  if (hasPrompt === true) query = query.not('prompt_id', 'is', null)
  if (hasPrompt === false) query = query.is('prompt_id', null)

  const { data, count, error } = await query

  if (error) {
    console.error('journal list query failed', error)
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Ημερολόγιο</h1>
        <p className="text-sm text-rose-600">
          Κάτι πήγε στραβά στη φόρτωση. Δοκίμασε ξανά σε λίγο.
        </p>
      </main>
    )
  }

  const items = (data ?? []) as JournalRow[]
  const total = count ?? 0

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ημερολόγιο</h1>
          <p className="text-sm text-gray-600 mt-1">
            Αναστοχαστικές σημειώσεις από τις εφαρμογές των σεναρίων σου στην
            τάξη.
          </p>
        </div>
        <Link
          href="/journal/new"
          className="shrink-0 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700"
        >
          + Νέα καταχώρηση
        </Link>
      </header>

      <FilterBar activeRating={rating} activeHasPrompt={hasPrompt} />

      {total === 0 ? (
        <JournalEmptyState hasFilters={rating !== null || hasPrompt !== null} />
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            {`${total} ${total === 1 ? 'καταχώρηση' : 'καταχωρήσεις'} · εμφανίζονται ${offset + 1}-${Math.min(offset + PAGE_SIZE, total)}`}
          </p>
          <ul className="space-y-3">
            {items.map((row) => (
              <JournalRowCard key={row.id} row={row} />
            ))}
          </ul>
          {total > PAGE_SIZE && (
            <Pagination
              offset={offset}
              total={total}
              rating={rating}
              hasPrompt={hasPrompt}
            />
          )}
        </>
      )}
    </main>
  )
}

// ── Row card ────────────────────────────────────────────────────
function JournalRowCard({ row }: { row: JournalRow }) {
  const tags = row.tags ?? []
  const preview = clamp(row.reflection_text, 180)
  return (
    <li className="border border-gray-200 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            <time dateTime={row.applied_on ?? row.created_at}>
              {formatDate(row.applied_on ?? row.created_at)}
            </time>
            {row.overall_rating !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Stars n={row.overall_rating} />
                </span>
              </>
            )}
            {row.students_engaged_pct !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span>{row.students_engaged_pct}% συμμετοχή</span>
              </>
            )}
            {row.prompt_id && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  href={`/prompts/${row.prompt_id}`}
                  className="text-sky-700 hover:underline"
                >
                  συνδεδεμένο σενάριο
                </Link>
              </>
            )}
          </div>

          <Link
            href={`/journal/${row.id}`}
            className="mt-1 block text-base font-semibold text-gray-900 hover:underline"
          >
            {row.title || 'Χωρίς τίτλο'}
          </Link>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
            {preview}
          </p>

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 5).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs"
                >
                  {TAG_LABELS[t] ?? t}
                </span>
              ))}
              {tags.length > 5 && (
                <span className="text-xs text-gray-400">
                  +{tags.length - 5} ακόμα
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n} από 5`} className="text-amber-500">
      {'★'.repeat(n)}
      <span className="text-gray-300">{'★'.repeat(5 - n)}</span>
    </span>
  )
}

// ── Filters ─────────────────────────────────────────────────────
function FilterBar({
  activeRating,
  activeHasPrompt,
}: {
  activeRating: number | null
  activeHasPrompt: boolean | null
}) {
  function href(overrides: Record<string, string | null>) {
    const p = new URLSearchParams()
    const r =
      'rating' in overrides
        ? overrides.rating
        : activeRating !== null
          ? String(activeRating)
          : null
    const h =
      'has_prompt' in overrides
        ? overrides.has_prompt
        : activeHasPrompt === null
          ? null
          : String(activeHasPrompt)
    if (r) p.set('rating', r)
    if (h) p.set('has_prompt', h)
    const q = p.toString()
    return q ? `?${q}` : '?'
  }

  return (
    <div className="space-y-2 mb-5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-gray-500">Αξιολόγηση:</span>
        <Chip
          href={href({ rating: null })}
          active={activeRating === null}
          label="Όλες"
        />
        {[5, 4, 3, 2, 1].map((r) => (
          <Chip
            key={r}
            href={href({ rating: String(r) })}
            active={activeRating === r}
            label={`${r}★`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-gray-500">Σύνδεση:</span>
        <Chip
          href={href({ has_prompt: null })}
          active={activeHasPrompt === null}
          label="Όλες"
        />
        <Chip
          href={href({ has_prompt: 'true' })}
          active={activeHasPrompt === true}
          label="Με σενάριο"
        />
        <Chip
          href={href({ has_prompt: 'false' })}
          active={activeHasPrompt === false}
          label="Free-form"
        />
      </div>
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

// Local wrapper γύρω από το shared <EmptyState> με journal-specific copy.
function JournalEmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <EmptyState
        variant="filtered"
        title="Καμία καταχώρηση"
        description="Καμία καταχώρηση δεν ταιριάζει με αυτά τα φίλτρα. Δοκίμασε να αλλάξεις την αξιολόγηση ή το σύνδεσμο σεναρίου."
        primaryCta={{ label: 'Καθαρισμός φίλτρων', href: '/journal' }}
      />
    )
  }
  return (
    <EmptyState
      icon="journal"
      title="Άδειο ημερολόγιο"
      description="Κάθε φορά που εφαρμόζεις ένα σενάριο, κράτα μια σύντομη σημείωση — τι δούλεψε, τι όχι. Με τον καιρό, τα μοτίβα γίνονται ορατά και διδάσκουν για την επόμενη φορά."
      primaryCta={{ label: 'Γράψε την πρώτη σου', href: '/journal/new' }}
      secondaryCta={{ label: 'Δες τα σενάριά σου', href: '/saved' }}
      hints={[
        'Δίνε μια αξιολόγηση 1–5 για να ξεχωρίζεις τις πετυχημένες ώρες.',
        'Tags σαν "ψηλή συμμετοχή" ή "χρειάζεται διαφοροποίηση" σε βοηθούν να βρίσκεις γρήγορα παρόμοιες περιπτώσεις.',
        'Σύνδεσε την καταχώρηση με ένα αποθηκευμένο σενάριο για να βλέπεις την εξέλιξή του στην πράξη.',
      ]}
    />
  )
}

function Pagination({
  offset,
  total,
  rating,
  hasPrompt,
}: {
  offset: number
  total: number
  rating: number | null
  hasPrompt: boolean | null
}) {
  const prev = Math.max(0, offset - PAGE_SIZE)
  const next = offset + PAGE_SIZE
  function hrefWith(off: number) {
    const p = new URLSearchParams()
    if (rating !== null) p.set('rating', String(rating))
    if (hasPrompt !== null) p.set('has_prompt', String(hasPrompt))
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
          ← Προηγούμενες
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-gray-300">← Προηγούμενες</span>
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
          Επόμενες →
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-gray-300">Επόμενες →</span>
      )}
    </nav>
  )
}

// ── Helpers ─────────────────────────────────────────────────────
function pickStr(v: string | string[] | undefined): string | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function clamp(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + '…'
}

function formatDate(iso: string): string {
  try {
    // Αν είναι DATE only (YYYY-MM-DD), το Intl το ερμηνεύει σε UTC — κάνει
    // off-by-one σε Ελλάδα. Οπότε αν δεν έχει ώρα, προσθέτουμε T12:00:00 local.
    const str = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso
    return new Intl.DateTimeFormat('el-GR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(str))
  } catch {
    return iso.slice(0, 10)
  }
}
