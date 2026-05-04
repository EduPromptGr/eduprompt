'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const MIN_PASSWORD_LENGTH = 8

type Step = 'form' | 'done'

export default function ResetPasswordForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('form')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setFieldError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(`Τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες.`)
      return
    }
    if (password !== confirm) {
      setFieldError('Οι κωδικοί δεν ταιριάζουν.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError('Δεν ήταν δυνατή η αλλαγή κωδικού. Ο σύνδεσμος μπορεί να έχει λήξει.')
        return
      }
      setStep('done')
    } catch {
      setError('Κάτι πήγε στραβά. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-base font-semibold text-gray-900">Ο κωδικός άλλαξε!</h2>
        <p className="text-sm text-gray-600">
          Μπορείς τώρα να συνδεθείς με τον νέο σου κωδικό.
        </p>
        <button
          type="button"
          onClick={() => router.replace('/login')}
          className="mt-2 w-full py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
        >
          Σύνδεση
        </button>
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

      <div>
        <label htmlFor="rp-password" className="block text-sm font-medium text-gray-800 mb-1.5">
          Νέος κωδικός
        </label>
        <div className="relative">
          <input
            id="rp-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            aria-required="true"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Τουλάχιστον 8 χαρακτήρες"
            className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-300 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
          />
          <button
            type="button"
            aria-label={showPassword ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
          >
            {showPassword ? 'Κρύψε' : 'Δείξε'}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="rp-confirm" className="block text-sm font-medium text-gray-800 mb-1.5">
          Επανάληψη νέου κωδικού
        </label>
        <input
          id="rp-confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          aria-required="true"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Ίδιος κωδικός"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
        />
        {fieldError && (
          <p className="mt-1 text-xs text-rose-600">{fieldError}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !password || !confirm}
        aria-busy={loading}
        className="w-full py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Αποθήκευση…' : 'Αλλαγή κωδικού'}
      </button>
    </form>
  )
}
