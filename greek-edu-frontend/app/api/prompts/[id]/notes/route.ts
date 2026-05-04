// app/api/prompts/[id]/notes/route.ts
//
// PATCH /api/prompts/:id/notes — αποθηκεύει teacher_notes σε υπάρχον σενάριο.
// Χρησιμοποιεί τον Supabase server client (RLS: μόνο ο owner μπορεί να γράψει).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let notes: string
  try {
    const body = await req.json() as Record<string, unknown>
    notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { error } = await supabase
    .from('prompts')
    .update({ teacher_notes: notes || null })
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[notes PATCH] supabase error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
