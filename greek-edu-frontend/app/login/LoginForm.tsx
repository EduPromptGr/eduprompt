'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Υποστηρίζει και ?next= (server redirects) και ?redirect= (CheckoutButton)
  const redirectTo = searchParams.get('next') ?? searchParams.get('redirect') ?? '/generate'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        if (
          authError.message.toLowerCase().includes('invalid') ||
          authError.message.toLowerCase().includes('credentials')
        ) {
          setError('Λάθος email ή κωδικός. Δοκίμασε ξανά.')
        } else if (authError.message.toLowerCase().includes('email not confirmed')) {
          setError('Το email σου δεν έχει επιβεβαιωθεί. Έλεγξε τα εισερχόμενα.')
        } else {
          setError('Κάτι πήγε στραβά. Προσπάθησε ξανά σε λίγο.')
        }
        return
      }

      router.replace(redirectTo.startsWith('/') ? redirectTo : '/generate')
      router.refresh()
    } catch {
      setError('Πρόβλημα σύνδεσης. Έλεγξε το internet σου και δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-gray-800 mb-1.5">
          Email
        </label>
        <input
          id="login-email"
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

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="login-password" className="block text-sm font-medium text-gray-800">
            Κωδικός
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-sky-600 hover:text-sky-800 hover:underline"
          >
            Ξέχασες τον κωδικό;
          </Link>
        </div>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-required="true"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
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

      <button
        type="submit"
        disabled={loading || !email || !password}
        aria-busy={loading}
        className="w-full py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Σύνδεση…' : 'Σύνδεση'}
      </button>

      <p className="text-center text-sm text-gray-500">
        Δεν έχεις λογαριασμό;{' '}
        <Link href="/signup" className="text-sky-600 font-medium hover:underline">
          Εγγραφή δωρεάν
        </Link>
      </p>
    </form>
  )
}
