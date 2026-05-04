'use client'

// app/journal/new/NewJournalEntryShell.tsx
//
// Μικρό client-side wrapper γύρω από το <JournalEntryForm> ώστε μετά από
// επιτυχές save να πάμε στη detail page του νέου entry. Δεν θέλουμε να
// βάλουμε Next.js router logic μέσα στη form — την κρατάμε generic.

import { useRouter } from 'next/navigation'
import { JournalEntryForm, type JournalEntry } from '@/components/JournalEntryForm'

export default function NewJournalEntryShell({
  promptId,
}: {
  promptId: string | null
}) {
  const router = useRouter()
  return (
    <JournalEntryForm
      promptId={promptId}
      onSaved={(entry: JournalEntry) => {
        // Μετά το create → detail page. Χρησιμοποιούμε push (όχι replace)
        // ώστε ο user να μπορεί να γυρίσει στην "Νέα καταχώρηση" αν θέλει
        // γρήγορο undo με Back.
        router.push(`/journal/${entry.id}`)
      }}
      onCancel={() => router.push('/journal')}
    />
  )
}
