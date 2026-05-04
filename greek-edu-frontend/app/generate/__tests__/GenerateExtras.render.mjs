// GenerateExtras.render.mjs
//
// Smoke test για το <GenerateExtras>:
//   - Initial render (promptCount=0, showNPS=false) → returns null
//   - Δεν κρασάρει με το esbuild bundle
//   - Όλα τα imports επιλύονται (NPSSurvey, InstallPWAPrompt, supabase client)
//
// Σημείωση: renderToStaticMarkup δεν εκτελεί useEffect, οπότε το
// Supabase fetch δεν τρέχει. Το component αρχίζει με promptCount=0
// και επιστρέφει null — αυτό είναι το σωστό server-side behavior.

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..', '..', '..', // app/generate/__tests__ → root
)
const OUT_DIR = '/tmp/navtest/out-generateextras'
mkdirSync(OUT_DIR, { recursive: true })

const stubPlugin = {
  name: 'stubs',
  setup(build) {
    // Stub @/lib/supabase/client
    build.onResolve({ filter: /supabase\/client/ }, () => ({
      path: 'supabase-client', namespace: 'stub',
    }))
    build.onLoad({ filter: /^supabase-client$/, namespace: 'stub' }, () => ({
      contents: `
        export function createClient() {
          return {
            from: () => ({
              select: () => Promise.resolve({ count: 0, error: null }),
            }),
          }
        }
      `,
      loader: 'js',
    }))

    // Stub @/components/NPSSurvey
    build.onResolve({ filter: /NPSSurvey/ }, () => ({
      path: 'nps-survey', namespace: 'stub',
    }))
    build.onLoad({ filter: /^nps-survey$/, namespace: 'stub' }, () => ({
      contents: `
        import React from 'react'
        export function NPSSurvey({ trigger, onComplete }) {
          return React.createElement('div', { 'data-testid': 'nps-survey' }, 'NPS')
        }
      `,
      loader: 'js',
    }))

    // Stub @/components/InstallPWAPrompt
    build.onResolve({ filter: /InstallPWAPrompt/ }, () => ({
      path: 'pwa-prompt', namespace: 'stub',
    }))
    build.onLoad({ filter: /^pwa-prompt$/, namespace: 'stub' }, () => ({
      contents: `
        import React from 'react'
        export function InstallPWAPrompt({ promptCount }) {
          return React.createElement('div', { 'data-testid': 'pwa-prompt' }, 'PWA')
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
  entryPoints: [path.join(ROOT, 'app/generate/GenerateExtras.tsx')],
  outfile: path.join(OUT_DIR, 'GenerateExtras.bundle.mjs'),
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
  pathToFileURL(path.join(OUT_DIR, 'GenerateExtras.bundle.mjs')).href
)
const GenerateExtras = mod.default

const checks = []
function t(name, fn) { checks.push({ name, fn }) }

// ── Initial render (promptCount=0) ─────────────────────────────
// useEffect δεν τρέχει σε renderToStaticMarkup → promptCount = 0 → null
const html = renderToStaticMarkup(React.createElement(GenerateExtras))

t('initial render returns null (empty string)', () => html === '')

t('NPS survey not shown initially', () => !html.includes('NPS'))

t('PWA prompt not shown initially', () => !html.includes('PWA'))

// ── Bundle compiled successfully (implicit: we reached here) ───
t('bundle builds without error', () => typeof GenerateExtras === 'function')

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
