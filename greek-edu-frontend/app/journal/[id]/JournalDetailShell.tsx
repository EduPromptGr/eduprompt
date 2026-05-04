'use client'

// app/journal/[id]/JournalDetailShell.tsx
//
// Client shell που κρατάει το state view/edit και το locally-updated
// entry (μετά από PATCH δεν χρειάζεται full server refresh). Φτιάχνει:
//   - view mode: τίτλος, ημερομηνία, rating stars, engagement %, tags,
//                linked prompt link, reflection text
//   - edit mode: mount στο <JournalEntryForm initial={entry}> που κάνει PATCH
//   - delete: confirm dialog → DELETE /api/journal/:id → router.push('/journal')
//
// Κρατάμε το entry σε state (όχι απλά prop) ώστε μετά από PATCH να
// βλέπει ο user άμεσα τις αλλαγές. Δεν χρειάζεται router.refresh() —
// άρα και δεν γίνεται re-render του server component (φθηνότερο).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  JournalEntryForm,
  type JournalEntry,
} from '@/components/JournalEntryForm'

interface LinkedPrompt {
  id: string
  title: string | null
  grade: string
  subject: string
}

interface Props {
  initial: JournalEntry
  linkedPrompt: LinkedPrompt | null
}

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

export default function JournalDetailShell({ initial, linkedPrompt }: Props) {
  const router = useRouter()
  const [entry, setEntry] = useState<JournalEntry>(initial)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    setDeleteError(null)
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/journal/${entry.id}`, {
            method: 'DELETE',
          })
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            setDeleteError(j.error ?? `HTTP ${res.status}`)
            return
          }
          // Redirect πίσω στη λίστα — ο server component θα ξαναφορτώσει
          // την updated version χωρίς το διαγραμμένο entry.
          router.push('/journal')
          router.refresh()
        } catch (e) {
          setDeleteError((e as Error).message || 'Network error')
        }
      })()
    })
  }

  if (mode === 'edit') {
    return (
      <>
        <h1 className="text-2xl font-bold mb-1">Επεξεργασία καταχώρησης</h1>
        <p className="text-sm text-gray-600 mb-5">
          Άλλαξε ό,τι χρειάζεται και πάτα "Αποθήκευση".
        </p>
        <JournalEntryForm
          initial={entry}
          onSaved={(updated: JournalEntry) => {
            setEntry(updated)
            setMode('view')
          }}
          onCancel={() => setMode('view')}
        />
      </>
    )
  }

  // ── View mode ───────────────────────────────────────────────
  const tags = entry.tags ?? []
  return (
    <>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-gray-500 mb-1">
            <time dateTime={entry.applied_on ?? entry.created_at}>
              {formatDate(entry.applied_on ?? entry.created_at)}
            </time>
            {entry.updated_at !== entry.created_at && (
              <>
                {' · '}
                <span title={entry.updated_at}>
                  τελευταία αλλαγή {formatDate(entry.updated_at)}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold">{entry.title || 'Χωρίς τίτλο'}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
          >
            Επεξεργασία
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 text-sm hover:bg-rose-50"
          >
            Διαγραφή
          </button>
        </div>
      </header>

      {linkedPrompt && (
        <div className="mb-4 border border-sky-200 bg-sky-50 rounded-xl p-3 text-sm">
          <div className="text-xs text-sky-700 uppercase tracking-wide mb-0.5">
            Συνδεδεμένο σενάριο
          </div>
          <Link
            href={`/prompts/${linkedPrompt.id}`}
            className="font-medium text-sky-800 hover:underline"
          >
            {linkedPrompt.title || 'Σενάριο χωρίς τίτλο'}
          </Link>
          <div className="text-xs text-gray-600">
            {linkedPrompt.grade} Δημοτικού · {linkedPrompt.subject}
          </div>
        </div>
      )}

      {/* Metrics strip */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
        {entry.overall_rating !== null && (
          <MetricPill label="Αξιολόγηση">
            <Stars n={entry.overall_rating} />
            <span className="ml-1 text-xs text-gray-500">
              ({entry.overall_rating}/5)
            </span>
          </MetricPill>
        )}
        {entry.students_engaged_pct !== null && (
          <MetricPill label="Συμμετοχή μαθητών">
            {entry.students_engaged_pct}%
          </MetricPill>
        )}
        {entry.overall_rating === null &&
          entry.students_engaged_pct === null && (
            <span className="text-xs text-gray-400 italic">
              — χωρίς αριθμητικά στοιχεία —
            </span>
          )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs"
            >
              {TAG_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      )}

      {/* Reflection */}
      <section className="border border-gray-200 rounded-xl bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Αναστοχασμός
        </h2>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">
          {entry.reflection_text}
        </p>
      </section>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-heading"
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(false)
          }}
        >
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl">
            <h3 id="delete-heading" className="text-lg font-semibold">
              Διαγραφή καταχώρησης;
            </h3>
            <p className="text-sm text-gray-600 mt-2">
              Η διαγραφή είναι μόνιμη — δεν θα μπορείς να επαναφέρεις το
              κείμενο του αναστοχασμού.
            </p>
            {deleteError && (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                {deleteError}
              </p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {pending ? 'Διαγραφή…' : 'Ναι, διαγραφή'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MetricPill({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{children}</span>
    </div>
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

function formatDate(iso: string): string {
  try {
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
