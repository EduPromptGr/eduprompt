// components/UsageWarningBanner.tsx
// Server-renderable component (χωρίς 'use client').
// Εμφανίζεται όταν ο χρήστης πλησιάζει το μηνιαίο όριο prompts.

interface UsageWarningProps {
  used: number
  limit: number
  plan: 'free' | 'pro' | 'school'
  resetDate?: string
}

export function UsageWarningBanner({
  used,
  limit,
  plan,
  resetDate,
}: UsageWarningProps) {
  if (limit <= 0) return null

  const pct = (used / limit) * 100
  if (pct < 80) return null

  const remaining = Math.max(0, limit - used)
  const isCritical = pct >= 95

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg px-4 py-3 text-sm mb-4 flex items-center justify-between gap-3 ${
        isCritical
          ? 'bg-red-50 border border-red-200'
          : 'bg-amber-50 border border-amber-200'
      }`}
    >
      <div className={isCritical ? 'text-red-700' : 'text-amber-700'}>
        <span className="font-medium">
          {isCritical ? '🔴' : '🟡'}{' '}
          {remaining === 0
            ? 'Εξαντλήθηκαν τα prompts'
            : `${remaining} prompt${remaining !== 1 ? 's' : ''} απομένουν`}
        </span>
        {resetDate && (
          <span className="text-xs ml-2 opacity-70">
            · Ανανέωση {resetDate}
          </span>
        )}
      </div>
      {plan === 'free' && (
        <a
          href="/pricing"
          className="text-xs font-semibold px-3 py-1.5 bg-gray-900 text-white rounded-lg whitespace-nowrap hover:bg-gray-700"
        >
          Pro →
        </a>
      )}
    </div>
  )
}
