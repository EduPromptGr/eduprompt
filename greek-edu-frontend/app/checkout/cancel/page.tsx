// app/checkout/cancel/page.tsx
//
// Ο user έφτασε εδώ γιατί έκλεισε ή ακύρωσε το Stripe Checkout.
// Δεν έγινε χρέωση. Δείχνουμε reassurance και επιστροφή στο /pricing.

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Η πληρωμή ακυρώθηκε — EduPrompt',
  robots: { index: false, follow: false },
}

export default function CheckoutCancelPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-10 space-y-5">

          <div className="text-5xl">😕</div>

          <h1 className="text-xl font-bold text-gray-900">
            Η πληρωμή ακυρώθηκε
          </h1>

          <p className="text-gray-600 text-sm leading-relaxed">
            Δεν έγινε καμία χρέωση. Ο λογαριασμός σου παραμένει
            ανέπαφος — μπορείς να επιστρέψεις στα τιμολόγια και να
            δοκιμάσεις ξανά όποτε θες.
          </p>

          <div className="flex flex-col gap-3 pt-2">
            <Link
              href="/pricing"
              className="block w-full py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 transition-colors"
            >
              Επιστροφή στα τιμολόγια
            </Link>
            <Link
              href="/generate"
              className="block w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Συνέχισε με το δωρεάν πλάνο
            </Link>
          </div>

          <p className="text-xs text-gray-400 pt-1">
            Έχεις απορία;{' '}
            <a
              href="mailto:hello@eduprompt.gr"
              className="text-sky-600 hover:underline"
            >
              Επικοινώνησε μαζί μας
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
