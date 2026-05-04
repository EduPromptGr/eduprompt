// app/school/members/page.tsx
//
// Λίστα μελών σχολείου — μόνο για school owner.
// Middleware (SCHOOL_OWNER_ROUTES) ήδη κάνει redirect αν ο user είναι
// member (school_owner_id != null) ή δεν έχει school plan.
//
// Server component · noindex.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import SchoolMembersClient from './SchoolMembersClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Μέλη σχολείου — EduPrompt',
  robots: { index: false, follow: false },
}

interface MemberRow {
  id: string
  email: string | null
  created_at: string
}

export default async function SchoolMembersPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/school/members')

  // Φόρτωσε μέλη (school_owner_id = τo id του τρέχοντος owner)
  const { data: members, error } = await supabase
    .from('users')
    .select('id, email, created_at')
    .eq('school_owner_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('school members fetch failed', error)
  }

  const rows = (members ?? []) as MemberRow[]

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-gray-900">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/school" className="text-xs text-sky-600 hover:underline mb-1 block">
            ← Πίσω στο σχολείο
          </Link>
          <h1 className="text-2xl font-bold">Μέλη σχολείου</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {`${rows.length} / 30 εκπαιδευτικοί`}
          </p>
        </div>
        <Link
          href="/school"
          className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors"
        >
          + Πρόσκληση
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm font-medium text-gray-700">Δεν υπάρχουν μέλη ακόμη</p>
          <p className="text-xs text-gray-500 mt-1">
            Πρόσκαλε εκπαιδευτικούς μέσω της κεντρικής σελίδας σχολείου.
          </p>
        </div>
      ) : (
        <SchoolMembersClient members={rows} ownerId={user.id} />
      )}
    </main>
  )
}
