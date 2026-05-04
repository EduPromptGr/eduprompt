// app/checkout/success/page.tsx
//
// Ο user φτάνει εδώ αφού ολοκληρώσει επιτυχώς την πληρωμή στο Stripe.
// Το Stripe το κάνει redirect με ?session_id=cs_xxx.
//
// ΔΕΝ βασιζόμαστε στο session_id για να ενεργοποιήσουμε το πλάνο —
// αυτό γίνεται ΑΠΟΚΛΕΙΣΤΙΚΑ μέσω webhook (checkout.session.completed).
// Εδώ απλώς δείχνουμε επιβεβαίωση και περιμένουμε ο χρήστης να
// μεταβεί στο /generate.
//
// Το webhook μπορεί να αργήσει μερικά δευτερόλεπτα — δείχνουμε
// κατανοητό μήνυμα ("Μπορεί να χρειαστεί 1-2 λεπτά...").

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Η συνδρομή σου ενεργοποιήθηκε — EduPrompt',
  robots: { index: false, follow: false },
}

export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-10 space-y-5">

          {/* Icon */}
          <div className="text-5xl">🎉</div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-gray-900">
            Καλωσήρθες στο Pro!
          </h1>

          <p className="text-gray-600 text-sm leading-relaxed">
            Η πληρωμή σου ολοκληρώθηκε επιτυχώς. Η συνδρομή σου
            ενεργοποιείται αυτόματα — μπορεί να χρειαστεί{' '}
            <strong>1-2 λεπτά</strong> μέχρι να εμφανιστεί το νέο
            όριο σεναρίων.
          </p>

          {/* What's next */}
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide mb-2">
              Τι σε περιμένει
            </p>
            {[
              'Έως 150 σενάρια τον μήνα',
              'Προφίλ τάξης με AI insights',
              'Data-driven επιλογή θεωρίας',
              'Παιδαγωγικό ημερολόγιο',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-sky-800">
                <span className="text-emerald-500 shrink-0">✓</span>
                {item}
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link
            href="/generate"
            className="block w-full py-3 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 transition-colors"
          >
            Δημιούργησε το πρώτο σου σενάριο →
          </Link>

          <p className="text-xs text-gray-400">
            Θα λάβεις και email επιβεβαίωσης με την απόδειξη πληρωμής.
          </p>
        </div>
      </div>
    </main>
  )
}
