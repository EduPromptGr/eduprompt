// lib/seo/site.ts
//
// Single source of truth για το base URL του site, χρησιμοποιείται από
// τα app/sitemap.ts και app/robots.ts (και αν χρειαστεί, μελλοντικά
// canonical URLs ή OG metadata).
//
// Προτεραιότητα:
//   1. NEXT_PUBLIC_SITE_URL (production env)
//   2. NEXT_PUBLIC_VERCEL_URL (Vercel preview deployments — auto-injected)
//   3. https://eduprompt.gr (canonical fallback)
//
// Πάντα γυρνάει string ΧΩΡΙΣ trailing slash, ώστε url-join τύπου
// `${siteUrl()}${path}` να μην καταλήγει σε διπλά slashes.

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return stripTrailingSlash(ensureScheme(explicit))

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim()
  if (vercel) return stripTrailingSlash(ensureScheme(vercel))

  return 'https://eduprompt.gr'
}

function ensureScheme(u: string): string {
  if (/^https?:\/\//i.test(u)) return u
  return `https://${u}`
}

function stripTrailingSlash(u: string): string {
  return u.endsWith('/') ? u.slice(0, -1) : u
}
