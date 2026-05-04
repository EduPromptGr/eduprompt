'use client'

// app/school/SchoolInviteForm.tsx
// Client component: φόρμα πρόσκλησης εκπαιδευτικού (POST /api/school/invite).

import { useState } from 'react'

export default function SchoolInviteForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !email.trim()) return
    setError(null)
    setSuccess(false)
    setBusy(true)

    try {
      const res = await fetch('/api/school/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Αποτυχία αποστολής πρόσκλησης.')
        return
      }

      setSuccess(true)
      setEmail('')
    } catch {
      setError('Πρόβλημα σύνδεσης. Δοκίμασε ξανά.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 max-w-md">
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setError(null)
          setSuccess(false)
        }}
        placeholder="email εκπαιδευτικού"
        aria-label="Email νέου μέλους"
        required
        aria-required="true"
        className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-400 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !email}
        aria-busy={busy}
        className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {busy ? 'Αποστολή…' : 'Πρόσκληση'}
      </button>

      {success && (
        <p role="status" className="text-xs text-emerald-600 self-center sm:col-span-2">
          ✅ Πρόσκληση στάλθηκε!
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 self-center">
          {error}
        </p>
      )}
    </form>
  )
}
