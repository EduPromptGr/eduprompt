// middleware.ts
//
// Audit fixes (Phase 2+3):
// - C-4  : school_owner_id precedence bug (fixed Phase 1, τεκμηρίωση παρακάτω)
// - H-1  : ADMIN_EMAIL από env var — fallback σε hardcoded για dev only
// - M-8  : in-memory cache του user row με 60s TTL, ώστε να μη
//          γίνεται query στη Supabase σε κάθε navigation
// - cookie passthrough: καθαρισμός unused `options` destructuring στο
//          request.cookies.set (το Next request.cookies δεν δέχεται options)
//
// Κάνει:
// 1. School plan member access control
// 2. Paused subscription check
// 3. Admin route protection

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── Route tables ────────────────────────────────────────────────

const PROTECTED_ROUTES = [
  '/generate',
  '/journal',
  '/school',
  '/referral',
  '/profile',
  '/settings',
]

const SCHOOL_OWNER_ROUTES = [
  '/school/members',
  '/school/report',
]

const ADMIN_ROUTES = ['/admin']

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@eduprompt.gr'

// ── User cache (M-8) ───────────────────────────────────────────
// Middleware τρέχει σε Edge Runtime — κάθε isolate έχει το δικό του
// Map, οπότε το cache δεν είναι global αλλά _locally_ ζωντανό για όση
// ώρα ο isolate στέκεται ζεστός (δηλαδή σε burst navigation).
//
// TTL 60s — αρκετός για να σώσει 5-20 queries σε navigation burst,
// μικρός αρκετά ώστε subscription status changes (π.χ. μετά από
// Stripe webhook) να γίνουν visible γρήγορα.

type CachedUser = {
  subscription_status: string | null
  pause_until: string | null
  school_owner_id: string | null
  email: string | null
}

type UserCacheEntry = {
  data: CachedUser | null
  expiresAt: number
}

const USER_CACHE_TTL_MS = 60_000
const userCache = new Map<string, UserCacheEntry>()

function getCachedUser(userId: string): CachedUser | null | undefined {
  const entry = userCache.get(userId)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId)
    return undefined
  }
  return entry.data
}

function setCachedUser(userId: string, data: CachedUser | null): void {
  userCache.set(userId, {
    data,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
  })

  // Ελαφρύ cleanup ώστε να μη μεγαλώνει απεριόριστα.
  if (userCache.size > 500) {
    const now = Date.now()
    userCache.forEach((v, k) => {
      if (v.expiresAt < now) userCache.delete(k)
    })
  }
}

// ── Middleware ─────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // request.cookies.set δεν δέχεται options — αγνοούμε το 3ο arg.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ── 1. Authentication check ──────────────────────────────────
  const needsAuth = PROTECTED_ROUTES.some((r) => pathname.startsWith(r))
  if (needsAuth && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (!user) return response

  // ── 2. Load user data (cached, M-8) ──────────────────────────
  let userData = getCachedUser(user.id)
  if (userData === undefined) {
    const { data } = await supabase
      .from('users')
      .select('subscription_status, pause_until, school_owner_id, email')
      .eq('id', user.id)
      .single()
    userData = (data as CachedUser | null) ?? null
    setCachedUser(user.id, userData)
  }

  // ── 3. Admin check ───────────────────────────────────────────
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r))
  if (isAdminRoute && userData?.email !== ADMIN_EMAIL) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // ── 4. School owner check ────────────────────────────────────
  const isSchoolOwnerRoute = SCHOOL_OWNER_ROUTES.some(
    (r) => pathname.startsWith(r),
  )
  if (isSchoolOwnerRoute) {
    if (userData?.subscription_status !== 'school') {
      return NextResponse.redirect(new URL('/pricing', request.url))
    }
    // C-4 fix: precedence bug — παλιό `!userData?.school_owner_id === null`
    // αξιολογείτο ως (!x) === null → πάντα false → members είχαν access.
    // Οι owners έχουν school_owner_id = null, οι members έχουν !== null.
    if (userData?.school_owner_id != null) {
      return NextResponse.redirect(new URL('/generate', request.url))
    }
  }

  // ── 5. Paused subscription check ─────────────────────────────
  if (userData?.pause_until) {
    const pauseUntil = new Date(userData.pause_until)
    const now = new Date()

    if (pauseUntil > now) {
      const blockDuringPause = ['/generate']
      if (blockDuringPause.some((r) => pathname.startsWith(r))) {
        const pauseUrl = new URL('/paused', request.url)
        pauseUrl.searchParams.set(
          'until',
          pauseUntil.toLocaleDateString('el-GR'),
        )
        return NextResponse.redirect(pauseUrl)
      }
    } else {
      // Η παύση τελείωσε — καθάρισε το flag και invalidate cache.
      await supabase
        .from('users')
        .update({ pause_until: null })
        .eq('id', user.id)
      userCache.delete(user.id)
    }
  }

  // ── 6. Σηκώνουμε info στα headers για server components ─────
  response.headers.set('x-user-id', user.id)
  response.headers.set(
    'x-user-plan',
    userData?.subscription_status || 'free',
  )

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
