// app/layout.tsx
//
// Root layout — wraps όλες τις pages του app.
//
// Server component. Τραβάει user + is_admin για να μπορέσει το <Header>
// να δείξει το σωστό σύνολο links και να αποφασίσει αν φαίνεται το
// "Αναφορές σφαλμάτων" admin link.
//
// Auth fetch εδώ είναι σχετικά φτηνό:
//   - getUser() χτυπάει local cookie session validation
//   - SELECT is_admin γυρίζει 1 row (cached από Supabase pgbouncer)
//   - Ο middleware ήδη ζεσταίνει το auth cache, οπότε συνήθως ΔΕΝ
//     γίνεται extra round-trip
//
// Public pages (/, /login, /signup) πάνε μέσω αυτού του layout, αλλά
// απλώς δεν θα έχουν user → δεν δείχνεται nav, μόνο το logo + login/signup
// CTAs. Αυτό κρατάει τη δομή ομοιόμορφη και ξεκουμπώνει το header από
// τις pages (που πια ξεκινάνε από <main>).

import './globals.css'
import type { Metadata, Viewport } from 'next'
import { createClient } from '@/lib/supabase/server'
import Header, { type HeaderUser } from '@/components/Header'

// Το layout διαβάζει cookies (Supabase session) — όλες οι σελίδες
// πρέπει να είναι dynamic ώστε να μην αποτύχει το static build.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'EduPrompt — Σενάρια διδασκαλίας με ΤΝ',
    template: '%s',
  },
  description:
    'Παιδαγωγικά τεκμηριωμένα σενάρια διδασκαλίας για το Δημοτικό. ' +
    'Επιστημολογία, στρατηγικές, διαφοροποίηση — έτοιμα για την τάξη.',
  applicationName: 'EduPrompt',
  authors: [{ name: 'EduPrompt' }],
  formatDetection: { email: false, address: false, telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
}

async function loadHeaderUser(): Promise<HeaderUser | null> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    // Διαβάζουμε is_admin ώστε να αποφασίσει το <Header> αν θα δείξει
    // το admin link. Δεν ρίχνουμε τη σελίδα αν αποτύχει — απλώς
    // υποθέτουμε non-admin.
    const { data } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()

    return {
      email: user.email ?? '',
      isAdmin: data?.is_admin === true,
    }
  } catch (e) {
    console.error('layout loadHeaderUser failed', e)
    return null
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headerUser = await loadHeaderUser()

  return (
    <html lang="el">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Header user={headerUser} />
        {children}
      </body>
    </html>
  )
}
