// app/profile/page.tsx
//
// Ρυθμίσεις λογαριασμού: subscription status, usage meters,
// change password, και σύνδεσμος διαχείρισης Stripe billing.
//
// Server component — κάνει auth guard + φέρνει δεδομένα χρήστη
// από Supabase και FastAPI /api/generate/quota.

import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ProfileClient from './ProfileClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Προφίλ — EduPrompt',
  robots: { index: false, follow: false },
}

const PLAN_LABELS: Record<string, string> = {
  free:   'Δωρεάν',
  pro:    'Pro (€14,99/μήνα)',
  school: 'Σχολείο',
  paused: 'Pro — Σε παύση',
}

// Default quota values per plan (fallback if FastAPI is unreachable)
const PLAN_LIMITS: Record<string, { month: number; day: number }> = {
  free:   { month: 3,   day: 1  },
  pro:    { month: 150, day: 12 },
  school: { month: 400, day: 12 },
  paused: { month: 0,   day: 0  },
}

interface QuotaResponse {
  plan: string
  monthly: { used: number; limit: number; resets_on: string }
  daily: { used: number; limit: number; resets_on: string }
}

export default async function ProfilePage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/profile')

  // Fetch user row: plan, stripe customer, pause_until
  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status, stripe_customer_id, pause_until')
    .eq('id', user.id)
    .single()

  const plan = userData?.subscription_status ?? 'free'
  const planLabel = PLAN_LABELS[plan] ?? plan
  const hasStripeCustomer = Boolean(userData?.stripe_customer_id)

  let pauseUntil: string | null = null
  if (userData?.pause_until) {
    pauseUntil = new Intl.DateTimeFormat('el-GR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(userData.pause_until))
  }

  // Fetch usage quota from FastAPI (best-effort, fall back to zeros)
  let usedMonth = 0
  let usedDay = 0
  let limitMonth = PLAN_LIMITS[plan]?.month ?? 3
  let limitDay   = PLAN_LIMITS[plan]?.day   ?? 1

  try {
    const backendUrl = process.env.BACKEND_API_URL
    if (backendUrl) {
      // We need the access token to call the backend on behalf of the user.
      // The server client already refreshed the session — get the session token.
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token

      if (accessToken) {
        const res = await fetch(`${backendUrl}/api/generate/quota`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(3000),
        })
        if (res.ok) {
          const quota: QuotaResponse = await res.json()
          usedMonth  = quota.monthly.used
          usedDay    = quota.daily.used
          limitMonth = quota.monthly.limit
          limitDay   = quota.daily.limit
        }
      }
    }
  } catch {
    // Backend unreachable — show plan defaults, no crash
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Ο λογαριασμός μου</h1>

      <ProfileClient
        email={user.email ?? ''}
        plan={plan}
        planLabel={planLabel}
        usedMonth={usedMonth}
        limitMonth={limitMonth}
        usedDay={usedDay}
        limitDay={limitDay}
        hasStripeCustomer={hasStripeCustomer}
        pauseUntil={pauseUntil}
      />
    </main>
  )
}
