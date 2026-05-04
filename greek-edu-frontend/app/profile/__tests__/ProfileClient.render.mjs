// ProfileClient.render.mjs
//
// Smoke tests για το <ProfileClient>:
//   - Βασικές cards (Συνδρομή, Χρήση, Λογαριασμός, Αλλαγή κωδικού)
//   - Free plan: εμφανίζει "Αναβάθμιση" link, ΟΧΙ billing portal
//   - Pro plan + stripe: εμφανίζει "Διαχείριση συνδρομής" + "Παύση"
//   - Pro plan paused: κρύβει το "Παύση" button
//   - Paused notice: εμφανίζεται όταν pauseUntil !== null
//   - Change password form: παρόν με 2 inputs + submit button
//   - PauseModal: ΔΕΝ render-άρεται αρχικά (showPauseModal = false)
//   - Usage bars: progressbars με aria attrs
//
// Χρησιμοποιεί renderToStaticMarkup — δεν εκτελούνται handlers.

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..', '..', '..', // app/profile/__tests__ → root
)
const OUT_DIR = '/tmp/navtest/out-profileclient'
mkdirSync(OUT_DIR, { recursive: true })

const stubPlugin = {
  name: 'stubs',
  setup(build) {
    // Stub @supabase/ssr → createBrowserClient
    build.onResolve({ filter: /^@supabase\/ssr$/ }, () => ({
      path: 'supabase-ssr', namespace: 'stub',
    }))
    build.onLoad({ filter: /^supabase-ssr$/, namespace: 'stub' }, () => ({
      contents: `
        export function createBrowserClient() {
          return {
            auth: {
              updateUser: async () => ({ error: null }),
              getUser: async () => ({ data: { user: null } }),
            }
          }
        }
      `,
      loader: 'js',
    }))

    // Stub @/components/PauseSubscriptionModal
    build.onResolve({ filter: /PauseSubscriptionModal/ }, () => ({
      path: 'pause-modal', namespace: 'stub',
    }))
    build.onLoad({ filter: /^pause-modal$/, namespace: 'stub' }, () => ({
      contents: `
        import React from 'react'
        export function PauseSubscriptionModal({ onClose, onPause }) {
          return React.createElement('div', { 'data-testid': 'pause-modal' }, 'PAUSE_MODAL')
        }
      `,
      loader: 'js',
    }))
  },
}

// Resolve @/ alias
const aliasPlugin = {
  name: 'alias',
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: path.join(ROOT, args.path.slice(2)),
    }))
  },
}

await build({
  entryPoints: [path.join(ROOT, 'app/profile/ProfileClient.tsx')],
  outfile: path.join(OUT_DIR, 'ProfileClient.bundle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  jsx: 'automatic',
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  external: ['react', 'react-dom'],
  plugins: [stubPlugin, aliasPlugin],
  logLevel: 'silent',
})

const mod = await import(
  pathToFileURL(path.join(OUT_DIR, 'ProfileClient.bundle.mjs')).href
)
const ProfileClient = mod.default

const checks = []
function t(name, fn) { checks.push({ name, fn }) }

// ── Helper to create component ──────────────────────────────────
function render(overrides = {}) {
  const defaults = {
    email: 'test@eduprompt.gr',
    plan: 'free',
    planLabel: 'Δωρεάν',
    usedMonth: 1,
    limitMonth: 3,
    usedDay: 0,
    limitDay: 1,
    hasStripeCustomer: false,
    pauseUntil: null,
  }
  return renderToStaticMarkup(
    React.createElement(ProfileClient, { ...defaults, ...overrides }),
  )
}

// ── Free plan ───────────────────────────────────────────────────
const freeHtml = render()

t('free: renders 4 cards (Συνδρομή, Χρήση, Λογαριασμός, Αλλαγή)', () =>
  freeHtml.includes('Συνδρομή') &&
  freeHtml.includes('Χρήση μήνα') &&
  freeHtml.includes('Λογαριασμός') &&
  freeHtml.includes('Αλλαγή κωδικού'),
)

t('free: shows plan label Δωρεάν', () => freeHtml.includes('Δωρεάν'))

t('free: shows email', () => freeHtml.includes('test@eduprompt.gr'))

t('free: shows Αναβάθμιση link to /pricing', () =>
  /href="\/pricing"/.test(freeHtml) && freeHtml.includes('Αναβάθμιση'),
)

t('free: no billing portal button', () =>
  !freeHtml.includes('Διαχείριση συνδρομής'),
)

t('free: no pause button', () => !freeHtml.includes('Παύση συνδρομής'))

t('free: usage bars (progressbar role)', () =>
  freeHtml.match(/role="progressbar"/g)?.length === 2,
)

t('free: usage bar shows 1 / 3 month usage', () =>
  /1 \/ 3/.test(freeHtml) || freeHtml.includes('1 / 3'),
)

t('free: change password form has 2 password inputs', () => {
  const types = freeHtml.match(/type="password"/g) || []
  return types.length === 2
})

t('free: no pause modal rendered initially', () =>
  !freeHtml.includes('PAUSE_MODAL'),
)

// ── Pro plan with stripe, not paused ───────────────────────────
const proHtml = render({
  plan: 'pro',
  planLabel: 'Pro (€14,99/μήνα)',
  usedMonth: 80,
  limitMonth: 150,
  hasStripeCustomer: true,
  pauseUntil: null,
})

t('pro: shows plan label Pro', () => proHtml.includes('Pro (€14,99/μήνα)'))

t('pro: shows billing portal button', () =>
  proHtml.includes('Διαχείριση συνδρομής'),
)

t('pro: shows pause button when not paused', () =>
  proHtml.includes('Παύση συνδρομής'),
)

t('pro: no Αναβάθμιση link', () => !proHtml.includes('Αναβάθμιση →'))

t('pro: no pause modal shown initially', () =>
  !proHtml.includes('PAUSE_MODAL'),
)

// ── Pro plan paused ─────────────────────────────────────────────
const pausedHtml = render({
  plan: 'pro',
  planLabel: 'Pro — Σε παύση',
  hasStripeCustomer: true,
  pauseUntil: '1 Αυγούστου 2026',
})

t('paused: shows billing portal button', () =>
  pausedHtml.includes('Διαχείριση συνδρομής'),
)

t('paused: shows pause_until notice', () =>
  pausedHtml.includes('Σε παύση μέχρι') &&
  pausedHtml.includes('1 Αυγούστου 2026'),
)

t('paused: hides pause button when already paused', () =>
  !pausedHtml.includes('Παύση συνδρομής'),
)

// ── Run ─────────────────────────────────────────────────────────
let pass = 0, fail = 0
for (const c of checks) {
  let ok = false, err = null
  try { ok = c.fn() === true } catch (e) { err = e }
  if (ok) { pass++; console.log(`  PASS  ${c.name}`) }
  else    { fail++; console.log(`  FAIL  ${c.name}${err ? ' — ' + err.message : ''}`) }
}
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
