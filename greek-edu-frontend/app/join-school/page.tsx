// app/join-school/page.tsx
//
// Σελίδα αποδοχής πρόσκλησης σχολείου.
//
// Λαμβάνει ?token=XXX από το school invite email.
// Αν ο user δεν είναι logged in → redirect login με next param.
// Αν είναι logged in → δείχνει confirmation card + JoinSchoolClient.
//
// Server component · noindex.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import JoinSchoolClient from './JoinSchoolClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Πρόσκληση σχολείου — EduPrompt',
  robots: { index: false, follow: false },
}

export default async function JoinSchoolPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams.token?.trim() ?? ''

  // Token validation — πρέπει να μοιάζει με UUID ή hex string
  if (!token || token.length < 10) {
    return <InvalidToken />
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Αν δεν είναι logged in → signup (με next param για επιστροφή μετά)
  if (!user) {
    const next = encodeURIComponent(`/join-school?token=${token}`)
    redirect(`/signup?next=${next}`)
  }

  // Φόρτωσε πληροφορίες invite για preview (email του owner)
  const { data: invite } = await supabase
    .from('school_invites')
    .select('email, school_owner_id, expires_at')
    .eq('token', token)
    .eq('status', 'pending')
    .single()

  // Αν το invite δεν υπάρχει ή έχει λήξει → δείξε error
  if (!invite || new Date(invite.expires_at) < new Date()) {
    return <ExpiredToken />
  }

  // Email mismatch check (ο user είναι logged in με λάθος account)
  const emailMatch =
    !invite.email ||
    user.email?.toLowerCase() === invite.email.toLowerCase()

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-10 space-y-6">

          <div className="text-center">
            <div className="text-5xl mb-3">🏫</div>
            <h1 className="text-xl font-bold text-gray-900">
              Πρόσκληση σε school plan
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Σε προσκαλούν να γίνεις μέλος του σχολικού πλάνου EduPrompt.
              Θα αποκτήσεις πλήρη πρόσβαση σε όλες τις δυνατότητες Pro.
            </p>
          </div>

          {/* Benefit list */}
          <div className="bg-sky-50 rounded-xl p-4 text-sm text-sky-800 space-y-1">
            <p className="font-semibold mb-2">Τι περιλαμβάνει:</p>
            {[
              '150+ σενάρια τον μήνα',
              'Προφίλ τάξης με AI insights',
              'Data-driven επιλογή θεωρίας',
              'Παιδαγωγικό ημερολόγιο',
            ].map((f) => (
              <p key={f} className="flex items-center gap-2">
                <span className="text-sky-500">✓</span> {f}
              </p>
            ))}
          </div>

          {!emailMatch ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Λάθος λογαριασμός</p>
              <p>
                Η πρόσκληση στάλθηκε στο{' '}
                <strong>{invite.email}</strong>. Είσαι συνδεδεμένος ως{' '}
                <strong>{user.email}</strong>.
              </p>
              <Link
                href="/login"
                className="mt-2 block text-amber-700 font-medium hover:underline"
              >
                Σύνδεση με τον σωστό λογαριασμό →
              </Link>
            </div>
          ) : (
            <JoinSchoolClient token={token} />
          )}

          <p className="text-xs text-gray-400 text-center">
            Συνδεδεμένος ως <strong>{user.email}</strong>
          </p>
        </div>
      </div>
    </main>
  )
}

function InvalidToken() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="text-center max-w-sm space-y-4">
        <div className="text-4xl">🔗</div>
        <h1 className="text-xl font-bold text-gray-900">Άκυρος σύνδεσμος</h1>
        <p className="text-sm text-gray-500">
          Ο σύνδεσμος πρόσκλησης που ακολούθησες δεν είναι έγκυρος. Ζήτησε νέα πρόσκληση από τον Διευθυντή του σχολείου σου.
        </p>
        <Link href="/" className="text-sky-600 text-sm hover:underline">
          Πίσω στην αρχική
        </Link>
      </div>
    </main>
  )
}

function ExpiredToken() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="text-center max-w-sm space-y-4">
        <div className="text-4xl">⏰</div>
        <h1 className="text-xl font-bold text-gray-900">Η πρόσκληση έχει λήξει</h1>
        <p className="text-sm text-gray-500">
          Αυτός ο σύνδεσμος πρόσκλησης δεν ισχύει πλέον. Ζήτησε νέα πρόσκληση από τον Διευθυντή.
        </p>
        <Link href="/" className="text-sky-600 text-sm hover:underline">
          Πίσω στην αρχική
        </Link>
      </div>
    </main>
  )
}
