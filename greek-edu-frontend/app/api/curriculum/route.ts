// app/api/curriculum/route.ts
//
// Proxy → FastAPI GET /api/curriculum?grade=Δ&subject=Μαθηματικά
// Χρησιμοποιείται από το CurriculumDrawer component.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })
  }

  // Forward all query params (grade, subject, unit, q)
  const { search } = new URL(req.url)

  try {
    const upstream = await fetch(`${backendUrl}/api/curriculum${search}`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    })

    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      },
    })
  } catch (e) {
    console.error('curriculum proxy failed', e)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
