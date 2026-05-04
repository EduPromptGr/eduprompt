// app/__tests__/seo.smoke.mjs
//
// Smoke tests για το sitemap.ts + robots.ts.
//
// Bundleάρουμε τα δύο modules με esbuild + stubs (ώστε τα `import 'next'`
// τύπων να μην σπάνε), τρέχουμε τις default exports, ελέγχουμε το shape.

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const OUT_DIR = '/tmp/navtest/out-seo'
mkdirSync(OUT_DIR, { recursive: true })

// ── Plugin: stub @/lib/seo/site και άφησέ το να κάνει transitive resolve ──
const stubPlugin = {
  name: 'next-stubs',
  setup(build) {
    // Τα `next` types δεν τα φορτώνουμε στο runtime (μόνο tsc τα θέλει).
    // Το esbuild αγνοεί type-only imports αυτόματα.
  },
}

async function bundle(srcPath, outName) {
  await build({
    entryPoints: [srcPath],
    outfile: path.join(OUT_DIR, outName),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    loader: { '.ts': 'ts' },
    plugins: [stubPlugin],
    alias: {
      '@/lib/seo/site': path.join(ROOT, 'lib/seo/site.ts'),
    },
    logLevel: 'silent',
  })
  return import(pathToFileURL(path.join(OUT_DIR, outName)).href)
}

const sitemapMod = await bundle(
  path.join(ROOT, 'app/sitemap.ts'),
  'sitemap.bundle.mjs',
)
const robotsMod = await bundle(
  path.join(ROOT, 'app/robots.ts'),
  'robots.bundle.mjs',
)

const checks = []
function t(name, fn) { checks.push({ name, fn }) }

// ── siteUrl logic ───────────────────────────────────────────
t('siteUrl: env override wins', async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.gr/'
  const m = await bundle(
    path.join(ROOT, 'lib/seo/site.ts'),
    'site.bundle.mjs',
  )
  const u = m.siteUrl()
  delete process.env.NEXT_PUBLIC_SITE_URL
  return u === 'https://example.gr'
})

t('siteUrl: bare host gets https:// scheme', async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'preview.eduprompt.gr'
  const m = await bundle(
    path.join(ROOT, 'lib/seo/site.ts'),
    'site2.bundle.mjs',
  )
  const u = m.siteUrl()
  delete process.env.NEXT_PUBLIC_SITE_URL
  return u === 'https://preview.eduprompt.gr'
})

t('siteUrl: fallback to canonical', async () => {
  delete process.env.NEXT_PUBLIC_SITE_URL
  delete process.env.NEXT_PUBLIC_VERCEL_URL
  const m = await bundle(
    path.join(ROOT, 'lib/seo/site.ts'),
    'site3.bundle.mjs',
  )
  const u = m.siteUrl()
  return u === 'https://eduprompt.gr'
})

// ── sitemap.ts ──────────────────────────────────────────────
const entries = sitemapMod.default()

t('sitemap: returns non-empty array', () => Array.isArray(entries) && entries.length >= 4)

t('sitemap: contains landing page with priority 1.0', () => {
  const root = entries.find((e) => e.url.endsWith('/'))
  return root !== undefined && root.priority === 1.0
})

t('sitemap: ALL entries are absolute URLs', () =>
  entries.every((e) => /^https:\/\//.test(e.url)))

t('sitemap: ALL entries have changeFrequency + priority', () =>
  entries.every(
    (e) =>
      typeof e.changeFrequency === 'string' &&
      typeof e.priority === 'number' &&
      e.priority >= 0 &&
      e.priority <= 1,
  ))

t('sitemap: contains pricing, login, signup', () => {
  const paths = entries.map((e) => new URL(e.url).pathname)
  return (
    paths.includes('/pricing') &&
    paths.includes('/login') &&
    paths.includes('/signup')
  )
})

t('sitemap: does NOT include private routes', () => {
  const paths = entries.map((e) => new URL(e.url).pathname)
  return (
    !paths.includes('/journal') &&
    !paths.includes('/saved') &&
    !paths.includes('/generate') &&
    !paths.some((p) => p.startsWith('/admin')) &&
    !paths.some((p) => p.startsWith('/api'))
  )
})

t('sitemap: lastModified is a Date', () =>
  entries.every((e) => e.lastModified instanceof Date))

// ── robots.ts ───────────────────────────────────────────────
const robotsResult = robotsMod.default()

t('robots: returns object with rules array', () =>
  typeof robotsResult === 'object' &&
  Array.isArray(robotsResult.rules) &&
  robotsResult.rules.length > 0)

t('robots: rule allows /', () => {
  const r = robotsResult.rules[0]
  return r.userAgent === '*' && (r.allow === '/' || (Array.isArray(r.allow) && r.allow.includes('/')))
})

t('robots: rule disallows /api/, /admin, /journal, /saved', () => {
  const d = robotsResult.rules[0].disallow ?? []
  const arr = Array.isArray(d) ? d : [d]
  return (
    arr.some((p) => p === '/api/') &&
    arr.some((p) => p.startsWith('/admin')) &&
    arr.some((p) => p === '/journal' || p === '/journal/') &&
    arr.some((p) => p === '/saved' || p === '/saved/') &&
    arr.some((p) => p === '/prompts/') &&
    arr.some((p) => p === '/generate')
  )
})

t('robots: includes sitemap URL', () =>
  typeof robotsResult.sitemap === 'string' &&
  robotsResult.sitemap.endsWith('/sitemap.xml') &&
  robotsResult.sitemap.startsWith('https://'))

t('robots: includes host', () =>
  typeof robotsResult.host === 'string' &&
  robotsResult.host.startsWith('https://'))

// ── Run ─────────────────────────────────────────────────────
let pass = 0, fail = 0
for (const c of checks) {
  let ok = false, err = null
  try {
    const r = c.fn()
    ok = (r instanceof Promise ? await r : r) === true
  } catch (e) { err = e }
  if (ok) {
    pass++
    console.log(`  PASS  ${c.name}`)
  } else {
    fail++
    console.log(`  FAIL  ${c.name}${err ? ' — ' + err.message : ''}`)
  }
}
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
