'use client'

// components/admin/ErrorReportActions.tsx
//
// Client component για τα admin actions σε ένα error report:
//   - αλλαγή priority (low/normal/high/critical)
//   - αλλαγή status με ένα κλικ (mark reviewing / resolve / dismiss / reopen)
//   - edit resolution note (inline textarea που εμφανίζεται όταν χρειαστεί)
//
// State: optimistic — αν η PATCH αποτύχει κάνουμε rollback στην προηγούμενη
// τιμή και δείχνουμε error string κάτω από τα buttons. Δεν χρησιμοποιούμε
// router.refresh() κάθε φορά γιατί τρέχει full server round-trip· μόνο όταν
// ο admin πατήσει explicit "reload" ή αλλάξει filter.
//
// A11y: κάθε button έχει aria-pressed για το ενεργό status, aria-label για τα
// dropdowns (priority), και live region για τα error messages.

import { useState, useTransition } from 'react'

type Status = 'pending' | 'reviewing' | 'resolved' | 'dismissed'
type Priority = 'low' | 'normal' | 'high' | 'critical'

interface Props {
  reportId: string
  initialStatus: Status
  initialPriority: Priority
  initialNote?: string | null
  onUpdated?: (next: {
    status: Status
    priority: Priority
    resolution_note: string | null
  }) => void
}

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Εκκρεμεί',
  reviewing: 'Σε έλεγχο',
  resolved: 'Επιλύθηκε',
  dismissed: 'Απορρίφθηκε',
}

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Χαμηλή',
  normal: 'Κανονική',
  high: 'Υψηλή',
  critical: 'Κρίσιμη',
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-300',
  normal: 'bg-sky-50 text-sky-700 border-sky-300',
  high: 'bg-orange-50 text-orange-700 border-orange-300',
  critical: 'bg-rose-50 text-rose-700 border-rose-300',
}

export default function ErrorReportActions({
  reportId,
  initialStatus,
  initialPriority,
  initialNote,
  onUpdated,
}: Props) {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [priority, setPriority] = useState<Priority>(initialPriority)
  const [note, setNote] = useState<string>(initialNote ?? '')
  const [noteOpen, setNoteOpen] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function patch(
    patchBody: Partial<{ status: Status; priority: Priority; resolution_note: string | null }>,
    rollback: () => void,
  ) {
    setError(null)
    // React's TransitionFunction type απαιτεί sync callback — οπότε κάνουμε
    // το async work ως fire-and-forget μέσα σε IIFE. Το startTransition
    // σηματοδοτεί απλά ότι το setState που θα ακολουθήσει είναι
    // low-priority.
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/error-reports/${reportId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patchBody),
          })
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            rollback()
            setError(j.error ?? `HTTP ${res.status}`)
            return
          }
          const json = (await res.json()) as {
            report?: { status: Status; priority: Priority; resolution_note: string | null }
          }
          if (json.report && onUpdated) onUpdated({
            status: json.report.status,
            priority: json.report.priority,
            resolution_note: json.report.resolution_note ?? null,
          })
        } catch (e) {
          rollback()
          setError((e as Error).message || 'Network error')
        }
      })()
    })
  }

  function changeStatus(next: Status) {
    if (next === status) return
    const prev = status
    setStatus(next)
    // Αν ο admin resolve/dismiss χωρίς σημείωση, άνοιξε το note editor
    if ((next === 'resolved' || next === 'dismissed') && !note.trim()) {
      setNoteOpen(true)
    }
    patch({ status: next }, () => setStatus(prev))
  }

  function changePriority(next: Priority) {
    if (next === priority) return
    const prev = priority
    setPriority(next)
    patch({ priority: next }, () => setPriority(prev))
  }

  function saveNote() {
    const trimmed = note.trim()
    patch(
      { resolution_note: trimmed.length > 0 ? trimmed : null },
      () => {
        // nothing to rollback visually — textarea κρατάει την νέα τιμή
      },
    )
    setNoteOpen(false)
  }

  return (
    <div className="space-y-3">
      {/* Priority pill group */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">Προτεραιότητα</div>
        <div role="radiogroup" aria-label="Προτεραιότητα αναφοράς" className="flex flex-wrap gap-1.5">
          {(['low', 'normal', 'high', 'critical'] as Priority[]).map((p) => {
            const active = p === priority
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending}
                onClick={() => changePriority(p)}
                className={`px-2.5 py-1 rounded-full border text-xs font-medium transition ${
                  active
                    ? PRIORITY_COLORS[p] + ' ring-2 ring-offset-1 ring-current'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Status action buttons */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">Κατάσταση</div>
        <div className="flex flex-wrap gap-1.5">
          {(['pending', 'reviewing', 'resolved', 'dismissed'] as Status[]).map((s) => {
            const active = s === status
            const tone =
              s === 'resolved'
                ? 'emerald'
                : s === 'dismissed'
                  ? 'gray'
                  : s === 'reviewing'
                    ? 'sky'
                    : 'amber'
            const activeClasses: Record<string, string> = {
              emerald: 'bg-emerald-600 text-white border-emerald-600',
              gray: 'bg-gray-600 text-white border-gray-600',
              sky: 'bg-sky-600 text-white border-sky-600',
              amber: 'bg-amber-500 text-white border-amber-500',
            }
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                disabled={pending}
                onClick={() => changeStatus(s)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                  active
                    ? activeClasses[tone]
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                {STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Resolution note editor */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-medium text-gray-500">Σημείωση επίλυσης</div>
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="text-xs text-sky-700 hover:underline"
          >
            {noteOpen ? 'Ακύρωση' : note.trim().length > 0 ? 'Επεξεργασία' : 'Προσθήκη'}
          </button>
        </div>
        {noteOpen ? (
          <div className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 2000))}
              rows={3}
              placeholder="Π.χ. «Διορθώθηκε στο σενάριο — το prompt αναγεννήθηκε»"
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{note.length}/2000</span>
              <button
                type="button"
                disabled={pending}
                onClick={saveNote}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
              >
                Αποθήκευση
              </button>
            </div>
          </div>
        ) : note.trim().length > 0 ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap border border-gray-200 rounded-lg p-2 bg-gray-50">
            {note}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">— καμία σημείωση —</p>
        )}
      </div>

      {error && (
        <div role="alert" className="text-xs text-rose-600">
          Σφάλμα: {error}
        </div>
      )}
    </div>
  )
}
