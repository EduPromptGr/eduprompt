// app/not-found.tsx — Custom 404 page

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Σελίδα δεν βρέθηκε — EduPrompt',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center space-y-5">
        <p className="text-6xl font-black text-gray-200">404</p>

        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Αυτή η σελίδα δεν υπάρχει
          </h1>
          <p className="text-sm text-gray-500">
            Ο σύνδεσμος που ακολούθησες μπορεί να έχει αλλάξει ή να έχει αφαιρεθεί.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/generate"
            className="px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors"
          >
            Δημιουργία σεναρίου
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Αρχική σελίδα
          </Link>
        </div>
      </div>
    </main>
  )
}
