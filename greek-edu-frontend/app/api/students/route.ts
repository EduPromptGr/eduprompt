// app/api/students/route.ts
// Proxy → FastAPI /api/students (GET list + POST create)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getSession() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const qs = searchParams.toString()
  const url = `${backendUrl}/api/students${qs ? `?${qs}` : ''}`

  const upstream = await fetch(url, {
    headers: { authorization: `Bearer ${session.access_token}` },
  })
  const text = await upstream.text()
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })
  }

  const body = await req.text()
  const upstream = await fetch(`${backendUrl}/api/students`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
    body,
  })
  const text = await upstream.text()
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}
