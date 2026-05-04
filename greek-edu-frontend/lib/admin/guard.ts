// lib/admin/guard.ts
//
// Shared admin-auth guard για όλα τα admin endpoints και pages.
//
// Πώς δουλεύει:
//   1. Παίρνει το current user από τον cookie-based Supabase client (RLS scope).
//   2. Τραβάει `users.is_admin` για αυτόν τον user.
//   3. Αν user null → 'unauthorized'  (401)
//      Αν is_admin=false → 'forbidden' (403)
//      Αν is_admin=true  → ok με { user, supabase }.
//
// Γιατί να μην βασιστούμε ΜΟΝΟ στις RLS policies;
//   Οι RLS policies (`admins_view_all_error_reports`, `admins_update_error_reports`)
//   απλά γυρίζουν 0 rows σε μη-admin users — δεν διακρίνουν μεταξύ
//   "δεν υπάρχει" και "δεν έχεις δικαίωμα". Ο guard μας δίνει σαφές
//   403 με μήνυμα ώστε το UI να μπορεί να δείξει σωστή σελίδα
//   (π.χ. redirect στο dashboard αντί για 404).
//
// Security: ΔΕΝ βασιζόμαστε σε JWT claims (admin=true could be tampered) —
// πάντα διαβάζουμε from DB.

import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export type AdminGuardResult =
  | {
      ok: true
      user: User
      supabase: SupabaseClient
    }
  | {
      ok: false
      status: 401 | 403 | 500
      error: string
    }

/**
 * Ελέγχει ότι ο τρέχων χρήστης είναι admin.
 * Χρήση σε route handlers:
 *
 *   const guard = await requireAdmin()
 *   if (!guard.ok) {
 *     return NextResponse.json({ error: guard.error }, { status: guard.status })
 *   }
 *   const { user, supabase } = guard
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  // Fetch is_admin. Χρησιμοποιούμε user-scoped client (RLS) — ο user
  // μπορεί πάντα να διαβάσει το δικό του row (policy users_view_own).
  const { data, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('requireAdmin: users row fetch failed', error)
    return { ok: false, status: 500, error: 'Failed to verify admin' }
  }
  if (!data || data.is_admin !== true) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  return { ok: true, user, supabase }
}
