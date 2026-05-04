// app/journal/[id]/page.tsx
//
// Detail + edit page για μία καταχώρηση ημερολογίου.
//
// Server component φορτώνει το entry (RLS φιλτράρει user_id=auth.uid()).
// Δίνει mount σε <JournalDetailShell> (client) που εναλλάσσει ανάμεσα σε
// view mode και edit mode (το ίδιο <JournalEntryForm> με `initial` prop).
//
// Delete γίνεται με το DELETE /api/journal/[id] και redirect πίσω στη λίστα.
//
// Αν το entry δεν βρίσκεται (404) ή δεν ανήκει στον user (η RLS γυρνάει
// 0 rows), περνάμε σε notFound().

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import JournalDetailShell from './JournalDetailShell'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Types (μοιράζονται shape με τη φόρμα) ───────────────────────
interface JournalEntry {
  id: string
  prompt_id: string | null
  title: string | null
  reflection_text: string
  overall_rating: number | null
  students_engaged_pct: number | null
  tags: string[] | null
  applied_on: string | null
  created_at: string
  updated_at: string
}

interface LinkedPrompt {
  id: string
  title: string | null
  grade: string
  subject: string
}

export async function generateMetadata({
  params,
}: {
  params: { id: string }
}): Promise<Metadata> {
  const entry = await loadEntry(params.id)
  if (!entry) return { title: 'Καταχώρηση δεν βρέθηκε — EduPrompt' }
  const title = entry.title?.trim() || 'Αναστοχασμός'
  return {
    title: `${title} — Ημερολόγιο EduPrompt`,
    robots: { index: false, follow: false },
  }
}

async function loadEntry(id: string): Promise<JournalEntry | null> {
  if (!UUID_RE.test(id)) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('journal')
    .select(
      'id, prompt_id, title, reflection_text, overall_rating, students_engaged_pct, tags, applied_on, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('journal detail fetch failed', error)
    return null
  }
  return (data as JournalEntry | null) ?? null
}

export default async function JournalDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/journal/${params.id}`)

  const entry = await loadEntry(params.id)
  if (!entry) notFound()

  // Load linked prompt (αν υπάρχει) — πάει από την ίδια RLS
  let prompt: LinkedPrompt | null = null
  if (entry.prompt_id) {
    const { data } = await supabase
      .from('prompts')
      .select('id, title, grade, subject')
      .eq('id', entry.prompt_id)
      .maybeSingle()
    prompt = (data as LinkedPrompt | null) ?? null
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      <nav className="text-xs text-gray-500 mb-2">
        <Link href="/journal" className="hover:underline">
          ← Ημερολόγιο
        </Link>
      </nav>
      <JournalDetailShell initial={entry} linkedPrompt={prompt} />
    </main>
  )
}
