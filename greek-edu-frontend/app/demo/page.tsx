// app/demo/page.tsx
//
// Demo σελίδα — δεν απαιτεί auth.
// Δείχνει ολόκληρη τη ροή δημιουργίας σεναρίου με mock API.

import type { Metadata } from 'next'
import Link from 'next/link'
import DemoGenerateForm from './DemoGenerateForm'

export const metadata: Metadata = {
  title: 'Demo — Δοκίμασε το EduPrompt',
  description: 'Δες πώς δημιουργείται ένα παιδαγωγικό σενάριο με AI. Χωρίς εγγραφή.',
}

export default function DemoPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">

      {/* Banner "demo mode" */}
      <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <span className="text-lg">⚡</span>
        <span>
          <strong>Demo mode</strong> — χωρίς εγγραφή, χωρίς AI key.{' '}
          <Link href="/signup" className="underline hover:no-underline font-medium">Εγγράψου δωρεάν</Link>{' '}
          για πραγματικά σενάρια από το Claude AI.
        </span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold">🎓 Δημιουργία σεναρίου — Demo</h1>
        <p className="text-sm text-gray-600 mt-1">
          Συμπλήρωσε τα παρακάτω πεδία. Έχουμε ήδη βάλει ένα παράδειγμα —
          μπορείς να το αλλάξεις ή να πατήσεις αμέσως &quot;Δημιούργησε&quot;.
        </p>
      </header>

      {/* How it works — 3 steps */}
      <div className="grid grid-cols-3 gap-3 mb-8 text-center">
        {[
          { n: '1', icon: '📝', label: 'Συμπλήρωσε τη φόρμα' },
          { n: '2', icon: '🤖', label: 'AI + RAG επεξεργάζεται' },
          { n: '3', icon: '🎯', label: 'Έτοιμο σενάριο' },
        ].map((step) => (
          <div key={step.n} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <div className="text-2xl mb-1">{step.icon}</div>
            <div className="text-xs text-gray-500 font-medium">{step.label}</div>
          </div>
        ))}
      </div>

      <DemoGenerateForm />

      {/* Bottom CTA */}
      <div className="mt-12 border-t border-gray-200 pt-8 text-center">
        <p className="text-gray-600 text-sm mb-3">Σου άρεσε; Δοκίμασε το πραγματικό — 3 σενάρια δωρεάν.</p>
        <div className="flex justify-center gap-3 flex-wrap">
          <Link
            href="/signup"
            className="px-5 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors shadow-sm"
          >
            Ξεκίνα δωρεάν →
          </Link>
          <Link
            href="/pricing"
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Δες τα πλάνα
          </Link>
        </div>
      </div>
    </main>
  )
}
