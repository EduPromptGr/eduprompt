// lib/emails/send.ts
//
// Thin Resend wrapper που κεντρικοποιεί:
// - API key init (lazy, μία φορά)
// - From address με env override
// - Graceful degradation όταν RESEND_API_KEY λείπει (development)
// - Structured logging (success / failure / no-op)
//
// Χρήση:
//   import { sendEmail } from '@/lib/emails/send'
//   import { welcomeEmail } from '@/lib/emails/templates/welcome'
//
//   await sendEmail({
//     to: user.email,
//     ...welcomeEmail({ firstName: user.name }),
//   })
//
// Επιστρέφει { ok: boolean, id?: string, error?: string } ώστε ο caller
// να μπορεί να αποφασίσει τι κάνει με failures — ΠΟΤΕ δεν ρίχνουμε
// exception από εδώ (ένα email failure δεν πρέπει να μπλοκάρει signup
// flow ή Stripe webhook).

import { Resend } from 'resend'

/** Public result type — σε developer-friendly format */
export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
  /** True όταν το email skipped επειδή δεν ήταν configured το API */
  skipped?: boolean
}

/** Input για sendEmail — αντιστοιχεί σε Resend API + defaults */
export interface SendEmailInput {
  to: string | string[]
  subject: string
  html: string
  /** Plain-text fallback — αν παραλειφθεί, θα γίνει auto-derive από html */
  text?: string
  /** Override from address (rarely needed) */
  from?: string
  /** Reply-To */
  replyTo?: string
  /** Tags για analytics στο Resend dashboard */
  tags?: { name: string; value: string }[]
}

// ── Lazy-initialised singleton ─────────────────────────────────
// Δεν instantiate-ουμε στο import time — αν λείπει το env σε dev,
// θέλουμε γρήγορο startup και graceful no-op αντί για crash.

let _client: Resend | null = null
let _initAttempted = false

function getClient(): Resend | null {
  if (_initAttempted) return _client
  _initAttempted = true

  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn(
      '[emails] RESEND_API_KEY not configured — emails will be logged but not sent',
    )
    return null
  }
  _client = new Resend(key)
  return _client
}

function getDefaultFrom(): string {
  return (
    process.env.ALERT_FROM_EMAIL ||
    process.env.NEXT_PUBLIC_FROM_EMAIL ||
    'EduPrompt <hello@eduprompt.gr>'
  )
}

/**
 * Παράγει plain-text από HTML. Όχι τέλειο αλλά αρκετό για email clients που
 * θέλουν fallback — τουλάχιστον έχει διαβάσιμο περιεχόμενο αντί για bare
 * markup.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Στείλε email μέσω Resend. Never throws — πάντα επιστρέφει SendEmailResult.
 *
 * Σε dev/test χωρίς RESEND_API_KEY: logs "skipped" και επιστρέφει ok:true,
 * skipped:true ώστε το flow να μην σπάει.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const toArr = Array.isArray(input.to) ? input.to : [input.to]

  // Validate addresses γρήγορα πριν πάμε στο Resend
  for (const addr of toArr) {
    if (!addr || typeof addr !== 'string' || !addr.includes('@')) {
      const err = `Invalid recipient: ${JSON.stringify(addr)}`
      console.error('[emails]', err)
      return { ok: false, error: err }
    }
  }

  const client = getClient()
  if (!client) {
    console.info(
      `[emails] skipped (no API key): to=${toArr.join(',')} subject="${input.subject}"`,
    )
    return { ok: true, skipped: true }
  }

  try {
    const res = await client.emails.send({
      from: input.from || getDefaultFrom(),
      to: toArr,
      subject: input.subject,
      html: input.html,
      text: input.text || htmlToText(input.html),
      replyTo: input.replyTo,
      tags: input.tags,
    })

    if (res.error) {
      console.error(
        `[emails] send failed to=${toArr.join(',')} subject="${input.subject}":`,
        res.error,
      )
      return { ok: false, error: res.error.message || String(res.error) }
    }

    console.info(
      `[emails] sent id=${res.data?.id} to=${toArr.join(',')} subject="${input.subject}"`,
    )
    return { ok: true, id: res.data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[emails] send exception to=${toArr.join(',')} subject="${input.subject}":`,
      err,
    )
    return { ok: false, error: msg }
  }
}

/** Exported για testing — επιτρέπει manual client reset */
export function _resetEmailClientForTesting(): void {
  _client = null
  _initAttempted = false
}
