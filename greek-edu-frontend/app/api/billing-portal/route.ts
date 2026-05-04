// app/api/billing-portal/route.ts
//
// Δημιουργεί Stripe Customer Portal session και επιστρέφει { url }.
// Ο χρήστης redirect-άρεται εκεί για να διαχειριστεί (ακύρωση, αλλαγή
// κάρτας, κατέβασμα τιμολογίων) — χωρίς να χρειαστεί να φτιάξουμε UI.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export async function POST() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id, subscription_status')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'Δεν βρέθηκε Stripe customer. Κάνε αναβάθμιση πρώτα.' },
      { status: 400 },
    )
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/profile`

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: returnUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('billing portal error', err)
    return NextResponse.json(
      { error: 'Αδυναμία δημιουργίας portal session' },
      { status: 500 },
    )
  }
}
