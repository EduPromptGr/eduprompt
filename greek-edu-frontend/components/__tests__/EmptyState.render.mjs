// EmptyState.render.mjs
//
// Smoke tests για το shared <EmptyState> component:
//   - default variant με όλα τα optional fields
//   - default variant χωρίς CTA / hints (graceful degradation)
//   - filtered variant (χωρίς icon, χωρίς hints)
//   - icon variants (όλα τα supported names)
//   - a11y: <h2> για title, hints σε <ul><li>, icon aria-hidden

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const OUT_DIR = '/tmp/navtest/out-empty'
mkdirSync(OUT_DIR, { recursive: true })

const stubPlugin = {
  name: 'next-stubs',
  setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({
      path: 'next-link', namespace: 'stub',
    }))
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        import React from 'react'
        export default function Link({href, children, ...rest}) {
          return React.createElement('a', { href, ...rest }, children)
        }
      `,
      loader: 'js',
    }))
  },
}

await build({
  entryPoints: [path.join(ROOT, 'components/EmptyState.tsx')],
  outfile: path.join(OUT_DIR, 'EmptyState.bundle.mjs'),
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
  pathToFileURL(path.join(OUT_DIR, 'EmptyState.bundle.mjs')).href
)
const { EmptyState } = mod

const checks = []
function t(name, fn) { checks.push({ name, fn }) }

// ── Default variant — full ──────────────────────────────────
t('default variant: renders title in <h2>', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      icon: 'bookmark',
      title: 'Δεν έχεις τίποτα ακόμη',
      description: 'Πάτα το κουμπί για να ξεκινήσεις.',
      primaryCta: { label: 'Ξεκίνα', href: '/start' },
    }),
  )
  return h.includes('<h2') && h.includes('Δεν έχεις τίποτα ακόμη')
})

t('default variant: renders primary CTA as link', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      icon: 'bookmark',
      title: 'X',
      description: 'Y',
      primaryCta: { label: 'Ξεκίνα', href: '/start' },
    }),
  )
  return h.includes('href="/start"') && h.includes('Ξεκίνα')
})

t('default variant: renders secondary CTA as link', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      icon: 'journal',
      title: 'X',
      description: 'Y',
      primaryCta: { label: 'P', href: '/p' },
      secondaryCta: { label: 'Άλλο', href: '/other' },
    }),
  )
  return h.includes('href="/other"') && h.includes('Άλλο')
})

t('default variant: renders hints as <ul><li>', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      icon: 'journal',
      title: 'X',
      description: 'Y',
      hints: ['Hint Α', 'Hint Β', 'Hint Γ'],
    }),
  )
  return (
    h.includes('<ul') &&
    (h.match(/<li/g) || []).length === 3 &&
    h.includes('Hint Α') &&
    h.includes('Hint Β') &&
    h.includes('Hint Γ')
  )
})

t('default variant: renders without primaryCta gracefully', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      title: 'X',
      description: 'Y',
    }),
  )
  return h.includes('<h2') && !h.includes('href=')
})

t('default variant: icon SVG is aria-hidden', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      icon: 'bookmark',
      title: 'X',
      description: 'Y',
    }),
  )
  return h.includes('aria-hidden') && h.includes('<svg')
})

// ── Filtered variant ────────────────────────────────────────
t('filtered variant: smaller, no icon, no hints', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      variant: 'filtered',
      icon: 'bookmark', // should be ignored
      title: 'Καμία αντιστοιχία',
      description: 'Δοκίμασε άλλα φίλτρα.',
      primaryCta: { label: 'Καθαρισμός', href: '/x' },
      hints: ['ignored'], // should be ignored
    }),
  )
  return (
    h.includes('Καμία αντιστοιχία') &&
    !h.includes('<svg') &&
    !h.includes('ignored') &&
    h.includes('href="/x"') &&
    h.includes('Καθαρισμός')
  )
})

t('filtered variant: title still in <h2>', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      variant: 'filtered',
      title: 'Filtered title',
      description: 'D',
    }),
  )
  return h.includes('<h2') && h.includes('Filtered title')
})

// ── Icon variants ───────────────────────────────────────────
const ICON_NAMES = ['bookmark', 'journal', 'search', 'generate']
for (const name of ICON_NAMES) {
  t(`icon "${name}" renders an SVG`, () => {
    const h = renderToStaticMarkup(
      React.createElement(EmptyState, {
        icon: name,
        title: 'X',
        description: 'Y',
      }),
    )
    return h.includes('<svg')
  })
}

// ── Edge cases ──────────────────────────────────────────────
t('hints empty array: <ul> NOT rendered', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      title: 'X',
      description: 'Y',
      hints: [],
    }),
  )
  return !h.includes('<ul')
})

t('no CTAs at all: action row NOT rendered', () => {
  const h = renderToStaticMarkup(
    React.createElement(EmptyState, {
      title: 'X',
      description: 'Y',
    }),
  )
  // Δεν θα έπρεπε να έχει κανένα <a> link χωρίς CTA
  return !h.includes('<a ')
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
