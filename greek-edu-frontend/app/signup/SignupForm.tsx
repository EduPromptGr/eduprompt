'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const MIN_PASSWORD_LENGTH = 8

function passwordStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length === 0) return { label: '', color: '', width: '0%' }
  const hasLower = /[a-z]/.test(pw)
  const hasUpper = /[A-Z]/.test(pw)
  const hasDigit = /\d/.test(pw)
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw)
  const score = [pw.length >= 8, hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length
  if (score <= 2) return { label: 'Αδύναμος', color: 'bg-rose-400', width: '33%' }
  if (score <= 3) return { label: 'Μέτριος', color: 'bg-amber-400', width: '66%' }
  return { label: 'Ισχυρός', color: 'bg-emerald-500', width: '100%' }
}

type Step = 'form' | 'check-email'

export default function SignupForm() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})

  const strength = passwordStrength(password)

  function validate(): boolean {
    const errs: typeof fieldErrors = {}
    if (password.length < MIN_PASSWORD_LENGTH) {
      errs.password = `Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες.`
    }
    if (password !== confirm) {
      errs.confirm = 'Οι κωδικοί δεν ταιριάζουν.'
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    if (!validate()) return
    setLoading(true)

    try {
      const supabase = createClient()

      // Διατηρούμε το ?next= param (π.χ. από /join-school?token=XXX)
      // ώστε μετά την επαλήθευση email ο callback να ξέρει πού να στείλει τον user.
      const nextParam = new URLSearchParams(window.location.search).get('next')
      const callbackUrl = nextParam
        ? `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(nextParam)}`
        : `${window.location.origin}/api/auth/callback`

      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Το callback route ανταλλάσσει το PKCE code → session,
          // στέλνει welcome email (fire-and-forget), μετά redirect στο next ή /generate.
          emailRedirectTo: callbackUrl,
        },
      })

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered')) {
          setError(
            'Αυτό το email χρησιμοποιείται ήδη. Δοκίμασε να συνδεθείς ή να επαναφέρεις τον κωδικό σου.',
          )
        } else {
          setError('Κάτι πήγε στραβά κατά την εγγραφή. Δοκίμασε ξανά.')
        }
        return
      }

      // Referral: αν ο user ήρθε από /join?ref=CODE, στείλε validate
      // Το code αποθηκεύεται στο sessionStorage από το JoinClient component.
      try {
        const refCode = sessionStorage.getItem('eduprompt_ref')
        if (refCode) {
          await fetch('/api/referral/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referral_code: refCode }),
          })
          sessionStorage.removeItem('eduprompt_ref')
        }
      } catch {
        // Αποτυχία referral δεν εμποδίζει την εγγραφή
      }

      setStep('check-email')
    } catch {
      setError('Πρόβλημα σύνδεσης. Έλεγξε το internet σου και δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'check-email') {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">📬</div>
        <h2 className="text-base font-semibold text-gray-900">Έλεγξε το email σου</h2>
        <p className="text-sm text-gray-600">
          Στείλαμε σύνδεσμο επιβεβαίωσης στο{' '}
          <strong className="text-gray-900">{email}</strong>. Κάνε κλικ στον σύνδεσμο
          για να ολοκληρώσεις την εγγραφή.
        </p>
        <p className="text-xs text-gray-500">
          Δεν το βρίσκεις; Έλεγξε και τα spam / προωθημένα.
        </p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="mt-2 text-sm text-sky-600 hover:underline"
        >
          Πήγαινε στη σύνδεση →
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
        <label htmlFor="signup-email" className="block text-sm font-medium text-gray-800 mb-1.5">
          Email
        </label>
        <input
          id="signup-email"
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
        <label htmlFor="signup-password" className="block text-sm font-medium text-gray-800 mb-1.5">
          Κωδικός
        </label>
        <div className="relative">
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.password)}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (fieldErrors.password) setFieldErrors((fe) => ({ ...fe, password: undefined }))
            }}
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

        {/* Password strength bar */}
        {password.length > 0 && (
          <div className="mt-1.5 space-y-1">
            <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                style={{ width: strength.width }}
              />
            </div>
            <p className="text-xs text-gray-500">{strength.label}</p>
          </div>
        )}

        {fieldErrors.password && (
          <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>
        )}
      </div>

      <div>
        <label htmlFor="signup-confirm" className="block text-sm font-medium text-gray-800 mb-1.5">
          Επανάληψη κωδικού
        </label>
        <input
          id="signup-confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.confirm)}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            if (fieldErrors.confirm) setFieldErrors((fe) => ({ ...fe, confirm: undefined }))
          }}
          placeholder="Ίδιος κωδικός"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
        />
        {fieldErrors.confirm && (
          <p className="mt-1 text-xs text-rose-600">{fieldErrors.confirm}</p>
        )}
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500 shrink-0"
        />
        <span className="text-xs text-gray-600 leading-relaxed">
          Αποδέχομαι τους{' '}
          <Link href="/terms" className="text-sky-600 hover:underline">
            Όρους Χρήσης
          </Link>{' '}
          και την{' '}
          <Link href="/privacy" className="text-sky-600 hover:underline">
            Πολιτική Απορρήτου
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={loading || !email || !password || !confirm || !agreedToTerms}
        aria-busy={loading}
        className="w-full py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Δημιουργία λογαριασμού…' : 'Δημιουργία λογαριασμού'}
      </button>

      <p className="text-center text-sm text-gray-500">
        Έχεις ήδη λογαριασμό;{' '}
        <Link href="/login" className="text-sky-600 font-medium hover:underline">
          Σύνδεση
        </Link>
      </p>
    </form>
  )
}
