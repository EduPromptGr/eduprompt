'use client'

// components/NPSSurvey.tsx
// Εμφανίζεται ημέρα 7 ή 30 (ή μετά από ακύρωση) για NPS collection.
//
// DB column: nps_responses.trigger_source TEXT (όχι triggered_at — αυτό
// είναι timestamp). Bλ. audit finding M-14.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface NPSProps {
  trigger: 'day_7' | 'day_30' | 'post_cancel'
  onComplete: () => void
}

export function NPSSurvey({ trigger, onComplete }: NPSProps) {
  const supabase = createClient()
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (score === null) return
    setLoading(true)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { error: insertError } = await supabase
          .from('nps_responses')
          .insert({
            user_id: user.id,
            score,
            comment: comment || null,
            trigger_source: trigger,
          })

        if (insertError) throw insertError
      }

      setSubmitted(true)
      setTimeout(onComplete, 1500)
    } catch (err) {
      console.error('NPS submit failed', err)
      setError('Η αποστολή απέτυχε. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="text-center py-4"
      >
        <div className="text-2xl mb-2" aria-hidden="true">
          🙏
        </div>
        <div className="text-sm font-medium text-gray-700">
          Ευχαριστούμε για τη γνώμη σου!
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-2xl p-5 shadow-lg max-w-sm mx-auto">
      <div className="text-sm font-semibold text-gray-800 mb-1">
        Πόσο πιθανό να μας συστήσεις σε συνάδελφο;
      </div>
      <div className="text-xs text-gray-400 mb-4">
        0 = καθόλου, 10 = σίγουρα
      </div>

      <div
        role="radiogroup"
        aria-label="NPS score 0 έως 10"
        className="flex gap-1 mb-4"
      >
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={score === i}
            aria-label={`Βαθμός ${i}`}
            onClick={() => setScore(i)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              score === i
                ? i >= 9
                  ? 'bg-green-600 text-white'
                  : i >= 7
                    ? 'bg-amber-500 text-white'
                    : 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {i}
          </button>
        ))}
      </div>

      {score !== null && (
        <div className="mb-4">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              score >= 9
                ? 'Τι σου αρέσει περισσότερο;'
                : score >= 7
                  ? 'Τι θα μπορούσε να βελτιωθεί;'
                  : 'Τι δεν λειτούργησε για σένα;'
            }
            rows={2}
            maxLength={500}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-gray-400"
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5"
        >
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onComplete}
          className="flex-1 py-2 border rounded-lg text-sm text-gray-500 hover:bg-gray-50"
        >
          Παράλειψη
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={score === null || loading}
          className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-40"
        >
          {loading ? 'Αποστολή...' : 'Αποστολή'}
        </button>
      </div>
    </div>
  )
}
