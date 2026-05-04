'use client'

// app/school/members/SchoolMembersClient.tsx
// Λίστα μελών με δυνατότητα αφαίρεσης (client component).

import { useState } from 'react'

interface MemberRow {
  id: string
  email: string | null
  created_at: string
}

export default function SchoolMembersClient({
  members: initial,
  ownerId,
}: {
  members: MemberRow[]
  ownerId: string
}) {
  const [members, setMembers] = useState(initial)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRemove(memberId: string) {
    if (removing) return
    if (!confirm('Αφαίρεση εκπαιδευτικού από το σχολείο; Δεν θα έχει πλέον πρόσβαση στο school plan.')) return

    setError(null)
    setRemoving(memberId)

    try {
      const res = await fetch('/api/school/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Αποτυχία αφαίρεσης μέλους.')
        return
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch {
      setError('Πρόβλημα σύνδεσης. Δοκίμασε ξανά.')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">
                Προστέθηκε
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-800">
                  {m.email ?? <span className="text-gray-400 italic">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                  {new Intl.DateTimeFormat('el-GR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }).format(new Date(m.created_at))}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemove(m.id)}
                    disabled={removing === m.id}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-40 transition-colors"
                  >
                    {removing === m.id ? 'Αφαίρεση…' : 'Αφαίρεση'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
