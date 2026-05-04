'use client'

// app/profile/ProfileClient.tsx
//
// Client component: change-password form + billing portal button.
// Τα static data (email, plan, usage) περνιούνται ως props από το server component.

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { PauseSubscriptionModal } from '@/components/PauseSubscriptionModal'

interface Props {
  email: string
  plan: string
  planLabel: string
  usedMonth: number
  limitMonth: number
  usedDay: number
  limitDay: number
  hasStripeCustomer: boolean
  pauseUntil: string | null
}

export default function ProfileClient({
  email,
  plan,
  planLabel,
  usedMonth,
  limitMonth,
  usedDay,
  limitDay,
  hasStripeCustomer,
  pauseUntil,
}: Props) {
  // ── Change password ──────────────────────────────────────────
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)

  // ── Billing portal ───────────────────────────────────────────
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  // ── Pause subscription ───────────────────────────────────────
  const [showPauseModal, setShowPauseModal] = useState(false)
  const [pauseError, setPauseError] = useState<string | null>(null)

  async function handlePause(months: number) {
    setPauseError(null)
    const res = await fetch('/api/subscription/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ months }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Αποτυχία παύσης.')
    // Reload για να φανεί το νέο pause_until από τον server
    window.location.reload()
  }

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)

    if (pwNew.length < 8) {
      setPwError('Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.')
      return
    }
    if (pwNew !== pwConfirm) {
      setPwError('Οι κωδικοί δεν ταιριάζουν.')
      return
    }

    setPwBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew })
      if (error) {
        setPwError('Αποτυχία αλλαγής κωδικού. Δοκίμασε αποσύνδεση και επανασύνδεση.')
      } else {
        setPwSuccess(true)
        setPwCurrent('')
        setPwNew('')
        setPwConfirm('')
      }
    } finally {
      setPwBusy(false)
    }
  }

  async function handleBillingPortal() {
    setPortalError(null)
    setPortalBusy(true)
    try {
      const res = await fetch('/api/billing-portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setPortalError(data.error ?? 'Σφάλμα. Δοκίμασε ξανά.')
        return
      }
      window.location.href = data.url
    } catch {
      setPortalError('Αδυναμία σύνδεσης. Δοκίμασε ξανά.')
    } finally {
      setPortalBusy(false)
    }
  }

  const monthPct = limitMonth > 0 ? Math.min(100, Math.round((usedMonth / limitMonth) * 100)) : 0
  const dayPct   = limitDay   > 0 ? Math.min(100, Math.round((usedDay   / limitDay)   * 100)) : 0

  return (
    <div className="space-y-8">

      {/* ── Subscription status ──────────────────────────────── */}
      <Card title="Συνδρομή">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-gray-500">Τρέχον πλάνο</p>
            <p className="text-lg font-bold text-gray-900">{planLabel}</p>
            {pauseUntil && (
              <p className="text-xs text-amber-600 mt-0.5">
                ⏸ Σε παύση μέχρι {pauseUntil}
              </p>
            )}
          </div>
          {plan !== 'free' && hasStripeCustomer ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleBillingPortal}
                disabled={portalBusy}
                aria-busy={portalBusy}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {portalBusy ? 'Φόρτωση…' : 'Διαχείριση συνδρομής'}
              </button>
              {/* Παύση — μόνο αν δεν είναι ήδη σε παύση */}
              {!pauseUntil && (
                <button
                  onClick={() => { setPauseError(null); setShowPauseModal(true) }}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Παύση συνδρομής
                </button>
              )}
            </div>
          ) : plan === 'free' ? (
            <a
              href="/pricing"
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors"
            >
              Αναβάθμιση →
            </a>
          ) : null}
        </div>
        {portalError && (
          <p role="alert" className="mt-3 text-xs text-red-600">{portalError}</p>
        )}
        {pauseError && (
          <p role="alert" className="mt-3 text-xs text-red-600">{pauseError}</p>
        )}
      </Card>

      {/* ── Pause modal ──────────────────────────────────────── */}
      {showPauseModal && (
        <PauseSubscriptionModal
          onClose={() => setShowPauseModal(false)}
          onPause={handlePause}
        />
      )}

      {/* ── Usage ────────────────────────────────────────────── */}
      <Card title="Χρήση μήνα">
        <div className="space-y-4">
          <UsageBar
            label="Σενάρια μήνα"
            used={usedMonth}
            limit={limitMonth}
            pct={monthPct}
          />
          <UsageBar
            label="Σενάρια σήμερα"
            used={usedDay}
            limit={limitDay}
            pct={dayPct}
          />
        </div>
        {(monthPct >= 80 || dayPct >= 80) && plan === 'free' && (
          <p className="mt-3 text-xs text-amber-700">
            Πλησιάζεις το όριό σου.{' '}
            <a href="/pricing" className="underline font-medium">
              Αναβάθμισε σε Pro
            </a>{' '}
            για 150 σενάρια / μήνα.
          </p>
        )}
      </Card>

      {/* ── Account info ─────────────────────────────────────── */}
      <Card title="Λογαριασμός">
        <div>
          <p className="text-xs text-gray-500 mb-1">Email</p>
          <p className="text-sm font-medium text-gray-800">{email}</p>
        </div>
      </Card>

      {/* ── Change password ──────────────────────────────────── */}
      <Card title="Αλλαγή κωδικού">
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
          {/* We don't ask for the current password — Supabase handles session validity */}
          <Field
            id="pw-new"
            label="Νέος κωδικός"
            type="password"
            value={pwNew}
            onChange={setPwNew}
            autoComplete="new-password"
          />
          <Field
            id="pw-confirm"
            label="Επιβεβαίωση νέου κωδικού"
            type="password"
            value={pwConfirm}
            onChange={setPwConfirm}
            autoComplete="new-password"
          />

          {pwError && (
            <p role="alert" className="text-xs text-red-600">{pwError}</p>
          )}
          {pwSuccess && (
            <p role="status" className="text-xs text-emerald-600 font-medium">
              Ο κωδικός άλλαξε επιτυχώς.
            </p>
          )}

          <button
            type="submit"
            disabled={pwBusy || !pwNew || !pwConfirm}
            aria-busy={pwBusy}
            className="px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {pwBusy ? 'Αποθήκευση…' : 'Αλλαγή κωδικού'}
          </button>
        </form>
      </Card>

    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
      <h2 className="text-base font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  )
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-required="true"
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
      />
    </div>
  )
}

function UsageBar({
  label,
  used,
  limit,
  pct,
}: {
  label: string
  used: number
  limit: number
  pct: number
}) {
  const color =
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-sky-500'

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span>{`${used} / ${limit}`}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
        />
      </div>
    </div>
  )
}
