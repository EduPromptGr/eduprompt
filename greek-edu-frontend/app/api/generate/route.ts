// app/api/generate/route.ts
//
// Proxy από το Next.js frontend στο FastAPI backend για /api/generate.
//
// Γιατί proxy:
//   • Same-origin call από τον client — αποφεύγουμε CORS setup στο
//     FastAPI και κρύβουμε τη δομή του backend URL.
//   • Auth: ο user έχει Supabase session cookie εδώ — εμείς διαβάζουμε
//     το JWT access_token και το προωθούμε ως Bearer header στο
//     FastAPI, που έχει `get_current_user_id` να το κάνει verify.
//   • Centralized error mapping: το FastAPI επιστρέφει 401/422/429/502 —
//     τα μεταφέρουμε ατόφια ώστε το UI να δείχνει το σωστό μήνυμα.
//
// Env: BACKEND_API_URL — server-only, χωρίς NEXT_PUBLIC_ prefix.
//
// Σημείωση: ΔΕΝ κάνουμε rate limiting εδώ — το FastAPI έχει το δικό
// του (rate_limiter.py). Επίσης δεν κάνουμε re-validation του body —
// το αφήνουμε στο Pydantic του FastAPI ώστε να μη διαφέρουν τα κανόνες.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface GenerateRequest {
  grade: string
  subject: string
  unit?: string | null
  chapter?: string | null
  objective: string
  theory?: string | null
  strategy?: string | null
  environments?: string[]
  class_profile_id?: string | null
}

export async function POST(req: Request) {
  // 1. Auth: παίρνουμε access_token από το Supabase session cookie
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Body parsing — αφήνουμε το FastAPI να κάνει validation
  let body: GenerateRequest
  try {
    body = (await req.json()) as GenerateRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 3. Backend URL
  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    console.error('BACKEND_API_URL missing — generate proxy cannot reach FastAPI')
    return NextResponse.json(
      { error: 'Backend not configured' },
      { status: 503 },
    )
  }

  // 4. Forward call. Timeout 30s — generation παίρνει ~10s typical.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 90_000)

  try {
    const upstream = await fetch(`${backendUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    // Επιστρέφουμε raw body + status — το UI χειρίζεται το mapping.
    // Διαβάζουμε σαν text ώστε ακόμα κι αν το FastAPI απαντήσει με
    // non-JSON σφάλμα (π.χ. nginx 502), να μην σπάσουμε εδώ.
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type':
          upstream.headers.get('content-type') ?? 'application/json',
      },
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Generation timed out' },
        { status: 504 },
      )
    }
    console.error('generate proxy failed', e)
    return NextResponse.json(
      { error: 'Backend unreachable' },
      { status: 502 },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
