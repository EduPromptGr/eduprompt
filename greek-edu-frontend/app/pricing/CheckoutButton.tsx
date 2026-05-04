'use client'

// components/CheckoutButton.tsx
//
// Κουμπί που ξεκινά Stripe Checkout για 'pro' ή 'school' πλάνο.
// Χρησιμοποιείται στο /pricing και στο /generate (rate-limit banner).
//
// Flow:
//   1. POST /api/checkout { plan }
//   2. Αν 401 → redirect στο /login?redirect=/pricing
//   3. Αν 409 → δείξε "Είσαι ήδη συνδρομητής"
//   4. Αν ok → window.location.href = session.url (Stripe hosted page)

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  plan: 'pro' | 'school'
  label: string
  variant?: 'primary' | 'dark'
  className?: string
}

export default function CheckoutButton({
  plan,
  label,
  variant = 'primary',
  className = '',
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    if (loading) return
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      if (res.status === 401) {
        // Χρήστης δεν είναι logged in — στείλτον στο login με redirect πίσω
        router.push(`/login?next=/pricing`)
        return
      }

      if (res.status === 409) {
        // Ήδη συνδρομητής αυτού του πλάνου
        const { error: msg } = await res.json()
        setError(msg || 'Είσαι ήδη συνδρομητής αυτού του πλάνου.')
        return
      }

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}))
        setError(msg || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
        return
      }

      const { url } = await res.json()
      if (!url) {
        setError('Δεν λήφθηκε URL πληρωμής. Δοκίμασε ξανά.')
        return
      }

      // Hard redirect στο Stripe Checkout (hosted page)
      window.location.href = url
    } catch {
      setError('Πρόβλημα σύνδεσης. Έλεγξε το internet σου.')
    } finally {
      setLoading(false)
    }
  }

  const baseClass =
    variant === 'primary'
      ? 'bg-sky-600 text-white hover:bg-sky-700'
      : 'bg-gray-900 text-white hover:bg-gray-700'

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        className={`block w-full py-2.5 rounded-xl text-center text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${baseClass} ${className}`}
      >
        {loading ? 'Παρακαλώ περίμενε…' : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-600 text-center">
          {error}
        </p>
      )}
    </div>
  )
}
