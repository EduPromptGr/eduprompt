// app/school/page.tsx
//
// Dashboard σχολείου — εμφανίζεται σε school plan users.
// Ο owner βλέπει: quick stats + links σε members/report + invite form.
// Τα μέλη (members) βλέπουν: info για το σχολείο τους + link στο generate.
//
// Server component · auth guard · noindex.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import SchoolInviteForm from './SchoolInviteForm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Σχολείο — EduPrompt',
  robots: { index: false, follow: false },
}

export default async function SchoolPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/school')

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status, school_owner_id, email')
    .eq('id', user.id)
    .single()

  // Αν δεν είναι σε school plan → redirect pricing
  if (userData?.subscription_status !== 'school') {
    redirect('/pricing')
  }

  const isOwner = userData.school_owner_id == null

  // Μετρητής μελών (μόνο για owner)
  let memberCount = 0
  if (isOwner) {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('school_owner_id', user.id)
    memberCount = count ?? 0
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-gray-900">
      <h1 className="text-2xl font-bold mb-1">
        {isOwner ? 'Διαχείριση σχολείου' : 'Λογαριασμός σχολείου'}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {isOwner
          ? 'Διαχείριση εκπαιδευτικών, αναφορές χρήσης και πρόσκληση νέων μελών.'
          : 'Είσαι μέλος του school plan. Δημιούργησε σενάρια ή δες το ημερολόγιό σου.'}
      </p>

      {isOwner ? (
        <OwnerDashboard memberCount={memberCount} userId={user.id} />
      ) : (
        <MemberView />
      )}
    </main>
  )
}

// ── Owner UI ──────────────────────────────────────────────────────

function OwnerDashboard({
  memberCount,
  userId,
}: {
  memberCount: number
  userId: string
}) {
  return (
    <div className="space-y-6">

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Εκπαιδευτικοί"
          value={`${memberCount} / 30`}
          sub="ενεργά μέλη"
        />
        <Link
          href="/school/members"
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-sky-300 hover:bg-sky-50 transition-colors"
        >
          <p className="text-2xl font-black text-sky-600 mb-1">👥</p>
          <p className="text-sm font-semibold text-gray-800">Διαχείριση μελών</p>
          <p className="text-xs text-gray-500 mt-0.5">Δες & αφαίρεσε εκπαιδευτικούς</p>
        </Link>
        <Link
          href="/school/report"
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-sky-300 hover:bg-sky-50 transition-colors"
        >
          <p className="text-2xl font-black text-sky-600 mb-1">📊</p>
          <p className="text-sm font-semibold text-gray-800">Αναφορά χρήσης</p>
          <p className="text-xs text-gray-500 mt-0.5">Σενάρια & αξιολογήσεις ανά μέλος</p>
        </Link>
      </div>

      {/* Invite form */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <h2 className="text-base font-bold mb-1">Πρόσκληση εκπαιδευτικού</h2>
        <p className="text-xs text-gray-500 mb-4">
          Θα λάβει email με σύνδεσμο εγγραφής. Μπορείς να προσθέσεις έως 30 εκπαιδευτικούς.
        </p>
        <SchoolInviteForm />
      </div>

    </div>
  )
}

// ── Member UI ──────────────────────────────────────────────────────

function MemberView() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center space-y-4">
      <div className="text-4xl">🏫</div>
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Είσαι μέλος school plan
        </h2>
        <p className="text-sm text-gray-500">
          Έχεις πρόσβαση σε όλες τις δυνατότητες του Pro πλάνου μέσω του σχολείου σου.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        <Link
          href="/generate"
          className="px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors"
        >
          Δημιουργία σεναρίου →
        </Link>
        <Link
          href="/journal"
          className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Ημερολόγιο
        </Link>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}
