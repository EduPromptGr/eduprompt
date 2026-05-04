'use client'

// components/PromptFeedback.tsx
//
// Τα 3 UI controls που τροφοδοτούν το quality flywheel:
//
//   <RatingStars />       — 1-5 αστέρια (γράφει στο rate_prompt RPC)
//   <SaveButton />        — bookmark toggle (γράφει στο /save endpoint)
//   <ReportErrorDialog /> — modal με category + description (record_error_report)
//
// Κάθε component:
// - είναι client-side ('use client') — χρειάζεται state/hover/keyboard
// - κάνει optimistic update και rollback σε error (αισθάνεται γρήγορο,
//   αλλά αν χτυπήσει το server γίνεται revert + error message)
// - εκπέμπει ρολόγι για screen readers (role="status" ή role="alert")
// - δεν έχει exotic deps — μόνο React + Tailwind classes που ήδη
//   υπάρχουν στο build (κοίτα NPSSurvey.tsx για pattern)
//
// Consumer pattern:
//   <div className="flex items-center gap-3">
//     <RatingStars promptId={p.id} initialRating={p.rating} />
//     <SaveButton promptId={p.id} initialSaved={p.saved} />
//     <ReportErrorDialog promptId={p.id} />
//   </div>

import { useState, useEffect, useRef } from 'react'

// ================================================================
// RatingStars
// ================================================================

interface RatingStarsProps {
  promptId: string
  initialRating?: number | null
  /** Called με το νέο rating μετά από επιτυχή αποθήκευση */
  onRated?: (rating: number) => void
}

export function RatingStars({
  promptId,
  initialRating = null,
  onRated,
}: RatingStarsProps) {
  const [rating, setRating] = useState<number | null>(initialRating ?? null)
  const [hover, setHover] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function submit(value: number) {
    if (status === 'saving') return
    const prev = rating
    // Optimistic
    setRating(value)
    setStatus('saving')
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/prompts/${promptId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setStatus('idle')
      onRated?.(value)
    } catch (err) {
      // Rollback
      setRating(prev)
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Αποτυχία αποθήκευσης')
    }
  }

  // Το currently-visible value είναι το hover όταν υπάρχει, αλλιώς το rating
  const visible = hover ?? rating ?? 0

  return (
    <div className="inline-flex flex-col items-start">
      <div
        role="radiogroup"
        aria-label="Αξιολόγηση σεναρίου"
        className="inline-flex items-center gap-0.5"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ${n === 1 ? 'αστέρι' : 'αστέρια'}`}
            disabled={status === 'saving'}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => submit(n)}
            onKeyDown={(e) => {
              // Arrow keys — standard radio-group keyboard support
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault()
                const next = Math.min(5, (rating ?? 0) + 1)
                submit(next)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault()
                const prev = Math.max(1, (rating ?? 0) - 1)
                submit(prev)
              }
            }}
            className={`p-1 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded ${
              status === 'saving' ? 'opacity-60 cursor-wait' : 'hover:scale-110'
            }`}
          >
            <Star filled={n <= visible} />
          </button>
        ))}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mt-1 text-xs text-red-600"
        >
          {errorMsg}
        </div>
      )}
      {status === 'idle' && rating && !errorMsg && (
        <div role="status" className="mt-1 text-xs text-gray-500">
          Αξιολόγησες με {rating} {rating === 1 ? 'αστέρι' : 'αστέρια'}
        </div>
      )}
    </div>
  )
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? '#f59e0b' : 'none'}
      stroke={filled ? '#f59e0b' : '#9ca3af'}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

// ================================================================
// SaveButton
// ================================================================

interface SaveButtonProps {
  promptId: string
  initialSaved?: boolean
  onToggle?: (saved: boolean) => void
}

export function SaveButton({
  promptId,
  initialSaved = false,
  onToggle,
}: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function toggle() {
    if (status === 'saving') return
    const next = !saved
    const prev = saved
    setSaved(next)
    setStatus('saving')
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/prompts/${promptId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saved: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setStatus('idle')
      onToggle?.(next)
    } catch (err) {
      setSaved(prev)
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Αποτυχία αποθήκευσης')
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={toggle}
        disabled={status === 'saving'}
        aria-pressed={saved}
        aria-label={saved ? 'Κατάργηση αποθήκευσης' : 'Αποθήκευση σεναρίου'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
          saved
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
        } ${status === 'saving' ? 'opacity-60 cursor-wait' : ''}`}
      >
        <Bookmark filled={saved} />
        <span>{saved ? 'Αποθηκεύτηκε' : 'Αποθήκευση'}</span>
      </button>
      {errorMsg && (
        <div role="alert" className="mt-1 text-xs text-red-600">
          {errorMsg}
        </div>
      )}
    </div>
  )
}

function Bookmark({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

// ================================================================
// ReportErrorDialog
// ================================================================

const ERROR_CATEGORIES: {
  value: ErrorCategory
  label: string
  hint: string
}[] = [
  {
    value: 'pedagogical_error',
    label: 'Παιδαγωγικό λάθος',
    hint: 'π.χ. λάθος εφαρμογή θεωρίας Vygotsky / Bloom',
  },
  {
    value: 'curriculum_mismatch',
    label: 'Δεν ταιριάζει με το ΑΠΣ',
    hint: 'Εκτός θεματικής ενότητας ή τάξης',
  },
  {
    value: 'inappropriate_content',
    label: 'Ακατάλληλο περιεχόμενο',
    hint: 'Για την ηλικιακή ομάδα',
  },
  {
    value: 'factual_error',
    label: 'Πραγματολογικό λάθος',
    hint: 'Λάθος πληροφορία, ιστορικό λάθος κλπ.',
  },
  {
    value: 'language_quality',
    label: 'Γλωσσικά λάθη',
    hint: 'Ορθογραφικά, συντακτικά',
  },
  { value: 'other', label: 'Άλλο', hint: 'Πες μας τι συμβαίνει' },
]

export type ErrorCategory =
  | 'pedagogical_error'
  | 'curriculum_mismatch'
  | 'inappropriate_content'
  | 'factual_error'
  | 'language_quality'
  | 'other'

interface ReportErrorDialogProps {
  promptId: string
  onReported?: () => void
}

export function ReportErrorDialog({
  promptId,
  onReported,
}: ReportErrorDialogProps) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<ErrorCategory>('pedagogical_error')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Reset state όταν κλείνει
  useEffect(() => {
    if (!open) {
      setStatus('idle')
      setErrorMsg(null)
      setDescription('')
      setCategory('pedagogical_error')
    }
  }, [open])

  // Escape key → close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Autofocus dialog for screen readers όταν ανοίγει
  useEffect(() => {
    if (open && dialogRef.current) dialogRef.current.focus()
  }, [open])

  async function submit() {
    const desc = description.trim()
    if (!desc) {
      setErrorMsg('Γράψε μια σύντομη περιγραφή')
      return
    }
    if (desc.length > 2000) {
      setErrorMsg('Η περιγραφή δεν πρέπει να ξεπερνά τους 2000 χαρακτήρες')
      return
    }

    setStatus('submitting')
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/prompts/${promptId}/report-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description: desc }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setStatus('success')
      onReported?.()
      // Auto-close μετά από 1.5s
      setTimeout(() => setOpen(false), 1500)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Αποτυχία αποστολής')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        aria-haspopup="dialog"
      >
        <Flag />
        <span>Αναφορά</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            ref={dialogRef}
            tabIndex={-1}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 outline-none"
          >
            <h2
              id="report-title"
              className="text-lg font-semibold text-gray-900 mb-1"
            >
              Αναφορά προβλήματος
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Μας βοηθάς να βελτιώσουμε τα σενάρια — ευχαριστούμε!
            </p>

            {/* Category radios */}
            <fieldset className="mb-4">
              <legend className="text-xs font-medium text-gray-700 mb-2">
                Τύπος προβλήματος
              </legend>
              <div className="space-y-1.5">
                {ERROR_CATEGORIES.map((c) => (
                  <label
                    key={c.value}
                    className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                      category === c.value
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={c.value}
                      checked={category === c.value}
                      onChange={() => setCategory(c.value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">
                        {c.label}
                      </span>
                      <span className="block text-xs text-gray-500">{c.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Description */}
            <label className="block mb-4">
              <span className="text-xs font-medium text-gray-700 mb-1 block">
                Περιγραφή
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Πες μας τι δεν λειτούργησε ή τι θα θέλαμε να διορθώσουμε..."
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-gray-400"
              />
              <span className="text-xs text-gray-400 block mt-1 text-right">
                {description.length}/2000
              </span>
            </label>

            {errorMsg && (
              <div
                role="alert"
                className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5"
              >
                {errorMsg}
              </div>
            )}

            {status === 'success' && (
              <div
                role="status"
                className="mb-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5"
              >
                Ευχαριστούμε! Η αναφορά σου καταγράφηκε.
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={status === 'submitting' || status === 'success'}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-40"
              >
                {status === 'submitting' ? 'Αποστολή...' : 'Υποβολή αναφοράς'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Flag() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}
