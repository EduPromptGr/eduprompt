// app/robots.ts
//
// Next.js convention: default export μιας function που επιστρέφει
// MetadataRoute.Robots → η Next.js φτιάχνει αυτόματα /robots.txt.
//
// Πολιτική:
//   • Allow:    όλες οι public marketing pages (root, pricing, legal,
//               login, signup, blog/help — αν προστεθούν αργότερα).
//   • Disallow: όλα τα authenticated/user-scoped paths. Ακόμα κι αν το
//               Supabase RLS τα προστατεύει, δεν θέλουμε να φαίνονται
//               σε crawlers (ωφελεί τόσο privacy όσο και SEO — αποφεύγουμε
//               soft-404 / "auth wall" pages στο index της Google).
//   • Disallow ολόκληρο το /api γιατί:
//       - δεν υπάρχει λόγος να crawl-άρει η Google JSON endpoints
//       - τα /api/auth/* μπορεί να κάνουν side-effects (signout, etc.)
//
// Sitemap: link προς /sitemap.xml ώστε ο Googlebot να το ανακαλύψει
// ακόμα κι αν δεν είναι submitted στο Search Console.

import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/seo/site'

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/admin',
          '/generate',
          '/journal',
          '/journal/',
          '/saved',
          '/saved/',
          '/prompts/',
          '/profile',
          '/settings',
          '/school/',
          '/referral',
          '/paused',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
