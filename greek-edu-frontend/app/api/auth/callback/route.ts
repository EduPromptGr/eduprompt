// app/api/auth/callback/route.ts
//
// Supabase PKCE Auth Callback — απαραίτητο για:
//   1. Email confirmation (signup)
//   2. Password reset (forgot-password)
//   3. Οποιοδήποτε OAuth provider (αν προστεθεί στο μέλλον)
//
// Πώς δουλεύει:
//   Το Supabase στέλνει email με link:
//     https://eduprompt.gr/api/auth/callback?code=XXXX&next=/generate
//   Το route handler:
//     1. Ανταλλάσσει το `code` με session (PKCE exchange)
//     2. Αν είναι signup confirmation → POST /api/auth/welcome (welcome email)
//     3. Redirect στο `next` param (default: /generate)
//
// Security:
//   - Αν το code exchange αποτύχει → redirect σε /login?error=auth
//   - Το `next` param γίνεται validate (πρέπει να ξεκινά με /) ώστε
//     να αποφύγουμε open redirect σε external URLs.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/generate'

  // Validate next param — μόνο relative paths
  const next = rawNext.startsWith('/') ? rawNext : '/generate'

  if (!code) {
    // Δεν υπάρχει code — πιθανώς παλιό hash-based flow ή broken link.
    // Redirect στο login με error ώστε ο user να ξέρει τι έγινε.
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('auth callback: code exchange failed', error?.message)
    return NextResponse.redirect(`${origin}/login?error=code_expired`)
  }

  // ── Welcome email (μόνο για νέους users) ────────────────────────────────
  // Καλούμε το /api/auth/welcome — είναι idempotent (αν ήδη στάλθηκε
  // επιστρέφει { skipped: true }). Δεν περιμένουμε να τελειώσει ώστε να
  // μην καθυστερήσουμε το redirect.
  // Χρησιμοποιούμε absolute URL επειδή είμαστε σε server context.
  fetch(`${origin}/api/auth/welcome`, {
    method: 'POST',
    headers: {
      // Στέλνουμε το access_token ώστε το welcome route να αναγνωρίσει τον user
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
  }).catch((err) => {
    // fire-and-forget — αποτυχία δεν μπλοκάρει το redirect
    console.warn('auth callback: welcome email fire-and-forget failed', err)
  })

  return NextResponse.redirect(`${origin}${next}`)
}
