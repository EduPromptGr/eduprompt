// app/api/schedules/[id]/route.ts
//
// Proxy → FastAPI /api/schedules/{id}
//   GET    — ανάκτηση schedule
//   PATCH  — partial update
//   DELETE — διαγραφή

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getSession() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

function backendUrl() {
  return process.env.BACKEND_API_URL?.trim() ?? ''
}

interface RouteParams { params: { id: string } }

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const base = backendUrl()
  if (!base) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })

  try {
    const upstream = await fetch(`${base}/api/schedules/${params.id}`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  } catch (e) {
    console.error('schedules GET/{id} proxy failed', e)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const base = backendUrl()
  if (!base) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const upstream = await fetch(`${base}/api/schedules/${params.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    })
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  } catch (e) {
    console.error('schedules PATCH proxy failed', e)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const base = backendUrl()
  if (!base) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })

  try {
    const upstream = await fetch(`${base}/api/schedules/${params.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    if (upstream.status === 204) {
      return new NextResponse(null, { status: 204 })
    }
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  } catch (e) {
    console.error('schedules DELETE proxy failed', e)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
