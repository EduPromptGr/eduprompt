// lib/emails/templates/welcome.ts
//
// Welcome email — στέλνεται μία φορά μετά από το πρώτο επιτυχές login.
// Το Supabase στέλνει ήδη verification email automatically — αυτό είναι
// ΕΠΙΠΛΕΟΝ, με onboarding tips + CTA για το πρώτο prompt.

import { renderEmailLayout, escape } from '../layout'

export interface WelcomeEmailOptions {
  /** User's first name (προαιρετικά — αν λείπει, γίνεται generic greeting) */
  firstName?: string
  /** Deep link στο dashboard για άμεσο start */
  dashboardUrl?: string
}

const DEFAULT_DASHBOARD =
  (process.env.NEXT_PUBLIC_URL || 'https://eduprompt.gr') + '/generate'

export function welcomeEmail(opts: WelcomeEmailOptions = {}): {
  subject: string
  html: string
} {
  const name = opts.firstName ? `, ${escape.text(opts.firstName)}` : ''
  const dashboardUrl = opts.dashboardUrl || DEFAULT_DASHBOARD

  const bodyHtml = `
    <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700">
      Καλώς ήρθες στο EduPrompt${name}! 👋
    </h1>

    <p style="margin:0 0 16px 0">
      Είμαστε εδώ για να σε βοηθήσουμε να δημιουργείς
      <strong>τεκμηριωμένα διδακτικά σενάρια</strong> σε λίγα δευτερόλεπτα,
      βασισμένα στο ελληνικό ΑΠΣ και σε αποδεδειγμένες παιδαγωγικές θεωρίες
      (Vygotsky, Bloom, Piaget, UDL).
    </p>

    <h2 style="margin:24px 0 12px 0;font-size:18px;font-weight:600">
      3 βήματα για να ξεκινήσεις
    </h2>

    <ol style="margin:0 0 20px 0;padding-left:20px">
      <li style="margin-bottom:8px">
        <strong>Επίλεξε τάξη &amp; μάθημα</strong> — π.χ. Δ΄ Δημοτικού, Μαθηματικά.
      </li>
      <li style="margin-bottom:8px">
        <strong>Γράψε τον στόχο</strong> — π.χ. «κλάσματα: ισοδύναμα &amp;
        σύγκριση».
      </li>
      <li style="margin-bottom:8px">
        <strong>Πάρε το σενάριο</strong> — αναλυτικό, με 4 φάσεις, δραστηριότητες
        και worksheet.
      </li>
    </ol>

    <p style="margin:0 0 16px 0">
      Το δωρεάν πλάνο σου δίνει <strong>3 σενάρια τον μήνα</strong> —
      αρκετά για να δοκιμάσεις κι αν σου αρέσει, αναβάθμισε σε Pro ή School.
    </p>

    <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px">
      Έχεις ερωτήσεις; Απάντησε σε αυτό το email και θα σου απαντήσουμε
      προσωπικά μέσα σε 24 ώρες.
    </p>
  `

  return {
    subject: 'Καλώς ήρθες στο EduPrompt — ξεκίνα τώρα',
    html: renderEmailLayout({
      title: 'Καλώς ήρθες στο EduPrompt',
      preheader: 'Ξεκίνα το πρώτο σου σενάριο σε 3 βήματα',
      bodyHtml,
      cta: {
        label: 'Δημιούργησε το πρώτο σου σενάριο',
        url: dashboardUrl,
      },
    }),
  }
}
