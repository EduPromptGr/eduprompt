// app/api/students/[id]/route.ts
// Proxy → FastAPI /api/students/{id} (GET + PATCH + DELETE)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getSession() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

type Ctx = { params: { id: string } }

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })
  }

  const upstream = await fetch(`${backendUrl}/api/students/${params.id}`, {
    headers: { authorization: `Bearer ${session.access_token}` },
  })
  const text = await upstream.text()
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })
  }

  const body = await req.text()
  const upstream = await fetch(`${backendUrl}/api/students/${params.id}`, {
    method: 'PATCH',
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

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession()
  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backendUrl = process.env.BACKEND_API_URL?.trim()
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })
  }

  const upstream = await fetch(`${backendUrl}/api/students/${params.id}`, {
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
}
