// app/school/report/page.tsx
//
// Αναφορά χρήσης σχολείου — μόνο για school owner.
// Φέρνει JSON από /api/school/report και το εμφανίζει ως πίνακα.
//
// Server component · noindex.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Αναφορά χρήσης — EduPrompt',
  robots: { index: false, follow: false },
}

interface MemberStat {
  member_email: string
  prompts_generated: number
  avg_rating: number | null
}

interface ReportData {
  school_email: string
  month: string
  summary: {
    total_members: number
    total_prompts: number
    avg_rating: string | null
  }
  members: MemberStat[]
}

export default async function SchoolReportPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/school/report')

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  const backendUrl = process.env.BACKEND_API_URL
  const currentMonth =
    searchParams.month ?? new Date().toISOString().slice(0, 7)

  let report: ReportData | null = null
  let fetchError: string | null = null

  if (backendUrl && accessToken) {
    try {
      const res = await fetch(
        `${backendUrl}/api/school/report?month=${currentMonth}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(5000),
        },
      )
      if (res.ok) {
        report = await res.json()
      } else {
        const err = await res.json().catch(() => ({}))
        fetchError = err.error ?? `HTTP ${res.status}`
      }
    } catch (e) {
      fetchError = 'Αδυναμία σύνδεσης με τον server.'
    }
  } else {
    // Fallback: διάβασε απευθείας από το Next.js route handler
    try {
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
      const res = await fetch(
        `${origin}/api/school/report?month=${currentMonth}`,
        {
          headers: { Cookie: `sb-access-token=${accessToken}` },
          signal: AbortSignal.timeout(5000),
        },
      )
      if (res.ok) report = await res.json()
      else fetchError = `HTTP ${res.status}`
    } catch {
      fetchError = 'Αποτυχία φόρτωσης αναφοράς.'
    }
  }

  // Μήνες για το dropdown
  const months: string[] = []
  const d = new Date()
  for (let i = 0; i < 6; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 text-gray-900">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link href="/school" className="text-xs text-sky-600 hover:underline mb-1 block">
            ← Πίσω στο σχολείο
          </Link>
          <h1 className="text-2xl font-bold">Αναφορά χρήσης</h1>
        </div>

        {/* Month picker (GET form) */}
        <form method="GET" className="flex items-center gap-2 text-sm">
          <label htmlFor="month" className="text-gray-500 text-xs">Μήνας:</label>
          <select
            id="month"
            name="month"
            defaultValue={currentMonth}
            className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-400"
            onChange={(e) => {
              // client-side submit on change — αρκεί ο browser
              ;(e.target.form as HTMLFormElement)?.submit()
            }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' })
                  .format(new Date(`${m}-01`))}
              </option>
            ))}
          </select>
        </form>
      </div>

      {fetchError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Αποτυχία φόρτωσης αναφοράς: {fetchError}
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SummaryCard label="Εκπαιδευτικοί" value={String(report.summary.total_members)} />
            <SummaryCard label="Σενάρια μήνα" value={String(report.summary.total_prompts)} />
            {report.summary.avg_rating && (
              <SummaryCard label="Μέση αξιολόγηση" value={`${report.summary.avg_rating} / 5`} />
            )}
          </div>

          {/* Members table */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Εκπαιδευτικός</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Σενάρια</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">
                    Μέση βαθμολογία
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-xs">
                      Δεν υπάρχουν δεδομένα για αυτόν τον μήνα.
                    </td>
                  </tr>
                ) : (
                  report.members.map((m) => (
                    <tr
                      key={m.member_email}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-gray-800">{m.member_email}</td>
                      <td className="px-4 py-3 text-center font-medium text-gray-900">
                        {m.prompts_generated}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 hidden sm:table-cell">
                        {m.avg_rating != null ? `${Number(m.avg_rating).toFixed(1)} / 5` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!report && !fetchError && (
        <p className="text-sm text-gray-400 text-center py-12">Φόρτωση αναφοράς…</p>
      )}
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
    </div>
  )
}
