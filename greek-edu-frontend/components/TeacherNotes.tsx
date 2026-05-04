'use client'

// components/TeacherNotes.tsx
//
// Textarea για τις προσωπικές σημειώσεις του δασκάλου πάνω σε ένα σενάριο.
// Auto-save με 1.5s debounce μέσω PATCH /api/prompts/:id/notes.

import { useState, useEffect, useRef, useCallback } from 'react'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function TeacherNotes({
  promptId,
  initialNotes,
}: {
  promptId: string
  initialNotes: string | null
}) {
  const [notes, setNotes]   = useState(initialNotes ?? '')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(
    async (value: string) => {
      setStatus('saving')
      try {
        const res = await fetch(`/api/prompts/${promptId}/notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: value }),
        })
        setStatus(res.ok ? 'saved' : 'error')
      } catch {
        setStatus('error')
      }
    },
    [promptId],
  )

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setNotes(v)
    setStatus('idle')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void save(v), 1500)
  }

  // Καθάρισε timer στο unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const statusText =
    status === 'saved'  ? '✓ Αποθηκεύτηκε' :
    status === 'saving' ? 'Αποθήκευση…'     :
    status === 'error'  ? '✕ Σφάλμα'        : ''

  const statusColor =
    status === 'saved'  ? 'text-emerald-600' :
    status === 'saving' ? 'text-gray-400'    :
    status === 'error'  ? 'text-rose-500'    : 'text-transparent'

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          📝 Σημειώσεις δασκάλου
        </h2>
        <span className={`text-xs transition-colors ${statusColor}`} aria-live="polite">
          {statusText || '​'/* zero-width space για να κρατάει ύψος */}
        </span>
      </div>
      <textarea
        value={notes}
        onChange={handleChange}
        placeholder="Πρόσθεσε τις δικές σου σημειώσεις — παρατηρήσεις από την τάξη, τροποποιήσεις, ιδέες για επόμενη φορά…"
        rows={4}
        maxLength={5000}
        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-colors resize-y text-gray-700 placeholder:text-gray-400"
      />
      <p className="text-xs text-gray-400 mt-1">
        {`${notes.length}/5000 χαρακτήρες · Αποθηκεύεται αυτόματα`}
      </p>
    </section>
  )
}
