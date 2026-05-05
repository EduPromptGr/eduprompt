// app/api/schedules/parse-file/route.ts
//
// Proxy multipart upload → FastAPI POST /api/schedules/parse-file
// Επιστρέφει parsed schedule JSON χωρίς αποθήκευση.
//
// Σημαντικό: δεν γίνεται JSON parsing εδώ — περνάμε το multipart
// FormData ατόφιο στο FastAPI που το χειρίζεται με python-multipart.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })
  }

  // Read the multipart body as a blob and forward it verbatim.
  // We must NOT use req.json() — it's multipart/form-data.
  let body: Blob
  try {
    body = await req.blob()
  } catch (e) {
    return NextResponse.json({ error: 'Failed to read upload body' }, { status: 400 })
  }

  const contentType = req.headers.get('content-type') ?? 'multipart/form-data'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60_000) // 60s για image OCR

  try {
    const upstream = await fetch(`${backendUrl}/api/schedules/parse-file`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        authorization: `Bearer ${session.access_token}`,
      },
      body,
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
      return NextResponse.json({ error: 'Parse timed out (60s)' }, { status: 504 })
    }
    console.error('parse-file proxy failed', e)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  } finally {
    clearTimeout(timeoutId)
  }
}
