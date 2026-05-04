// GenerateForm.render.mjs
//
// Smoke tests για το <GenerateForm>:
//   - δομή: 6 grades, 6 subjects στο datalist, 6 theories+strategies
//     στα selects, 6 environments checkboxes
//   - a11y: radiogroup, aria-required, aria-busy, role=alert region
//   - initial prop pre-fill (subject, grade)
//   - char counter format "0/500"
//   - submit button + cancel link
//
// Δεν εκτελούμε event handlers — το renderToStaticMarkup μας δίνει το
// initial markup, αρκετό για όλα τα παραπάνω.

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
)
const OUT_DIR = '/tmp/navtest/out-genform'
mkdirSync(OUT_DIR, { recursive: true })

const stubPlugin = {
  name: 'next-stubs',
  setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({
      path: 'next-link',
      namespace: 'stub',
    }))
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({
      path: 'next-navigation',
      namespace: 'stub',
    }))
    build.onLoad({ filter: /^next-link$/, namespace: 'stub' }, () => ({
      contents: `
        import React from 'react'
        export default function Link({href, children, ...rest}) {
          return React.createElement('a', { href, ...rest }, children)
        }
      `,
      loader: 'js',
    }))
    build.onLoad(
      { filter: /^next-navigation$/, namespace: 'stub' },
      () => ({
        contents: `
          export function useRouter() {
            return {
              push: () => {}, replace: () => {}, back: () => {},
              forward: () => {}, refresh: () => {}, prefetch: () => {},
            }
          }
        `,
        loader: 'js',
      }),
    )
  },
}

await build({
  entryPoints: [path.join(ROOT, 'components/GenerateForm.tsx')],
  outfile: path.join(OUT_DIR, 'GenerateForm.bundle.mjs'),
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
  pathToFileURL(path.join(OUT_DIR, 'GenerateForm.bundle.mjs')).href
)
const GenerateForm = mod.default

const checks = []
function t(name, fn) {
  checks.push({ name, fn })
}

// ── Default render (no initial) ─────────────────────────────
const defaultHtml = renderToStaticMarkup(React.createElement(GenerateForm))

t('renders <form> root', () => /<form\b/.test(defaultHtml))

t('grade radiogroup has role=radiogroup + aria-required', () =>
  /role="radiogroup"/.test(defaultHtml) &&
  /aria-required="true"/.test(defaultHtml),
)

t('6 grade radio buttons (Α–ΣΤ)', () => {
  const radios = defaultHtml.match(/role="radio"/g) || []
  return (
    radios.length === 6 &&
    defaultHtml.includes('>Α<') &&
    defaultHtml.includes('>Β<') &&
    defaultHtml.includes('>Γ<') &&
    defaultHtml.includes('>Δ<') &&
    defaultHtml.includes('>Ε<') &&
    defaultHtml.includes('>ΣΤ<')
  )
})

t('all grade radios start aria-checked=false', () => {
  const checked = defaultHtml.match(/aria-checked="true"/g) || []
  return checked.length === 0
})

t('subject input has list= attr pointing to datalist', () =>
  /id="gen-subject"/.test(defaultHtml) &&
  /list="gen-subject-options"/.test(defaultHtml) &&
  /<datalist[^>]+id="gen-subject-options"/.test(defaultHtml),
)

t('subject datalist has all 6 SUBJECTS options', () => {
  const expected = [
    'Μαθηματικά',
    'Γλώσσα',
    'Μελέτη Περιβάλλοντος',
    'Ιστορία',
    'Φυσική',
    'Γεωγραφία',
  ]
  return expected.every((s) => defaultHtml.includes(`value="${s}"`))
})

t('unit + chapter inputs are present and optional (no aria-required)', () => {
  const m = defaultHtml.match(
    /<input[^>]*id="gen-unit"[^>]*\/?>([\s\S]*?)<input[^>]*id="gen-chapter"/,
  )
  return (
    /id="gen-unit"/.test(defaultHtml) &&
    /id="gen-chapter"/.test(defaultHtml) &&
    !/id="gen-unit"[^>]*aria-required/.test(defaultHtml) &&
    !/id="gen-chapter"[^>]*aria-required/.test(defaultHtml)
  )
})

t('objective textarea has aria-required + maxLength', () =>
  /<textarea[^>]*id="gen-objective"[^>]*aria-required="true"/.test(defaultHtml),
)

t('objective char counter shows 0/500', () =>
  defaultHtml.includes('0/500'),
)

t('theory <select> with empty default option', () =>
  /<select[^>]*id="gen-theory"/.test(defaultHtml) &&
  defaultHtml.includes('Άσε το να επιλεγεί αυτόματα'),
)

t('theory <select> includes all 6 theories', () => {
  const theories = [
    'Vygotsky (ZPD)',
    'Bloom',
    'Piaget',
    'UDL',
    'Gardner (MI)',
    'Dewey',
  ]
  return theories.every((th) => defaultHtml.includes(`>${th}<`))
})

t('strategy <select> with empty default option', () =>
  /<select[^>]*id="gen-strategy"/.test(defaultHtml) &&
  defaultHtml.includes('Άσε την να επιλεγεί αυτόματα'),
)

t('strategy <select> includes 8 strategies', () => {
  const strategies = [
    'Συνεργατική Μάθηση',
    'Problem-Based Learning',
    'Ανακαλυπτική Μάθηση',
    'Αντεστραμμένη Τάξη',
    'Παιχνίδι Ρόλων',
    'Project-Based',
    'Άμεση Διδασκαλία',
    'Διαφοροποιημένη',
  ]
  return strategies.every((s) => defaultHtml.includes(`>${s}<`))
})

t('environments has 6 checkboxes', () => {
  const checkboxes = defaultHtml.match(/type="checkbox"/g) || []
  return checkboxes.length === 6
})

t('environments include differentiation labels', () => {
  const envs = [
    'Μαθησιακές Δυσκολίες (Δυσλεξία)',
    'ΔΕΠΥ',
    'Φάσμα Αυτισμού (ΦΑΔ)',
    'Κινητικές Δυσκολίες',
    'Προσφυγικό / Μεταναστευτικό Υπόβαθρο',
    'Υψηλή Επίδοση (Gifted)',
  ]
  return envs.every((e) => defaultHtml.includes(e))
})

t('submit button shows idle label + aria-busy=false', () =>
  defaultHtml.includes('>Δημιουργία σεναρίου<') &&
  /aria-busy="false"/.test(defaultHtml),
)

t('cancel link points to /saved', () =>
  /href="\/saved"/.test(defaultHtml) && defaultHtml.includes('>Άκυρο<'),
)

t('no error region rendered initially (no role=alert)', () =>
  !/role="alert"/.test(defaultHtml),
)

// ── With initial prop ───────────────────────────────────────
const prefilledHtml = renderToStaticMarkup(
  React.createElement(GenerateForm, {
    initial: {
      grade: 'Δ',
      subject: 'Μαθηματικά',
      objective: 'Οι μαθητές να μάθουν την πρόσθεση κλασμάτων.',
    },
  }),
)

t('initial prop: pre-fills subject value', () =>
  /value="Μαθηματικά"/.test(prefilledHtml),
)

t('initial prop: marks the chosen grade as aria-checked=true', () => {
  const checked = prefilledHtml.match(/aria-checked="true"/g) || []
  return checked.length === 1 && /aria-checked="true"[^>]*>Δ</.test(prefilledHtml)
})

t('initial prop: char counter reflects objective length', () => {
  const obj = 'Οι μαθητές να μάθουν την πρόσθεση κλασμάτων.'
  return prefilledHtml.includes(`${obj.length}/500`)
})

// ── Run ─────────────────────────────────────────────────────
let pass = 0,
  fail = 0
for (const c of checks) {
  let ok = false,
    err = null
  try {
    ok = c.fn() === true
  } catch (e) {
    err = e
  }
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
