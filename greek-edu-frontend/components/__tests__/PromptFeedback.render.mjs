// Compile the TSX and server-render each component, then grep the HTML
// for key a11y attributes and copy. This is a "does it render + emit
// correct roles" smoke test — no click interactions.

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync } from 'node:fs'

await build({
  entryPoints: ['/tmp/uicheck/src/components/PromptFeedback.tsx'],
  outfile: '/tmp/uicheck/PromptFeedback.bundle.mjs',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  jsx: 'automatic',
  loader: { '.tsx': 'tsx' },
  external: ['react', 'react-dom'],
  logLevel: 'silent',
})

const mod = await import(pathToFileURL('/tmp/uicheck/PromptFeedback.bundle.mjs').href)

const checks = []
function t(name, fn) { checks.push({name, fn}) }

t('RatingStars renders with role=radiogroup', () => {
  const h = renderToStaticMarkup(
    React.createElement(mod.RatingStars, { promptId: 'aaaa', initialRating: 3 }),
  )
  return h.includes('role="radiogroup"') &&
         h.includes('aria-label="Αξιολόγηση σεναρίου"') &&
         (h.match(/role="radio"/g) || []).length === 5 &&
         h.includes('aria-checked="true"')
})

t('RatingStars: 3 stars filled when initialRating=3', () => {
  const h = renderToStaticMarkup(
    React.createElement(mod.RatingStars, { promptId: 'aaaa', initialRating: 3 }),
  )
  // Fill attribute appears per filled star
  const filledCount = (h.match(/fill="#f59e0b"/g) || []).length
  return filledCount === 3
})

t('SaveButton renders aria-pressed=false when not saved', () => {
  const h = renderToStaticMarkup(
    React.createElement(mod.SaveButton, { promptId: 'aaaa', initialSaved: false }),
  )
  return h.includes('aria-pressed="false"') &&
         h.includes('Αποθήκευση') &&
         !h.includes('Αποθηκεύτηκε')
})

t('SaveButton renders aria-pressed=true when saved', () => {
  const h = renderToStaticMarkup(
    React.createElement(mod.SaveButton, { promptId: 'aaaa', initialSaved: true }),
  )
  return h.includes('aria-pressed="true"') &&
         h.includes('Αποθηκεύτηκε')
})

t('ReportErrorDialog renders trigger button, not dialog', () => {
  const h = renderToStaticMarkup(
    React.createElement(mod.ReportErrorDialog, { promptId: 'aaaa' }),
  )
  return h.includes('aria-haspopup="dialog"') &&
         h.includes('Αναφορά') &&
         !h.includes('role="dialog"')  // dialog only opens on click
})

t('ReportErrorDialog: all 6 categories defined', () => {
  const src = readFileSync('/tmp/uicheck/PromptFeedback.bundle.mjs', 'utf8')
  const cats = ['pedagogical_error','curriculum_mismatch','inappropriate_content','factual_error','language_quality','other']
  return cats.every(c => src.includes(c))
})

let pass = 0, fail = 0
for (const c of checks) {
  try {
    const ok = c.fn()
    console.log(ok ? 'PASS' : 'FAIL', c.name)
    if (ok) pass++; else fail++
  } catch (e) {
    console.log('FAIL', c.name, '—', e.message)
    fail++
  }
}
console.log(`\n${pass}/${checks.length} passed`)
process.exit(fail > 0 ? 1 : 0)
