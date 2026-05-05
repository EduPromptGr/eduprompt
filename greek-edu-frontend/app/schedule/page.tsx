// app/schedule/page.tsx
//
// Σελίδα ωρολογίου προγράμματος.
// Ο δάσκαλος εισάγει το εβδομαδιαίο πρόγραμμά του χειροκίνητα.
// Αποθηκεύεται ως school_schedules record στο backend.
//
// Features:
//   • Επιλογή τάξης + σχολικού έτους
//   • Πίνακας 5 × 7 (Δευτέρα-Παρασκευή × 7 ώρες)
//   • Inline edit μαθήματος + διάρκειας ανά κελί
//   • Αυτόματη αποθήκευση (PATCH) με debounce 2s
//   • Διαγραφή schedule
//   • Ένδειξη συχνών μαθημάτων (για σύνδεση με GenerateForm)

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ScheduleEditor from '@/components/ScheduleEditor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Ωρολόγιο Πρόγραμμα | EduPrompt',
  robots: { index: false, follow: false },
}

export default async function SchedulePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/schedule')
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            📅 Ωρολόγιο Πρόγραμμα
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Εισάγαι το εβδομαδιαίο σου πρόγραμμα για να σου προτείνουμε
            διάρκεια μαθήματος κατά τη δημιουργία σεναρίου.
          </p>
        </div>

        {/* Client component handles all interactions */}
        <ScheduleEditor />
      </div>
    </main>
  )
}
