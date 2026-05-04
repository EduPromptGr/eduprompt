'use client'

// components/ReferralWidget.tsx
// Εμφανίζεται μετά το Nth prompt — compact version.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const PUBLIC_URL = process.env.NEXT_PUBLIC_URL || 'https://eduprompt.gr'

interface ReferralData {
  code: string
  rewarded: number
  promptCount: number
}

export function ReferralWidget({
  showAfterNthPrompt = 1,
}: {
  showAfterNthPrompt?: number
}) {
  const supabase = createClient()
  const [data, setData] = useState<ReferralData | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        const [userData, countData, referralData] = await Promise.all([
          supabase
            .from('users')
            .select('referral_code')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('prompts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase
            .from('referrals')
            .select('id', { count: 'exact', head: true })
            .eq('referrer_id', user.id)
            .eq('status', 'rewarded'),
        ])

        if (cancelled) return

        setData({
          code: userData.data?.referral_code || '',
          rewarded: referralData.count || 0,
          promptCount: countData.count || 0,
        })
      } catch (err) {
        console.error('ReferralWidget load failed', err)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  if (!data || !data.code || data.promptCount < showAfterNthPrompt)
    return null

  const link = `${PUBLIC_URL}/join?ref=${data.code}`
  const displayLink = link.replace(/^https?:\/\//, '')

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        // Fallback για παλιούς browsers / non-HTTPS origins
        const el = document.createElement('textarea')
        el.value = link
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('clipboard copy failed', err)
    }
  }

  return (
    <div className="border border-green-200 bg-green-50 rounded-xl p-4 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-green-800">
          🎁 Μοιράσου → +1 μήνας δωρεάν
        </span>
        {data.rewarded > 0 && (
          <span className="text-xs text-green-600 font-medium">
            {data.rewarded} παραπομπές ✅
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <code className="flex-1 text-xs bg-white border rounded-lg px-2 py-1.5 text-gray-500 truncate">
          {displayLink}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Αντιγραφή συνδέσμου παραπομπής"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            copied
              ? 'bg-green-100 text-green-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {copied ? '✅' : 'Αντιγραφή'}
        </button>
      </div>
    </div>
  )
}
