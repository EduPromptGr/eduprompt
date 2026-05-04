// lib/emails/templates/referralReward.ts
//
// Εξήχθη από το inline template στο app/api/referral/reward/route.ts.
// Καλείται όταν ένας user που έφερε κάποιος κερδίζει 1 μήνα Pro δωρεάν.

import { renderEmailLayout, escape } from '../layout'

export interface ReferralRewardEmailOptions {
  /** Email του referrer που κερδίζει το reward */
  referrerEmail: string
  /** Πόσοι μήνες δωρεάν κερδήθηκαν (default 1) */
  months?: number
  /** Ποιος εγγράφηκε (προαιρετικά, για personalization) */
  referredEmail?: string
}

const PUBLIC_URL = process.env.NEXT_PUBLIC_URL || 'https://eduprompt.gr'

export function referralRewardEmail(opts: ReferralRewardEmailOptions): {
  subject: string
  html: string
} {
  const months = opts.months ?? 1
  const monthsText = months === 1 ? '1 μήνα Pro' : `${months} μήνες Pro`
  const referredBlock = opts.referredEmail
    ? `<p style="margin:0 0 16px 0;color:#6b7280;font-size:14px">
         Ο/Η ${escape.text(opts.referredEmail)} αναβαθμίστηκε και απολαμβάνει
         ήδη το Pro πλάνο.
       </p>`
    : ''

  const bodyHtml = `
    <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700">
      Κέρδισες ${monthsText} δωρεάν! 🎁
    </h1>

    <p style="margin:0 0 16px 0">
      Ένας εκπαιδευτικός που προσκάλεσες στο EduPrompt αναβαθμίστηκε σε Pro —
      και εσύ κερδίζεις <strong>${monthsText} δωρεάν</strong>.
    </p>

    ${referredBlock}

    <p style="margin:0 0 16px 0">
      Το credit θα εφαρμοστεί <strong>αυτόματα</strong> στην επόμενη χρέωσή σου.
      Δεν χρειάζεται να κάνεις τίποτα — απλά συνέχισε να δημιουργείς τα σενάριά σου.
    </p>

    <h2 style="margin:24px 0 12px 0;font-size:18px;font-weight:600">
      Συνέχισε να μοιράζεσαι
    </h2>

    <p style="margin:0 0 16px 0">
      Για κάθε συνάδελφο που εγγράφεται και αναβαθμίζεται, κερδίζεις άλλον
      1 μήνα Pro. Χωρίς όριο.
    </p>
  `

  return {
    subject: `🎁 Κέρδισες ${monthsText} δωρεάν στο EduPrompt!`,
    html: renderEmailLayout({
      title: 'Κέρδισες reward',
      preheader: `Ένας φίλος αναβαθμίστηκε — κέρδισες ${monthsText} δωρεάν`,
      bodyHtml,
      cta: {
        label: 'Πρόσκαλεσε περισσότερους',
        url: `${PUBLIC_URL}/referrals`,
      },
    }),
  }
}
