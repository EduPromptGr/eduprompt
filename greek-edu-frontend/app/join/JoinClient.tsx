'use client'

// app/join/JoinClient.tsx
// Αποθηκεύει το referral code στο sessionStorage και
// κατευθύνει τον χρήστη στο signup.

import { useEffect } from 'react'
import Link from 'next/link'

const REFERRAL_STORAGE_KEY = 'eduprompt_ref'

export default function JoinClient({ refCode }: { refCode: string }) {
  // Αποθήκευση code μόλις φορτωθεί η σελίδα
  useEffect(() => {
    if (refCode) {
      try {
        sessionStorage.setItem(REFERRAL_STORAGE_KEY, refCode)
      } catch {
        // sessionStorage unavailable (privacy mode) — continue
      }
    }
  }, [refCode])

  return (
    <Link
      href="/signup"
      className="block w-full py-3 rounded-xl bg-sky-600 text-white font-semibold text-sm text-center hover:bg-sky-700 transition-colors"
    >
      Δημιουργία δωρεάν λογαριασμού →
    </Link>
  )
}
