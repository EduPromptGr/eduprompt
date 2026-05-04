// lib/supabase/server.ts
// Supabase helpers για Next.js server components και route handlers.

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * User-scoped client. Χρησιμοποιεί auth cookie από το request.
 * Πηγαίνει μέσα από RLS — ένας χρήστης δεν βλέπει rows άλλων.
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Κατανοητά αποτυχαίνει σε Server Components (read-only cookies).
            // Το middleware/route handlers θα ανανεώσουν τα tokens.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // ίδιο σχόλιο ως άνω
          }
        },
      },
    },
  )
}

/**
 * Service-role client. ΠΑΡΑΚΑΜΠΤΕΙ RLS.
 *
 * Χρησιμοποίησέ το ΜΟΝΟ:
 * - σε internal endpoints (webhook handlers, cron jobs)
 * - όπου έχεις ήδη επαληθεύσει το identity με άλλο τρόπο
 *   (Stripe signature, internal secret, κλπ.)
 *
 * ΠΟΤΕ μην το εκθέσεις σε user-facing route χωρίς προηγούμενο
 * ownership check — μπορείς κατά λάθος να αφήσεις κάποιον να
 * διαβάσει/γράψει data άλλων χρηστών.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
