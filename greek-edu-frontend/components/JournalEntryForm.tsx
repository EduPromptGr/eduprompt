'use client'

// components/JournalEntryForm.tsx
//
// Reusable form για create + edit journal entries. Χρησιμοποιείται:
//   - Σε modal από το prompt view page ("Πρόσθεσε αναστοχασμό")
//   - Σε dedicated /journal/new page
//   - Σε /journal/[id]/edit page για να επεξεργαστεί ο user ένα entry
//
// Props:
//   - `initial` — αν υπάρχει, η φόρμα σε edit mode (calls PATCH)
//   - `promptId` — prefill prompt link (read-only στη φόρμα)
//   - `onSaved(entry)` — callback μετά από success
//
// Validation mirror των server-side rules στο lib/journal/validation.ts.
// Οποιαδήποτε αλλαγή στη ΒΔ → ενημέρωσε και εκεί και εδώ.

import { useState, useMemo, FormEvent } from 'react'

// ── Tag presets (κράτα sync με lib/journal/validation.ts) ────────
export const TAG_PRESETS = [
  { value: 'worked_well', label: 'Λειτούργησε καλά' },
  { value: 'need_differentiation', label: 'Χρειάζεται διαφοροποίηση' },
  { value: 'time_exceeded', label: 'Ξεπέρασα τον χρόνο' },
  { value: 'time_short', label: 'Ολοκληρώθηκε νωρίτερα' },
  { value: 'high_engagement', label: 'Ψηλή συμμετοχή' },
  { value: 'low_engagement', label: 'Χαμηλή συμμετοχή' },
  { value: 'missed_objective', label: 'Δεν πέτυχα τον στόχο' },
  { value: 'exceeded_objective', label: 'Πέτυχα και παραπάνω' },
  { value: 'materials_issue', label: 'Πρόβλημα με υλικά' },
  { value: 'classroom_management', label: 'Διαχείριση τάξης' },
] as const

export interface JournalEntry {
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

interface Props {
  /** Αν δίνεται → edit mode (PATCH), αλλιώς create (POST) */
  initial?: JournalEntry | null
  /** Αν δίνεται → το entry συνδέεται με συγκεκριμένο prompt */
  promptId?: string | null
  onSaved?: (entry: JournalEntry) => void
  onCancel?: () => void
}

export function JournalEntryForm({
  initial = null,
  promptId = null,
  onSaved,
  onCancel,
}: Props) {
  const editing = !!initial

  // Σημείωση: αν το initial έχει prompt_id, κρατάμε αυτό. Διαφορετικά
  // χρησιμοποιούμε το prop `promptId`. Αν κανένα → free-form reflection.
  const linkedPromptId = initial?.prompt_id ?? promptId ?? null

  const [title, setTitle] = useState(initial?.title ?? '')
  const [reflection, setReflection] = useState(initial?.reflection_text ?? '')
  const [rating, setRating] = useState<number | null>(
    initial?.overall_rating ?? null,
  )
  const [engaged, setEngaged] = useState<number | null>(
    initial?.students_engaged_pct ?? null,
  )
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [appliedOn, setAppliedOn] = useState<string>(
    initial?.applied_on ?? todayISO(),
  )

  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Character count για το reflection (μέγιστο 10k)
  const charCount = reflection.length
  const tooLong = charCount > 10000
  const tooShort = reflection.trim().length === 0

  // Field issues (σε real-time, αν και το server θα ξανατσεκάρει)
  const fieldIssues = useMemo(() => {
    const issues: string[] = []
    if (tooShort) issues.push('Η σκέψη σου είναι απαραίτητη')
    if (tooLong) issues.push(`Υπερβαίνεις τους 10000 χαρακτήρες (${charCount})`)
    if (title.length > 200) issues.push('Ο τίτλος δεν μπορεί να ξεπερνά τους 200 χαρακτήρες')
    if (engaged !== null && (engaged < 0 || engaged > 100))
      issues.push('Το % συμμετοχής πρέπει να είναι 0-100')
    return issues
  }, [tooShort, tooLong, charCount, title, engaged])

  function toggleTag(value: string) {
    setTags((curr) =>
      curr.includes(value) ? curr.filter((t) => t !== value) : [...curr, value],
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (fieldIssues.length > 0 || status === 'saving') return

    setStatus('saving')
    setErrorMsg(null)

    const payload = {
      title: title.trim() || null,
      reflection_text: reflection.trim(),
      overall_rating: rating,
      students_engaged_pct: engaged,
      tags: tags.length > 0 ? tags : null,
      applied_on: appliedOn || null,
      // Στο create link-άρουμε· στο edit ο server ξέρει ήδη
      ...(editing ? {} : { prompt_id: linkedPromptId }),
    }

    try {
      const url = editing ? `/api/journal/${initial!.id}` : '/api/journal'
      const method = editing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const issues = Array.isArray(body.issues)
          ? body.issues
              .map((i: { field: string; message: string }) => `${i.field}: ${i.message}`)
              .join(' · ')
          : null
        throw new Error(issues || body.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setStatus('idle')
      onSaved?.(data.entry as JournalEntry)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Αποτυχία αποθήκευσης')
    }
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-2xl mx-auto space-y-4"
      aria-label={editing ? 'Επεξεργασία αναστοχασμού' : 'Νέος αναστοχασμός'}
      noValidate
    >
      {linkedPromptId && (
        <div
          className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600"
          role="note"
        >
          Συνδεδεμένο με σενάριο · <code className="font-mono text-xs">{linkedPromptId.slice(0, 8)}…</code>
        </div>
      )}

      {/* Title */}
      <Field label="Τίτλος (προαιρετικός)">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="π.χ. Κλάσματα με Γ'1"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        />
      </Field>

      {/* Reflection */}
      <Field label="Αναστοχασμός *" required>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={8}
          placeholder="Πώς πήγε το μάθημα; Τι παρατήρησες στα παιδιά; Τι θα άλλαζες την επόμενη φορά;"
          className={`w-full border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:border-gray-400 ${
            tooLong ? 'border-red-300' : ''
          }`}
          required
          maxLength={10200}
        />
        <div
          className={`text-xs text-right mt-1 ${
            tooLong ? 'text-red-600 font-medium' : 'text-gray-400'
          }`}
        >
          {charCount.toLocaleString('el-GR')} / 10.000
        </div>
      </Field>

      {/* Applied on date */}
      <Field label="Ημερομηνία εφαρμογής">
        <input
          type="date"
          value={appliedOn}
          onChange={(e) => setAppliedOn(e.target.value)}
          max={todayISO()}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        />
      </Field>

      {/* Overall rating 1-5 */}
      <Field label="Πώς πήγε συνολικά;">
        <div
          role="radiogroup"
          aria-label="Συνολική αξιολόγηση"
          className="inline-flex items-center gap-2"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} ${n === 1 ? 'αστέρι' : 'αστέρια'}`}
              onClick={() => setRating(rating === n ? null : n)}
              className={`w-9 h-9 rounded-full border text-sm font-medium transition-colors ${
                rating !== null && n <= rating
                  ? 'bg-amber-100 border-amber-300 text-amber-700'
                  : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
              }`}
            >
              {n}
            </button>
          ))}
          {rating !== null && (
            <button
              type="button"
              onClick={() => setRating(null)}
              className="text-xs text-gray-400 hover:text-gray-600 ml-2"
            >
              καθάρισμα
            </button>
          )}
        </div>
      </Field>

      {/* Students engaged % */}
      <Field
        label="% μαθητών που συμμετείχαν ενεργά"
        hint="Προαιρετικό — αυτο-αναφορά"
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={engaged ?? 50}
            onChange={(e) => setEngaged(parseInt(e.target.value, 10))}
            className="flex-1"
          />
          <div className="text-sm text-gray-700 w-12 text-right tabular-nums">
            {engaged === null ? '—' : `${engaged}%`}
          </div>
          {engaged !== null && (
            <button
              type="button"
              onClick={() => setEngaged(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              skip
            </button>
          )}
        </div>
      </Field>

      {/* Tags */}
      <Field label="Ετικέτες" hint="Επίλεξε όσες ταιριάζουν">
        <div className="flex flex-wrap gap-1.5">
          {TAG_PRESETS.map((t) => {
            const checked = tags.includes(t.value)
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => toggleTag(t.value)}
                aria-pressed={checked}
                className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                  checked
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </Field>

      {/* Field issues — shown pre-submit */}
      {fieldIssues.length > 0 && (
        <ul
          role="alert"
          className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5"
        >
          {fieldIssues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}

      {/* Server error */}
      {errorMsg && (
        <div
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {errorMsg}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            Ακύρωση
          </button>
        )}
        <button
          type="submit"
          disabled={status === 'saving' || fieldIssues.length > 0}
          className="flex-1 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium disabled:opacity-40"
        >
          {status === 'saving'
            ? 'Αποθήκευση...'
            : editing
              ? 'Αποθήκευση αλλαγών'
              : 'Δημιουργία αναστοχασμού'}
        </button>
      </div>
    </form>
  )
}

// ── Helpers ─────────────────────────────────────────────────────
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {hint && (
        <span className="block text-xs text-gray-400 mb-1.5">{hint}</span>
      )}
      {children}
    </label>
  )
}

function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
