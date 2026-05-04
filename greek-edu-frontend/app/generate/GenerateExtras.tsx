'use client'

// app/generate/GenerateExtras.tsx
//
// Client component που φορτώνει τα extra UI στοιχεία της generate page:
//   - NPSSurvey: εμφανίζεται μετά το 5ο σενάριο, μία φορά (localStorage guard)
//   - InstallPWAPrompt: εμφανίζεται μετά το 3ο σενάριο (component έχει δικό του guard)
//
// Φέρνει τον αριθμό σεναρίων του χρήστη από το Supabase client-side.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NPSSurvey } from '@/components/NPSSurvey'
import { InstallPWAPrompt } from '@/components/InstallPWAPrompt'

const NPS_STORAGE_KEY = 'eduprompt_nps_shown'

export default function GenerateExtras() {
  const [promptCount, setPromptCount] = useState<number>(0)
  const [showNPS, setShowNPS] = useState(false)

  useEffect(() => {
    async function fetchCount() {
      try {
        const supabase = createClient()
        const { count } = await supabase
          .from('prompts')
          .select('id', { count: 'exact', head: true })

        const n = count ?? 0
        setPromptCount(n)

        // Δείξε το NPS survey μετά το 5ο σενάριο, μία φορά
        if (n >= 5) {
          try {
            if (!localStorage.getItem(NPS_STORAGE_KEY)) {
              setShowNPS(true)
            }
          } catch {
            // localStorage unavailable — skip NPS
          }
        }
      } catch {
        // Αποτυχία fetch — χωρίς crash, απλά δεν εμφανίζεται τίποτα
      }
    }

    fetchCount()
  }, [])

  function handleNPSComplete() {
    try {
      localStorage.setItem(NPS_STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setShowNPS(false)
  }

  if (promptCount === 0) return null

  return (
    <div className="mt-6">
      {showNPS && (
        <div className="mb-4">
          <NPSSurvey trigger="day_7" onComplete={handleNPSComplete} />
        </div>
      )}
      <InstallPWAPrompt promptCount={promptCount} />
    </div>
  )
}
