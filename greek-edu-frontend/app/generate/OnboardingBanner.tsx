'use client'

// app/generate/OnboardingBanner.tsx
//
// Dismissible welcome banner για first-time users.
// Αποθηκεύει "dismissed" στο localStorage ώστε να μη φαίνεται ξανά.

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'eduprompt_onboarded'

export default function OnboardingBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Καλωσόρισμα"
      className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <p className="font-semibold text-base">
            Καλωσήλθες στο EduPrompt! 👋
          </p>
          <ul className="space-y-1 text-sky-800 list-none">
            <li>
              <span className="font-medium">1. Συμπλήρωσε τη φόρμα</span> —
              τάξη, μάθημα και στόχος αρκούν για να ξεκινήσεις.
            </li>
            <li>
              <span className="font-medium">2. Η AI δημιουργεί σενάριο</span>{' '}
              σε 4 παιδαγωγικές φάσεις με θεωρητικό πλαίσιο.
            </li>
            <li>
              <span className="font-medium">3. Αποθήκευσε ό,τι σου αρέσει</span>{' '}
              — τα σενάρια μένουν στο λογαριασμό σου για πάντα.
            </li>
          </ul>
        </div>

        <button
          onClick={dismiss}
          aria-label="Κλείσε το μήνυμα καλωσορίσματος"
          className="shrink-0 text-sky-400 hover:text-sky-700 transition-colors text-lg leading-none mt-0.5"
        >
          ✕
        </button>
      </div>

      <button
        onClick={dismiss}
        className="mt-3 text-xs font-medium text-sky-600 hover:underline"
      >
        Κατάλαβα, να μην το δω ξανά
      </button>
    </div>
  )
}
