// lib/emails/templates/invoicePaid.ts
//
// Stripe στέλνει αυτόματα το επίσημο tax-compliant receipt. Εμείς στέλνουμε
// ένα branded "thank-you" email με το EduPrompt context (π.χ. "τα 150 σενάρια
// του Pro πλάνου είναι ενεργά") + quick link στο billing portal.

import { renderEmailLayout } from '../layout'

export interface InvoicePaidEmailOptions {
  /** Τελικό ποσό σε EUR (π.χ. 14.99) */
  amount: number
  /** Όνομα πλάνου — π.χ. 'pro' | 'school' */
  plan: 'pro' | 'school' | string
  /** ISO date της χρέωσης */
  paidAt?: string | Date
  /** Stripe hosted invoice URL (προαιρετικά) */
  invoiceUrl?: string
  /** Πόσα σενάρια/μήνα έχει ενεργά αυτό το πλάνο */
  monthlyQuota?: number
}

const PLAN_NAMES: Record<string, string> = {
  pro: 'Pro',
  school: 'School',
}

const DEFAULT_QUOTA: Record<string, number> = {
  pro: 150,
  school: 400,
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('el-GR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  })
}

function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('el-GR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function invoicePaidEmail(opts: InvoicePaidEmailOptions): {
  subject: string
  html: string
} {
  const planLabel = PLAN_NAMES[opts.plan] || opts.plan
  const quota = opts.monthlyQuota ?? DEFAULT_QUOTA[opts.plan] ?? 0
  const paidAtText = opts.paidAt ? formatDate(opts.paidAt) : formatDate(new Date())
  const amountText = formatAmount(opts.amount)

  const quotaLine =
    quota > 0
      ? `<li style="margin-bottom:8px">
           <strong>${quota} σενάρια/μήνα</strong> ενεργά στο πλάνο σου
         </li>`
      : ''

  const bodyHtml = `
    <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700">
      Ευχαριστούμε για την πληρωμή σου! ✅
    </h1>

    <p style="margin:0 0 16px 0">
      Η συνδρομή σου στο πλάνο <strong>${planLabel}</strong> ανανεώθηκε.
      Μπορείς να συνεχίσεις απρόσκοπτα τη δουλειά σου.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f9fafb;border-radius:8px;margin:20px 0">
      <tr>
        <td style="padding:16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#6b7280;font-size:14px;padding:4px 0">Πλάνο</td>
              <td style="color:#111827;font-weight:600;text-align:right;padding:4px 0">
                ${planLabel}
              </td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:14px;padding:4px 0">Ποσό</td>
              <td style="color:#111827;font-weight:600;text-align:right;padding:4px 0">
                ${amountText}
              </td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:14px;padding:4px 0">Ημερομηνία</td>
              <td style="color:#111827;font-weight:600;text-align:right;padding:4px 0">
                ${paidAtText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <h2 style="margin:24px 0 12px 0;font-size:18px;font-weight:600">
      Τι συμπεριλαμβάνεται
    </h2>

    <ul style="margin:0 0 20px 0;padding-left:20px">
      ${quotaLine}
      <li style="margin-bottom:8px">
        Πρόσβαση σε όλες τις παιδαγωγικές θεωρίες &amp; στρατηγικές
      </li>
      <li style="margin-bottom:8px">
        Data-driven suggestions βάσει ιστορικής απόδοσης
      </li>
      <li style="margin-bottom:8px">
        Αποθήκευση &amp; αναστοχασμοί (journal)
      </li>
    </ul>

    <p style="margin:16px 0 0 0;color:#6b7280;font-size:14px">
      Το επίσημο τιμολόγιο/απόδειξη έχει σταλεί ξεχωριστά από το Stripe
      ${opts.invoiceUrl ? `(<a href="${opts.invoiceUrl}">προβολή</a>)` : ''}.
    </p>
  `

  const footerHtml = `
    Διαχείριση συνδρομής:
    <a href="${process.env.NEXT_PUBLIC_URL || 'https://eduprompt.gr'}/billing"
       style="color:#6b7280">billing portal</a>
    · Ακύρωση οποτεδήποτε με 1 κλικ
  `

  return {
    subject: `Επιβεβαίωση πληρωμής — πλάνο ${planLabel} (${amountText})`,
    html: renderEmailLayout({
      title: 'Επιβεβαίωση πληρωμής',
      preheader: `Η συνδρομή ${planLabel} σου ανανεώθηκε — ${amountText}`,
      bodyHtml,
      footerHtml,
    }),
  }
}
