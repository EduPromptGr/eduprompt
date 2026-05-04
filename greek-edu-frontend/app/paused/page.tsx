// app/paused/page.tsx
// Εμφανίζεται από το middleware όταν subscription_status=paused.
// Λαμβάνει ?until=<ελληνική ημερομηνία> από το middleware.

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Συνδρομή σε παύση — EduPrompt',
  robots: { index: false, follow: false },
}

export default function PausedPage({
  searchParams,
}: {
  searchParams: { until?: string }
}) {
  const until = searchParams.until

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-10 space-y-5">

          <div className="text-5xl">⏸️</div>

          <h1 className="text-xl font-bold text-gray-900">
            Η συνδρομή σου είναι σε παύση
          </h1>

          <p className="text-gray-600 text-sm leading-relaxed">
            {until ? (
              <>
                Έχεις επιλέξει να παύσεις τη συνδρομή σου μέχρι{' '}
                <strong className="text-gray-900">{until}</strong>.
                Μέχρι τότε δεν μπορείς να δημιουργήσεις νέα σενάρια,
                αλλά τα αποθηκευμένα παραμένουν προσβάσιμα.
              </>
            ) : (
              <>
                Η συνδρομή σου είναι προσωρινά σε παύση.
                Τα αποθηκευμένα σενάριά σου παραμένουν προσβάσιμα.
              </>
            )}
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left text-sm text-amber-800">
            <p className="font-medium mb-1">Τι μπορείς να κάνεις:</p>
            <ul className="space-y-1 list-disc pl-4">
              <li>Δες και επεξεργάσου τα αποθηκευμένα σενάριά σου</li>
              <li>Διάβασε το παιδαγωγικό σου ημερολόγιο</li>
              <li>Επίλεξε ενεργοποίηση συνδρομής νωρίτερα από τις ρυθμίσεις</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 pt-1">
            <Link
              href="/saved"
              className="block w-full py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 transition-colors"
            >
              Δες τα αποθηκευμένα σενάρια
            </Link>
            <Link
              href="/profile"
              className="block w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Διαχείριση συνδρομής
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
