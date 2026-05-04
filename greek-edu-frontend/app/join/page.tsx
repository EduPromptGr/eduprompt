// app/join/page.tsx
//
// Referral landing page — ?ref=CODE
//
// Δουλειά αυτής της σελίδας:
//   1. Αποθηκεύει το referral code σε sessionStorage
//   2. Δείχνει friendly CTA
//   3. Κουμπί → /signup (το SignupForm διαβάζει το code και καλεί validate)
//
// Server component — τα data (ref code) περνάνε ως prop στο client shell.

import type { Metadata } from 'next'
import Link from 'next/link'
import JoinClient from './JoinClient'

export const metadata: Metadata = {
  title: 'Εγγραφή στο EduPrompt',
  description: 'Δημιούργησε δωρεάν λογαριασμό και ξεκίνα να φτιάχνεις παιδαγωγικά σενάρια με AI.',
}

export default function JoinPage({
  searchParams,
}: {
  searchParams: { ref?: string }
}) {
  const ref = searchParams.ref?.trim() ?? ''

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-10 space-y-6">

          <div className="text-center">
            <div className="text-5xl mb-3">🎁</div>
            <h1 className="text-xl font-bold text-gray-900">
              Σε προσκαλούν στο EduPrompt
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Ένας συνάδελφος σε προσκάλεσε. Εγγράψου δωρεάν και ξεκίνα να
              δημιουργείς παιδαγωγικά σενάρια με AI.
            </p>
          </div>

          <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-800 space-y-1">
            {[
              '3 σενάρια δωρεάν κάθε μήνα',
              'Όλα τα θεωρητικά πλαίσια & στρατηγικές',
              'Παιδαγωγικό ημερολόγιο',
              'Χωρίς πιστωτική κάρτα',
            ].map((f) => (
              <p key={f} className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span> {f}
              </p>
            ))}
          </div>

          {/* Client component: αποθηκεύει ref στο sessionStorage + redirect */}
          <JoinClient refCode={ref} />

          <p className="text-xs text-gray-400 text-center">
            Έχεις ήδη λογαριασμό;{' '}
            <Link href="/login" className="text-sky-600 hover:underline">
              Σύνδεση
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
