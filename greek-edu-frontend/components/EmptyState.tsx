// components/EmptyState.tsx
//
// Server-rendered, reusable empty-state block.
//
// Όλα τα list pages (/saved, /journal, ίσως /generate history) πέφτουν
// πάνω σε σχεδόν ίδιο pattern: ένα dashed-border container με κείμενο
// και CTA. Αντί να αντιγράφουμε markup, εδώ είναι το single source of
// truth — ένα Φιλόξενο visual που οδηγεί τον user στο επόμενο βήμα.
//
// Φιλοσοφία:
//   • Truly-empty state (variant='default'): warmer, με icon, title (h2),
//     description, primary CTA, optional secondary CTA, και optional
//     bullet list με hints για το τι μπορεί να κάνει εδώ.
//   • Filtered-empty state (variant='filtered'): μικρότερο, χωρίς icon,
//     focus στο "Καθαρισμός φίλτρων".
//
// A11y:
//   • <h2> για το title (η σελίδα έχει ήδη <h1>)
//   • Icons είναι aria-hidden (δεν προσφέρουν content beyond decoration)
//   • Το container δεν χρειάζεται role — είναι just a styled section
//
// Όχι 'use client' — δεν χρειάζεται interactivity.

import Link from 'next/link'

export type EmptyStateIcon = 'bookmark' | 'journal' | 'search' | 'generate'

export interface EmptyStateProps {
  /** Κύρια οπτική παραλλαγή. Default 'default'. */
  variant?: 'default' | 'filtered'
  /** Decorative icon — εμφανίζεται μόνο στο 'default' variant. */
  icon?: EmptyStateIcon
  title: string
  description: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  /**
   * Προαιρετικό σύντομο "what you can do here" list — εμφανίζεται μόνο
   * στο 'default' variant.
   */
  hints?: string[]
}

export function EmptyState({
  variant = 'default',
  icon,
  title,
  description,
  primaryCta,
  secondaryCta,
  hints,
}: EmptyStateProps) {
  if (variant === 'filtered') {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center">
        <h2 className="text-sm font-medium text-gray-800">{title}</h2>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
        {primaryCta && (
          <Link
            href={primaryCta.href}
            className="inline-block mt-3 text-sm text-sky-700 hover:underline"
          >
            {primaryCta.label}
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-2xl bg-white p-8 text-center">
      {icon && (
        <div
          aria-hidden
          className="mx-auto mb-3 w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center text-sky-600"
        >
          <Icon name={icon} />
        </div>
      )}
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-600 mt-2 max-w-prose mx-auto">
        {description}
      </p>

      {(primaryCta || secondaryCta) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryCta && (
            <Link
              href={primaryCta.href}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700"
            >
              {primaryCta.label}
            </Link>
          )}
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      )}

      {hints && hints.length > 0 && (
        <ul className="mt-6 max-w-md mx-auto text-left text-sm text-gray-600 space-y-1.5">
          {hints.map((h, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-sky-600 shrink-0">
                ✓
              </span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Inline SVG icons (no external deps) ────────────────────────
function Icon({ name }: { name: EmptyStateIcon }) {
  switch (name) {
    case 'bookmark':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'journal':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      )
    case 'search':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )
    case 'generate':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      )
  }
}
