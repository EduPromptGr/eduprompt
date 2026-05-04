// Header.render.mjs
//
// Smoke tests για το <Header> component:
//   - logged-out state δείχνει Σύνδεση/Εγγραφή, ΟΧΙ nav links
//   - logged-in non-admin: nav με 3 items, ΟΧΙ admin link
//   - logged-in admin: nav με 4 items, ΣΥΜΠΕΡΙΛΑΜΒΑΝΟΜΕΝΟΥ admin link
//   - active state: pathname /journal/abc → "Ημερολόγιο" έχει aria-current=page
//   - mobile menu panel ΔΕΝ εμφανίζεται όταν menuOpen=false (default)
//   - sign-out button υπάρχει σε logged-in user

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const OUT_DIR = '/tmp/navtest/out'
mkdirSync(OUT_DIR, { recursive: true })

// ── Stub plugin για next/link, next/navigation ────────────────
const stubPlugin = {
  name: 'next-stubs',
  setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({
      path: 'next-link', namespace: 'stub',
    }))
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({
      path: 'next-navigation', namespace: 'stub',
    }))
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      if (args.path === 'next-link') {
        return {
          contents: `
            import React from 'react'
            export default function Link({href, children, ...rest}) {
              return React.createElement('a', { href, ...rest }, children)
            }
          `,
          loader: 'js',
        }
      }
      if (args.path === 'next-navigation') {
        return {
          contents: `
            export function usePathname() {
              return globalThis.__pathname || '/'
            }
            export function useRouter() {
              return {
                push: () => {}, replace: () => {}, back: () => {},
                forward: () => {}, refresh: () => {}, prefetch: () => {},
              }
            }
          `,
          loader: 'js',
        }
      }
    })
  },
}

await build({
  entryPoints: [path.join(ROOT, 'components/Header.tsx')],
  outfile: path.join(OUT_DIR, 'Header.bundle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  jsx: 'automatic',
  loader: { '.tsx': 'tsx' },
  external: ['react', 'react-dom'],
  plugins: [stubPlugin],
  logLevel: 'silent',
})

const mod = await import(
  pathToFileURL(path.join(OUT_DIR, 'Header.bundle.mjs')).href
)
const Header = mod.default

const checks = []
function t(name, fn) { checks.push({ name, fn }) }

// ── Logged-out ──────────────────────────────────────────────
t('logged-out: shows login/signup CTAs', () => {
  globalThis.__pathname = '/'
  const h = renderToStaticMarkup(React.createElement(Header, { user: null }))
  return (
    h.includes('Σύνδεση') &&
    h.includes('Εγγραφή') &&
    h.includes('href="/login"') &&
    h.includes('href="/signup"')
  )
})

t('logged-out: does NOT render nav links', () => {
  globalThis.__pathname = '/'
  const h = renderToStaticMarkup(React.createElement(Header, { user: null }))
  return (
    !h.includes('href="/saved"') &&
    !h.includes('href="/journal"') &&
    !h.includes('href="/admin')
  )
})

t('logged-out: does NOT render signout button', () => {
  const h = renderToStaticMarkup(React.createElement(Header, { user: null }))
  return !h.includes('Αποσύνδεση')
})

// ── Logged-in non-admin ─────────────────────────────────────
const baseUser = { email: 'teach@school.gr', isAdmin: false }

t('non-admin: shows generate/saved/journal links', () => {
  globalThis.__pathname = '/generate'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  return (
    h.includes('href="/generate"') &&
    h.includes('href="/saved"') &&
    h.includes('href="/journal"') &&
    h.includes('Δημιουργία') &&
    h.includes('Αποθηκευμένα') &&
    h.includes('Ημερολόγιο')
  )
})

t('non-admin: does NOT show admin link', () => {
  globalThis.__pathname = '/generate'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  return (
    !h.includes('href="/admin/error-reports"') &&
    !h.includes('Αναφορές σφαλμάτων')
  )
})

t('non-admin: shows email + signout button', () => {
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  return h.includes('teach@school.gr') && h.includes('Αποσύνδεση')
})

// ── Active state ────────────────────────────────────────────
t('active state: /journal → Ημερολόγιο has aria-current=page', () => {
  globalThis.__pathname = '/journal'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  // Βρες το <a> για /journal και επιβεβαίωσε ότι έχει aria-current
  const m = h.match(/<a[^>]*href="\/journal"[^>]*>[^<]*Ημερολόγιο/)
  return m !== null && m[0].includes('aria-current="page"')
})

t('active state: /journal/abc-123 → Ημερολόγιο still active (nested)', () => {
  globalThis.__pathname = '/journal/abc-123'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  const m = h.match(/<a[^>]*href="\/journal"[^>]*>[^<]*Ημερολόγιο/)
  return m !== null && m[0].includes('aria-current="page"')
})

t('active state: /generate → Αποθηκευμένα NOT active', () => {
  globalThis.__pathname = '/generate'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  const m = h.match(/<a[^>]*href="\/saved"[^>]*>[^<]*Αποθηκευμένα/)
  return m !== null && !m[0].includes('aria-current')
})

// ── Admin ───────────────────────────────────────────────────
const adminUser = { email: 'admin@eduprompt.gr', isAdmin: true }

t('admin: shows admin link in nav', () => {
  globalThis.__pathname = '/'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: adminUser }),
  )
  return (
    h.includes('href="/admin/error-reports"') &&
    h.includes('Αναφορές σφαλμάτων')
  )
})

t('admin: /admin/error-reports → admin link active', () => {
  globalThis.__pathname = '/admin/error-reports'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: adminUser }),
  )
  const m = h.match(
    /<a[^>]*href="\/admin\/error-reports"[^>]*>[^<]*Αναφορές σφαλμάτων/,
  )
  return m !== null && m[0].includes('aria-current="page"')
})

// ── A11y / structure ────────────────────────────────────────
t('renders <header> + nav with aria-label', () => {
  globalThis.__pathname = '/generate'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  return (
    h.startsWith('<header') &&
    h.includes('aria-label="Κύρια πλοήγηση"')
  )
})

t('hamburger button has aria-expanded=false by default', () => {
  globalThis.__pathname = '/generate'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  return (
    h.includes('aria-expanded="false"') &&
    h.includes('aria-controls="mobile-menu-panel"')
  )
})

t('mobile menu panel NOT rendered when menuOpen=false (default)', () => {
  globalThis.__pathname = '/generate'
  const h = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  return !h.includes('id="mobile-menu-panel"')
})

t('logo always renders', () => {
  globalThis.__pathname = '/'
  const h1 = renderToStaticMarkup(React.createElement(Header, { user: null }))
  const h2 = renderToStaticMarkup(
    React.createElement(Header, { user: baseUser }),
  )
  return h1.includes('EduPrompt') && h2.includes('EduPrompt')
})

// ── Run ─────────────────────────────────────────────────────
let pass = 0, fail = 0
for (const c of checks) {
  let ok = false, err = null
  try { ok = c.fn() === true } catch (e) { err = e }
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
