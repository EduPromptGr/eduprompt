// lib/emails/templates/schoolInvite.ts
//
// Εξήχθη από το inline template στο app/api/school/invite/route.ts ώστε
// να επαναχρησιμοποιείται σε resend-invite flow και σε μελλοντικό bulk import.

import { renderEmailLayout, escape } from '../layout'

export interface SchoolInviteEmailOptions {
  /** Email του school owner που κάνει την πρόσκληση */
  inviterEmail: string
  /** Όνομα σχολείου (προαιρετικά — αν λείπει, γίνεται generic) */
  schoolName?: string
  /** Το signed token για το /join-school route */
  inviteLink: string
  /** Μέρες εγκυρότητας (default 7) */
  expiresInDays?: number
}

export function schoolInviteEmail(opts: SchoolInviteEmailOptions): {
  subject: string
  html: string
} {
  const inviter = escape.text(opts.inviterEmail)
  const schoolLabel = opts.schoolName
    ? `στο σχολείο <strong>${escape.text(opts.schoolName)}</strong>`
    : 'στο σχολικό πλάνο'
  const days = opts.expiresInDays ?? 7

  const bodyHtml = `
    <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700">
      Προσκλήθηκες στο EduPrompt 🎓
    </h1>

    <p style="margin:0 0 16px 0">
      Ο/Η <strong>${inviter}</strong> σε προσκαλεί να γίνεις μέλος ${schoolLabel}
      και να χρησιμοποιείς το EduPrompt για να δημιουργείς AI διδακτικά σενάρια
      βασισμένα στο ελληνικό ΑΠΣ.
    </p>

    <p style="margin:0 0 16px 0">
      Ως μέλος του School πλάνου έχεις:
    </p>

    <ul style="margin:0 0 20px 0;padding-left:20px">
      <li style="margin-bottom:6px">Πρόσβαση σε όλες τις Pro λειτουργίες</li>
      <li style="margin-bottom:6px">Shared pool 400 σεναρίων/μήνα για όλο το σχολείο</li>
      <li style="margin-bottom:6px">Συνεργατικά templates με συναδέλφους</li>
    </ul>

    <p style="margin:0;color:#6b7280;font-size:14px">
      Ο σύνδεσμος ισχύει για ${days} ημέρες.
    </p>
  `

  return {
    subject: `Πρόσκληση στο EduPrompt — ${opts.inviterEmail}`,
    html: renderEmailLayout({
      title: 'Πρόσκληση στο EduPrompt',
      preheader: `Ο/Η ${opts.inviterEmail} σε προσκαλεί στο EduPrompt`,
      bodyHtml,
      cta: {
        label: 'Αποδοχή Πρόσκλησης',
        url: opts.inviteLink,
      },
    }),
  }
}
