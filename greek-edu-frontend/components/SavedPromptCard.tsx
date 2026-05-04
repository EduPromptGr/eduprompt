'use client'

// components/SavedPromptCard.tsx
//
// Client component για inline unsave μέσα από τη λίστα /saved.
//
// Γιατί όχι reuse του <SaveButton> από το PromptFeedback;
//   - Το SaveButton είναι ένα εικονίδιο (bookmark toggle) — γεωμετρικά δεν
//     ταιριάζει ως row-level action "Αφαίρεση από αποθηκευμένα".
//   - Εδώ θέλουμε και optimistic hide του card μετά το unsave, ώστε ο
//     χρήστης να βλέπει άμεση απόκριση χωρίς full page refresh.
//
// Αν το unsave αποτύχει, επαναφέρουμε visibility και δείχνουμε error κάτω
// από το card (μικρό τοστ-στιλ banner).

import { useState, useTransition } from 'react'
import Link from 'next/link'

interface Props {
  id: string
  title: string
  grade: string
  subject: string
  objective: string
  savedAt: string
  theoryLabel?: string | null
  strategyLabel?: string | null
}

export default function SavedPromptCard({
  id,
  title,
  grade,
  subject,
  objective,
  savedAt,
  theoryLabel,
  strategyLabel,
}: Props) {
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function unsave() {
    setError(null)
    const wasHidden = hidden
    setHidden(true) // optimistic
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/prompts/${id}/save`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ saved: false }),
          })
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            setHidden(wasHidden) // rollback
            setError(j.error ?? `HTTP ${res.status}`)
          }
          // On success: κρατάμε hidden=true· η επόμενη navigation/refresh
          // θα ξαναφέρει τη σωστή λίστα από τη βάση.
        } catch (e) {
          setHidden(wasHidden)
          setError((e as Error).message || 'Network error')
        }
      })()
    })
  }

  if (hidden && !error) {
    // Placeholder για να μην "jumpάρει" το layout αν ο user ξεκινήσει μαζικό
    // unsave. Fade-out χωρίς extra JS.
    return null
  }

  return (
    <li
      className={`border border-gray-200 rounded-xl bg-white p-4 shadow-sm transition-opacity ${
        pending ? 'opacity-60' : 'opacity-100'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            <span>{grade} Δημοτικού</span>
            <span aria-hidden="true">·</span>
            <span>{subject}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={savedAt}>Αποθηκεύθηκε {formatDate(savedAt)}</time>
          </div>
          <Link
            href={`/prompts/${id}`}
            className="mt-1 block text-base font-semibold text-sky-700 hover:underline"
          >
            {title || 'Σενάριο χωρίς τίτλο'}
          </Link>
          <p className="mt-1 text-sm text-gray-700 line-clamp-2">{objective}</p>
          {(theoryLabel || strategyLabel) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {theoryLabel && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-xs">
                  {theoryLabel}
                </span>
              )}
              {strategyLabel && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-xs">
                  {strategyLabel}
                </span>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={unsave}
          aria-label={`Αφαίρεση «${title || 'Σενάριο'}» από τα αποθηκευμένα`}
          className="shrink-0 px-2 py-1 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 disabled:opacity-50"
        >
          Αφαίρεση
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-600">
          Η αφαίρεση απέτυχε: {error}
        </p>
      )}
    </li>
  )
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('el-GR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}
