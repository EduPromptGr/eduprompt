// app/signup/page.tsx
// Server component — αν ο user είναι ήδη συνδεδεμένος τον στέλνουμε
// στο /generate (δεν χρειάζεται να εγγραφεί ξανά).

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignupForm from './SignupForm'

export const metadata: Metadata = {
  title: 'Εγγραφή — EduPrompt',
  robots: { index: false, follow: false },
}

export default async function SignupPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/generate')

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-sky-700">EduPrompt</span>
          <p className="mt-2 text-sm text-gray-500">
            Δοκίμασε δωρεάν — 3 σενάρια χωρίς πιστωτική κάρτα
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-6">
            Δημιούργησε τον λογαριασμό σου
          </h1>
          <SignupForm />
        </div>

        {/* Trust signals */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '🔒', text: 'Ασφαλής σύνδεση' },
            { icon: '🇬🇷', text: 'Ελληνικό ΑΠΣ' },
            { icon: '✨', text: 'Δωρεάν εκκίνηση' },
          ].map(({ icon, text }) => (
            <div key={text} className="rounded-xl bg-white border border-gray-100 px-2 py-3">
              <div className="text-lg mb-0.5">{icon}</div>
              <div className="text-xs text-gray-500">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
