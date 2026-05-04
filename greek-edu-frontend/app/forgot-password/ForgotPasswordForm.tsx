'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Step = 'form' | 'sent'

export default function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>('form')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading || !email.trim()) return
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        // Callback ανταλλάσσει PKCE code → session, μετά redirect στο /reset-password
        { redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password` },
      )
      if (authError) {
        setError('Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο.')
        return
      }
      setStep('sent')
    } catch {
      setError('Πρόβλημα σύνδεσης. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'sent') {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">📧</div>
        <h2 className="text-base font-semibold text-gray-900">Έλεγξε το email σου</h2>
        <p className="text-sm text-gray-600">
          Αν το <strong>{email}</strong> υπάρχει στο σύστημα, θα λάβεις σύνδεσμο
          επαναφοράς κωδικού σε λίγα λεπτά.
        </p>
        <p className="text-xs text-gray-500">Έλεγξε και τα spam / προωθημένα.</p>
        <Link href="/login" className="block text-sm text-sky-600 hover:underline mt-2">
          ← Πίσω στη σύνδεση
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <p className="text-sm text-gray-600">
        Γράψε το email σου και θα σου στείλουμε οδηγίες επαναφοράς κωδικού.
      </p>

      <div>
        <label htmlFor="fp-email" className="block text-sm font-medium text-gray-800 mb-1.5">
          Email
        </label>
        <input
          id="fp-email"
          type="email"
          autoComplete="email"
          required
          aria-required="true"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="daskalos@sxoleio.gr"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !email}
        aria-busy={loading}
        className="w-full py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Αποστολή…' : 'Αποστολή οδηγιών'}
      </button>

      <p className="text-center text-sm">
        <Link href="/login" className="text-sky-600 hover:underline">
          ← Πίσω στη σύνδεση
        </Link>
      </p>
    </form>
  )
}
