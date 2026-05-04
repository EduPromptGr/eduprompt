// app/api/worksheets/route.ts
// Proxy προς το FastAPI /api/worksheets/generate
// Ακολουθεί το ίδιο pattern με app/api/generate/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // 1. Auth
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 3. Backend URL
  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })
  }

  // 4. Forward — timeout 120s (worksheet generation παίρνει ~30-60s)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    const upstream = await fetch(`${backendUrl}/api/worksheets/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      },
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json({ error: 'Worksheet generation timed out' }, { status: 504 })
    }
    console.error('worksheets proxy error', e)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  } finally {
    clearTimeout(timeoutId)
  }
}
