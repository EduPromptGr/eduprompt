'use client'

// components/Header.tsx
//
// Top navigation bar για όλο το authenticated κομμάτι του app.
//
// - Server component (app/layout.tsx) τραβάει user + isAdmin και τα δίνει
//   εδώ ως plain props. Το active state υπολογίζεται client-side με
//   usePathname() — δεν χρειαζόμαστε prop drilling για κάθε page.
// - Mobile: μενού hamburger με toggle σε useState. Κλείνει αυτόματα όταν
//   αλλάξει το pathname (ο user πάτησε ένα link).
// - Sign-out: POST σε /api/auth/signout (route handler — υπάρχει στο
//   middleware/auth setup του Supabase). Αν δεν υπάρχει το endpoint, το
//   button δεν θα δουλέψει ως expected — αλλά δεν σπάει η σελίδα. Το
//   κρατάμε generic ώστε να μη φέρνει direct dependency στο
//   @supabase/auth-helpers στο client bundle.
//
// Accessibility:
// - <nav aria-label="Κύρια πλοήγηση">
// - aria-current="page" στο active link (όχι μόνο visual highlight)
// - aria-expanded στο hamburger button
// - aria-controls δείχνει το collapsible panel

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export interface HeaderUser {
  email: string
  isAdmin: boolean
  plan?: string  // 'free' | 'pro' | 'school' | 'paused' — optional, για school nav link
}

interface NavItem {
  href: string
  label: string
  /**
   * Όταν το current pathname ξεκινάει με ένα από αυτά (ή με `href`), το
   * link θεωρείται "ενεργό". Επιτρέπει active highlight και σε nested
   * routes (π.χ. /journal/abc-123 → "Ημερολόγιο").
   */
  match?: string[]
  /** Αν true, το link εμφανίζεται μόνο σε admin users. */
  adminOnly?: boolean
  /** Αν true, το link εμφανίζεται μόνο σε school plan users. */
  schoolOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/generate', label: 'Δημιουργία' },
  { href: '/saved', label: 'Αποθηκευμένα' },
  {
    href: '/journal',
    label: 'Ημερολόγιο',
    match: ['/journal'],
  },
  {
    href: '/school',
    label: 'Σχολείο',
    match: ['/school'],
    schoolOnly: true,
  },
  {
    href: '/referral',
    label: 'Παραπομπές',
    match: ['/referral'],
  },
  {
    href: '/profile',
    label: 'Προφίλ',
    match: ['/profile'],
  },
  {
    href: '/admin/error-reports',
    label: 'Αναφορές σφαλμάτων',
    match: ['/admin'],
    adminOnly: true,
  },
]

export default function Header({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // Κλείσε το mobile menu όποτε ο user αλλάξει σελίδα.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  function isActive(item: NavItem): boolean {
    const candidates = item.match ?? [item.href]
    return candidates.some(
      (c) => pathname === c || pathname.startsWith(c + '/'),
    )
  }

  function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    void (async () => {
      try {
        await fetch('/api/auth/signout', { method: 'POST' })
      } catch {
        // ignore — θα κάνουμε σκληρό redirect ούτως ή άλλως
      } finally {
        // Hard refresh ώστε να καθαρίσει το server-side cache του user.
        router.replace('/login')
        router.refresh()
      }
    })()
  }

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !user?.isAdmin) return false
    if (item.schoolOnly && user?.plan !== 'school') return false
    return true
  })

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link
          href={user ? '/generate' : '/'}
          className="font-bold text-base text-sky-700 shrink-0"
          aria-label="EduPrompt — Αρχική"
        >
          EduPrompt
        </Link>

        {/* Desktop nav */}
        {user && (
          <nav
            aria-label="Κύρια πλοήγηση"
            className="hidden md:flex items-center gap-1 text-sm"
          >
            {visibleItems.map((item) => {
              const active = isActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 font-medium'
                      : 'px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}

        {/* Right cluster: email + signout (desktop), hamburger (mobile) */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <>
              <span
                className="hidden md:inline text-xs text-gray-500 max-w-[180px] truncate"
                title={user.email}
              >
                {user.email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="hidden md:inline-flex px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {signingOut ? 'Έξοδος…' : 'Αποσύνδεση'}
              </button>
              <button
                type="button"
                aria-label={menuOpen ? 'Κλείσιμο μενού' : 'Άνοιγμα μενού'}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu-panel"
                onClick={() => setMenuOpen((v) => !v)}
                className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 text-gray-700"
              >
                {/* Hamburger / close icon — pure CSS, χωρίς extra deps */}
                <span aria-hidden className="text-lg leading-none">
                  {menuOpen ? '✕' : '☰'}
                </span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Σύνδεση
              </Link>
              <Link
                href="/signup"
                className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700"
              >
                Εγγραφή
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {user && menuOpen && (
        <nav
          id="mobile-menu-panel"
          aria-label="Κύρια πλοήγηση (mobile)"
          className="md:hidden border-t border-gray-200 bg-white"
        >
          <ul className="px-2 py-2 flex flex-col">
            {visibleItems.map((item) => {
              const active = isActive(item)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'block px-3 py-2 rounded-lg bg-sky-50 text-sky-700 font-medium'
                        : 'block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50'
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
            <li className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between gap-2">
              <span
                className="px-3 text-xs text-gray-500 truncate"
                title={user.email}
              >
                {user.email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="px-3 py-1.5 mr-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {signingOut ? 'Έξοδος…' : 'Αποσύνδεση'}
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}
