// app/api/school/invite/route.ts
// Δημιουργεί invite token και στέλνει email στον προσκαλούμενο εκπαιδευτικό.

import { createClient } from '@/lib/supabase/server'
import { sendEmail, schoolInviteEmail } from '@/lib/emails'
import { NextResponse } from 'next/server'

// Χρησιμοποιούμε NEXT_PUBLIC_SITE_URL (consistent με sitemap/canonical)
const PUBLIC_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eduprompt.gr'

const MAX_SCHOOL_MEMBERS = 30

export async function POST(request: Request) {
  const supabase = createClient()

  // ── Auth ────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify ότι ο caller είναι school plan owner (όχι member)
  const { data: caller } = await supabase
    .from('users')
    .select('subscription_status, school_owner_id, email')
    .eq('id', user.id)
    .single()

  if (caller?.subscription_status !== 'school') {
    return NextResponse.json(
      { error: 'School plan required' },
      { status: 403 },
    )
  }

  if (caller?.school_owner_id != null) {
    return NextResponse.json(
      { error: 'Only the school owner can invite members' },
      { status: 403 },
    )
  }

  const { email } = await request.json()
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json(
      { error: 'Valid email required' },
      { status: 400 },
    )
  }

  // ── Atomic check + insert μέσω RPC (H-11 fix) ──────────────────
  // Το RPC κάνει advisory lock + check + insert ώστε να μην
  // ξεπεραστεί το όριο 30 με race conditions.
  const { data: invite, error: rpcError } = await supabase.rpc(
    'add_school_invite',
    {
      p_owner_id: user.id,
      p_email: email.toLowerCase(),
      p_max_members: MAX_SCHOOL_MEMBERS,
    },
  )

  if (rpcError) {
    if (rpcError.message?.includes('limit_reached')) {
      return NextResponse.json(
        {
          error: `Έχεις φτάσει το μέγιστο των ${MAX_SCHOOL_MEMBERS} εκπαιδευτικών`,
        },
        { status: 400 },
      )
    }
    console.error('school invite rpc failed', rpcError)
    return NextResponse.json(
      { error: 'Failed to create invite' },
      { status: 500 },
    )
  }

  // Στείλε email πρόσκλησης (best-effort — το invite έχει ήδη δημιουργηθεί,
  // αν το email αποτύχει ο owner μπορεί να ξαναπροσπαθήσει)
  const inviteLink = `${PUBLIC_URL}/join-school?token=${invite.token}`

  const result = await sendEmail({
    to: email,
    ...schoolInviteEmail({
      inviterEmail: caller.email,
      inviteLink,
    }),
    tags: [{ name: 'category', value: 'school_invite' }],
  })

  if (!result.ok) {
    console.error('invite email failed:', result.error)
  }

  return NextResponse.json({
    success: true,
    emailSent: result.ok && !result.skipped,
  })
}
