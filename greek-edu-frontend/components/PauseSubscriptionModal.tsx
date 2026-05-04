'use client'

// components/PauseSubscriptionModal.tsx
// Εμφανίζεται Μάιο-Ιούνιο ως εναλλακτική της ακύρωσης.

import { useEffect, useRef, useState } from 'react'

interface PauseModalProps {
  onClose: () => void
  onPause: (months: number) => Promise<void>
}

export function PauseSubscriptionModal({ onClose, onPause }: PauseModalProps) {
  const [months, setMonths] = useState(2)
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // ESC key και focus trap (accessibility)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', handleKey)

    // Auto-focus στο modal
    dialogRef.current?.focus()

    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, loading])

  async function handle() {
    if (loading) return
    setLoading(true)
    try {
      await onPause(months)
      onClose()
    } catch (err) {
      console.error('pause failed', err)
      setLoading(false)
    }
  }

  const resumeDate = new Date()
  resumeDate.setMonth(resumeDate.getMonth() + months)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        // Click έξω από το modal → close (αν δεν είναι loading)
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        tabIndex={-1}
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl focus:outline-none"
      >
        <div className="text-center mb-5">
          <div className="text-3xl mb-2" aria-hidden="true">
            ☀️
          </div>
          <h2 id="pause-title" className="text-lg font-semibold">
            Καλοκαιρινή Παύση
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Παύσε τη συνδρομή αντί να την ακυρώσεις. Τα δεδομένα σου σώζονται.
          </p>
        </div>

        <div className="mb-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Διάρκεια
          </div>
          <div
            role="radiogroup"
            aria-label="Επίλεξε διάρκεια παύσης"
            className="grid grid-cols-3 gap-2"
          >
            {[1, 2, 3].map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={months === m}
                onClick={() => setMonths(m)}
                className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  months === m
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                {m} μήν{m === 1 ? 'ας' : 'ες'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Επιστροφή{' '}
            {resumeDate.toLocaleDateString('el-GR', {
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Άκυρο
          </button>
          <button
            type="button"
            onClick={handle}
            disabled={loading}
            className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-gray-700"
          >
            {loading ? 'Παύση...' : 'Επιβεβαίωση'}
          </button>
        </div>
      </div>
    </div>
  )
}
