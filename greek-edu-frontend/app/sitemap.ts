// app/sitemap.ts
//
// Next.js δομική σύμβαση: εξάγοντας default function `sitemap()` από
// app/sitemap.ts, η Next.js φτιάχνει αυτόματα /sitemap.xml.
//
// Τι μπαίνει εδώ:
//   - ΜΟΝΟ public, indexable pages (landing, login, signup, pricing,
//     legal pages, public help/blog).
//   - ΟΧΙ user-scoped pages (/saved, /journal, /generate, /prompts/[id]) —
//     είναι protected με RLS / middleware και δεν θα ανοίξουν για bots.
//   - ΟΧΙ admin pages.
//   - Πάντα γυρνάμε absolute URLs (https://...).
//
// Αν αργότερα προσθέσουμε public scenario gallery (π.χ. featured prompts
// που έχουν `published=true`), εδώ είναι το σημείο να γίνει SELECT από
// τη Supabase με service-role client και να επιστραφεί δυναμικά.

import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/seo/site'

interface SitemapEntry {
  path: string
  /** Ένδειξη συχνότητας ενημέρωσης — οδηγός για crawlers, όχι hard rule. */
  changeFrequency:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'
  /** 0.0–1.0 σχετική προτεραιότητα μέσα στο site. */
  priority: number
}

const PUBLIC_ROUTES: SitemapEntry[] = [
  { path: '/',          changeFrequency: 'weekly',  priority: 1.0 },
  { path: '/pricing',   changeFrequency: 'monthly', priority: 0.8 },
  { path: '/login',     changeFrequency: 'yearly',  priority: 0.4 },
  { path: '/signup',    changeFrequency: 'yearly',  priority: 0.6 },
  { path: '/privacy',   changeFrequency: 'yearly',  priority: 0.3 },
  { path: '/terms',     changeFrequency: 'yearly',  priority: 0.3 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const lastModified = new Date()

  return PUBLIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))
}
