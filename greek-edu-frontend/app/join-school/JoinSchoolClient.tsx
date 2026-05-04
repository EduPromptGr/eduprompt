'use client'

// app/join-school/JoinSchoolClient.tsx
// Κουμπί αποδοχής πρόσκλησης — POST /api/school/join.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinSchoolClient({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    if (busy) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch('/api/school/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
        return
      }

      // Επιτυχία — πήγαινε στο generate
      router.replace('/generate')
    } catch {
      setError('Πρόβλημα σύνδεσης. Δοκίμασε ξανά.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleJoin}
        disabled={busy}
        aria-busy={busy}
        className="w-full py-3 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 disabled:opacity-50 transition-colors"
      >
        {busy ? 'Γίνεται αποδοχή…' : 'Αποδοχή πρόσκλησης'}
      </button>
    </div>
  )
}
