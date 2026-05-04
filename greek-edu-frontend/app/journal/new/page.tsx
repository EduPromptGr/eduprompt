// app/journal/new/page.tsx
//
// Σελίδα για δημιουργία νέας καταχώρησης στο ημερολόγιο.
//
// Server component · κάνει απλώς το auth guard και δίνει mount στο
// <JournalEntryForm> (client component). Η φόρμα κάνει μόνη της POST
// στο /api/journal και παίρνει την απάντηση· εδώ χρειαζόμαστε ένα
// μικρό wrapper client helper για να κάνει redirect μετά το save.
//
// Accepts optional ?prompt_id=<uuid> για να προ-συνδέσουμε την καταχώρηση
// με ένα υπαρκτό σενάριο (π.χ. deep link από /prompts/[id] page).

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import NewJournalEntryShell from './NewJournalEntryShell'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Νέα καταχώρηση — EduPrompt',
  robots: { index: false, follow: false },
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewJournalPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/journal/new')

  // Optional prompt_id από query param
  const rawPromptId = pickStr(searchParams.prompt_id)
  let linkedPromptId: string | null = null
  let linkedPromptSummary: { title: string; grade: string; subject: string } | null =
    null
  if (rawPromptId && UUID_RE.test(rawPromptId)) {
    const { data } = await supabase
      .from('prompts')
      .select('id, title, grade, subject')
      .eq('id', rawPromptId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (data) {
      linkedPromptId = data.id
      linkedPromptSummary = {
        title: data.title || 'Σενάριο χωρίς τίτλο',
        grade: data.grade,
        subject: data.subject,
      }
    }
    // Αν δεν βρέθηκε / δεν ανήκει στον user → σιωπηλά το αγνοούμε.
    // Ο χρήστης θα γράψει free-form και το επιτρέπουμε.
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      <nav className="text-xs text-gray-500 mb-2">
        <Link href="/journal" className="hover:underline">
          ← Ημερολόγιο
        </Link>
      </nav>
      <h1 className="text-2xl font-bold">Νέα καταχώρηση</h1>
      <p className="text-sm text-gray-600 mt-1 mb-5">
        Σύντομη αναστοχαστική σημείωση για ό,τι εφάρμοσες στην τάξη.
      </p>

      {linkedPromptSummary && (
        <div className="mb-4 border border-sky-200 bg-sky-50 rounded-xl p-3 text-sm">
          <div className="text-xs text-sky-700 uppercase tracking-wide mb-0.5">
            Συνδεδεμένο σενάριο
          </div>
          <div className="font-medium">{linkedPromptSummary.title}</div>
          <div className="text-xs text-gray-600">
            {linkedPromptSummary.grade} Δημοτικού · {linkedPromptSummary.subject}
          </div>
        </div>
      )}

      <NewJournalEntryShell promptId={linkedPromptId} />
    </main>
  )
}

function pickStr(v: string | string[] | undefined): string | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}
