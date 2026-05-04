// app/api/auth/signout/route.ts
//
// POST /api/auth/signout — clear του Supabase session cookie και
// invalidation του refresh token.
//
// Ο cookie-based Supabase client χρησιμοποιεί το cookie() store από το
// next/headers· καλώντας supabase.auth.signOut() ο SSR helper καθαρίζει
// τα tokens μέσω του cookie callback που δώσαμε στον createServerClient
// (lib/supabase/server.ts). Ένα ακόλουθο router.replace('/login') στο
// client θα δώσει στον middleware ευκαιρία να redirect-loop-free φέρει
// τον user στη login.
//
// Δεν θέλουμε CSRF token ξεχωριστά — το browser στέλνει το cookie μόνο
// σε same-origin POST, και το endpoint δεν δέχεται data· είναι
// idempotent. Αν στο μέλλον θέλουμε strict CSRF, θα μπει middleware
// header check.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = createClient()
  try {
    await supabase.auth.signOut()
  } catch (e) {
    // Δεν ανακοινώνουμε το error στον client — είτε καθάρισε ο cookie
    // στο supabase, είτε όχι, ο client θα κάνει redirect στο /login
    // και ο middleware θα ξανα-φιλτράρει το (πιθανώς ακόμα ζεστό)
    // session.
    console.error('signout failed', e)
  }
  return NextResponse.json({ ok: true })
}
