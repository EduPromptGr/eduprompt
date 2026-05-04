// app/generate/page.tsx
//
// Η σελίδα δημιουργίας σεναρίου — το πρωτεύον flow του προϊόντος.
//
// Server component · κάνει auth guard και mount-άρει τη <GenerateForm>
// (client). Η φόρμα φροντίζει το POST /api/generate, error handling
// (incl. 429 rate-limit), και redirect στο /prompts/[id] μετά το success.
//
// noindex: παρόλο που το page είναι κάτω από auth guard, βάζουμε ρητά
// `robots: { index: false, follow: false }` ώστε αν για κάποιο λόγο
// γίνει publicly accessible (π.χ. preview URL), να μη μπει στο Google.
// Επίσης το /generate path είναι ήδη blocked στο app/robots.ts.
//
// Optional ?prompt_id=<uuid>: αν δοθεί, μπορούμε στο μέλλον να pre-fill
// τη φόρμα με τα πεδία ενός προηγούμενου σεναρίου (remix). Για τώρα δεν
// το χρησιμοποιούμε — αφήνεται hook για το επόμενο iteration.

import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import GenerateForm from '@/components/GenerateForm'
import OnboardingBanner from './OnboardingBanner'
import GenerateExtras from './GenerateExtras'
import { UsageWarningBanner } from '@/components/UsageWarningBanner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Δημιουργία σεναρίου — EduPrompt',
  robots: { index: false, follow: false },
}

// Default quota limits per plan (fallback if FastAPI is unreachable)
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

export default async function GeneratePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/generate')

  // Φέρε plan για το banner
  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', user.id)
    .single()

  const plan = (userData?.subscription_status ?? 'free') as 'free' | 'pro' | 'school'
  const defaultLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free

  // Fetch usage quota (best-effort — αν αποτύχει, το banner απλά δεν εμφανίζεται)
  let usedMonth = 0
  let limitMonth = defaultLimits.month
  let resetDate: string | undefined

  try {
    const backendUrl = process.env.BACKEND_API_URL
    if (backendUrl) {
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
          limitMonth = quota.monthly.limit
          if (quota.monthly.resets_on) {
            resetDate = new Intl.DateTimeFormat('el-GR', {
              day: 'numeric',
              month: 'short',
            }).format(new Date(quota.monthly.resets_on))
          }
        }
      }
    }
  } catch {
    // Backend unreachable — banner δεν εμφανίζεται (pct < 80 με usedMonth=0)
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Δημιουργία σεναρίου</h1>
        <p className="text-sm text-gray-600 mt-1">
          Συμπλήρωσε τα πεδία και η AI θα σου ετοιμάσει ένα παιδαγωγικά
          δομημένο σενάριο — προσαρμοσμένο στην τάξη σου, στο μάθημα και στο
          μαθησιακό στόχο. Μπορείς πάντα να το επεξεργαστείς ή να αποθηκεύσεις
          το αποτέλεσμα.
        </p>
      </header>

      <OnboardingBanner />

      <UsageWarningBanner
        used={usedMonth}
        limit={limitMonth}
        plan={plan}
        resetDate={resetDate}
      />

      <GenerateForm />

      <GenerateExtras />
    </main>
  )
}
