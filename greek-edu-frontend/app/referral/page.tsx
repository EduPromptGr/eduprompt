// app/referral/page.tsx
//
// Σελίδα παραπομπών (referral) — εμφανίζει τον προσωπικό σύνδεσμο
// του χρήστη, αριθμό επιτυχημένων παραπομπών και την ανταμοιβή.
//
// Server component · auth guard · noindex.

import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ReferralWidget } from '@/components/ReferralWidget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Παραπομπές — EduPrompt',
  robots: { index: false, follow: false },
}

export default async function ReferralPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/referral')

  const { data } = await supabase
    .from('users')
    .select('referral_code')
    .eq('id', user.id)
    .single()

  const referralCode = data?.referral_code ?? null

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-gray-900">
      <h1 className="text-2xl font-bold mb-2">Πρόγραμμα παραπομπών</h1>
      <p className="text-sm text-gray-600 mb-8">
        Μοιράσου το EduPrompt με συναδέλφους. Για κάθε δάσκαλο που εγγραφεί
        και ενεργοποιήσει συνδρομή μέσω του συνδέσμου σου,{' '}
        <strong className="text-gray-900">κερδίζεις 1 μήνα Pro δωρεάν</strong>.
      </p>

      {/* Κάρτα με τον σύνδεσμο — χρησιμοποιεί το ίδιο ReferralWidget component */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">

        {/* Βήματα */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '1', title: 'Μοιράσου τον σύνδεσμο', desc: 'Στείλε τον προσωπικό σου σύνδεσμο σε συναδέλφους.' },
            { step: '2', title: 'Εγγραφή & Συνδρομή', desc: 'Ο συνάδελφος εγγράφεται και ενεργοποιεί πληρωμένο πλάνο.' },
            { step: '3', title: 'Κερδίζεις 1 μήνα', desc: 'Ο λογαριασμός σου πιστώνεται αυτόματα με 1 μήνα Pro.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 font-bold text-sm flex items-center justify-center mx-auto mb-2">
                {step}
              </div>
              <p className="text-sm font-semibold text-gray-800">{title}</p>
              <p className="text-xs text-gray-500 mt-1">{desc}</p>
            </div>
          ))}
        </div>

        <hr className="border-gray-100" />

        {/* Widget με τον σύνδεσμο (client component) */}
        {referralCode ? (
          <div>
            <p className="text-xs text-gray-500 mb-2">Ο προσωπικός σου σύνδεσμος:</p>
            {/* showAfterNthPrompt=0 → πάντα εμφανίζεται σε αυτή τη σελίδα */}
            <ReferralWidget showAfterNthPrompt={0} />
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            Ο σύνδεσμος παραπομπής σου ετοιμάζεται…
          </p>
        )}

        <hr className="border-gray-100" />

        {/* Όροι */}
        <div className="text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">Λεπτομέρειες προγράμματος:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Ισχύει μόνο για νέους χρήστες που δεν έχουν ξανά λογαριασμό στο EduPrompt.</li>
            <li>Η πίστωση δίνεται μετά από επιτυχημένη πληρωμή (όχι με δωρεάν πλάνο).</li>
            <li>Δεν υπάρχει ανώτατο όριο παραπομπών — μπορείς να κερδίσεις πολλούς μήνες.</li>
            <li>Αλλαγές στο πρόγραμμα θα ανακοινωθούν 30 ημέρες νωρίτερα.</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
