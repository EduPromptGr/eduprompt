// app/login/page.tsx
// Server component — auth guard αντεστραμμένος: αν ο user είναι ήδη
// συνδεδεμένος, τον στέλνουμε στο /generate.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import LoginForm from './LoginForm'

export const metadata: Metadata = {
  title: 'Σύνδεση — EduPrompt',
  robots: { index: false, follow: false },
}

export default async function LoginPage() {
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
            Παιδαγωγικά σενάρια διδασκαλίας με ΤΝ
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-6">
            Σύνδεση στον λογαριασμό σου
          </h1>
          {/* Suspense required για useSearchParams() μέσα στο LoginForm */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
