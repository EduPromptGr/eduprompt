'use client'

// components/InstallPWAPrompt.tsx
// Εμφανίζεται μετά το 3ο prompt για mobile εγκατάσταση.

import { useEffect, useState } from 'react'

// Τύπος του beforeinstallprompt event (δεν είναι στο standard lib/dom)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STORAGE_KEY = 'pwa_dismissed'

export function InstallPWAPrompt({ promptCount }: { promptCount: number }) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Έλεγξε αν έχει ήδη απορριφθεί
    try {
      if (localStorage.getItem(STORAGE_KEY)) {
        setDismissed(true)
        return
      }
    } catch {
      // localStorage unavailable (SSR / privacy mode) — continue
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (promptCount < 3 || !installPrompt || dismissed) return null

  async function install() {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      const result = await installPrompt.userChoice
      if (result.outcome === 'accepted') {
        setInstallPrompt(null)
      }
    } catch (err) {
      console.error('PWA install failed', err)
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-blue-800">
          📱 Πρόσθεσε στην αρχική
        </div>
        <div className="text-xs text-blue-600 mt-0.5">
          Γρηγορότερη πρόσβαση χωρίς browser
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-blue-400 hover:text-blue-600"
        >
          Όχι
        </button>
        <button
          type="button"
          onClick={install}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
        >
          Εγκατάσταση
        </button>
      </div>
    </div>
  )
}
