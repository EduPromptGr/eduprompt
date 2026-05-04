// lib/emails/layout.ts
//
// Shared HTML scaffold για όλα τα transactional emails του EduPrompt.
//
// Γιατί table-based layout:
// Email clients (Gmail, Outlook, Apple Mail) έχουν ελλιπές CSS support.
// Το flexbox / grid ΔΕΝ δουλεύει αξιόπιστα — tables + inline styles είναι
// το μόνο reliable approach. Αυτός ο κώδικας δεν θα κερδίσει ομορφιάς
// βραβεία αλλά θα render σωστά παντού.
//
// Accessibility:
// - `<html lang="el">` για screen readers και i18n tools
// - Semantic heading order (H1 -> H2)
// - Alt text σε όλες τις εικόνες
// - role="article" στο main content
//
// Inline CSS: τα email clients strip-άρουν <style> blocks συχνά, οπότε
// style attributes είναι ο ασφαλέστερος δρόμος. Έχουμε και ένα minimal
// <style> για dark-mode overrides σε όσους clients το υποστηρίζουν.

export interface EmailLayoutOptions {
  /** Email title — προβάλλεται στο <title> + preheader */
  title: string
  /** Προ-κειμενικός που φαίνεται πριν ανοίξει το email (inbox preview) */
  preheader?: string
  /** Το main body content ως trusted HTML string */
  bodyHtml: string
  /** CTA button (προαιρετικά) — θα εμφανιστεί prominent μετά το bodyHtml */
  cta?: {
    label: string
    url: string
  }
  /** Custom footer text (για π.χ. unsubscribe link, GDPR notices) */
  footerHtml?: string
}

const PUBLIC_URL =
  process.env.NEXT_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://eduprompt.gr'

const BRAND = {
  name: 'EduPrompt',
  primary: '#16a34a', // green-600
  primaryDark: '#15803d', // green-700
  text: '#111827', // gray-900
  textMuted: '#6b7280', // gray-500
  bg: '#f9fafb', // gray-50
  cardBg: '#ffffff',
  border: '#e5e7eb', // gray-200
}

/**
 * Render a complete HTML email page using the shared layout.
 * Returns a ready-to-send string.
 */
export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const preheader = opts.preheader ?? ''
  const ctaBlock = opts.cta
    ? `
        <tr>
          <td align="center" style="padding:24px 0 8px 0">
            <a href="${escapeAttr(opts.cta.url)}"
               style="background:${BRAND.primary};color:#ffffff;padding:14px 32px;
                      border-radius:8px;text-decoration:none;font-weight:600;
                      font-size:16px;display:inline-block;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
              ${escapeText(opts.cta.label)}
            </a>
          </td>
        </tr>`
    : ''

  const footerBlock =
    opts.footerHtml ??
    `
      Έλαβες αυτό το email επειδή έχεις λογαριασμό στο ${BRAND.name}.
      <br />
      <a href="${PUBLIC_URL}/settings" style="color:${BRAND.textMuted}">
        Διαχείριση ειδοποιήσεων
      </a>
      · <a href="${PUBLIC_URL}" style="color:${BRAND.textMuted}">${BRAND.name}</a>
    `

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeText(opts.title)}</title>
  <style>
    /* Dark-mode tweaks για clients που το υποστηρίζουν */
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #111827 !important; }
      .email-card { background-color: #1f2937 !important; }
      .email-text { color: #f9fafb !important; }
      .email-muted { color: #9ca3af !important; }
    }
    /* Mobile tweaks */
    @media only screen and (max-width: 480px) {
      .email-card { padding: 20px !important; }
      .email-container { width: 100% !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background:${BRAND.bg};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    color:${BRAND.text};line-height:1.6">
  <!-- Preheader: πρώτες λέξεις στο inbox preview, hidden στο render -->
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;
       max-height:0;max-width:0">
    ${escapeText(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:${BRAND.bg}">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" class="email-container" width="560"
               cellpadding="0" cellspacing="0"
               style="max-width:560px;width:100%">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 20px 0">
              <a href="${PUBLIC_URL}" style="text-decoration:none">
                <span style="font-size:22px;font-weight:700;color:${BRAND.primary};
                        font-family:inherit">
                  ${BRAND.name}
                </span>
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="email-card"
                style="background:${BRAND.cardBg};border:1px solid ${BRAND.border};
                       border-radius:12px;padding:32px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td role="article" class="email-text"
                      style="color:${BRAND.text};font-size:16px">
                    ${opts.bodyHtml}
                  </td>
                </tr>
                ${ctaBlock}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-muted"
                style="padding:24px 8px 0 8px;color:${BRAND.textMuted};
                       font-size:13px;text-align:center">
              ${footerBlock}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── HTML escape helpers ────────────────────────────────────────
// Μικρά helpers για όταν περνάμε user input σε templates (π.χ. email address
// σε school invite). ΠΟΤΕ μην αφήσεις untrusted input να pass-through στο HTML.

function escapeText(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeText(s)
}

/** Exported για χρήση σε templates όταν συμπεριλαμβάνουν user content */
export const escape = {
  text: escapeText,
  attr: escapeAttr,
}
