// app/api/school/report/route.ts
// Παράγει μηνιαίο JSON report για school owner.
// (PDF generation TODO με puppeteer αν χρειαστεί στο μέλλον.)

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify ότι είναι school owner
  const { data: caller } = await supabase
    .from('users')
    .select('subscription_status, school_owner_id, email')
    .eq('id', user.id)
    .single()

  if (
    caller?.subscription_status !== 'school' ||
    caller?.school_owner_id != null
  ) {
    return NextResponse.json(
      { error: 'School owner access required' },
      { status: 403 },
    )
  }

  // Φόρτωσε report data μέσω RPC
  const { data: reportData, error } = await supabase.rpc(
    'get_school_monthly_report',
    {
      p_school_owner_id: user.id,
      p_month: month,
    },
  )

  if (error) {
    console.error('school report rpc failed', error)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 },
    )
  }

  type MemberRow = {
    member_email?: string
    prompts_generated?: number
    avg_rating?: number
  }

  const rows: MemberRow[] = reportData ?? []

  const totalPrompts = rows.reduce(
    (sum, m) => sum + (m.prompts_generated || 0),
    0,
  )
  const avgRating = rows.length
    ? (
        rows.reduce((sum, m) => sum + (m.avg_rating || 0), 0) / rows.length
      ).toFixed(2)
    : null

  const report = {
    school_email: caller.email,
    month,
    generated_at: new Date().toISOString(),
    summary: {
      total_members: rows.length,
      total_prompts: totalPrompts,
      avg_rating: avgRating,
    },
    members: rows,
  }

  return NextResponse.json(report)
}
