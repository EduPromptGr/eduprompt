import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Mock scenario body that mirrors prompt_service.py output shape
const SCENARIO = {
  title: 'Ανακαλύπτοντας τα κλάσματα',
  phases: [
    { label: "Φάση 1 · Ενεργοποίηση (5')", body: '- Δείξε μία πίτσα στους μαθητές\n- Ρώτα αν φτάνει για 4 παιδιά' },
    { label: "Φάση 2 · Διερεύνηση (15')", body: 'Χώρισε τους μαθητές σε ομάδες των 3. Κάθε ομάδα λαμβάνει χάρτινο κύκλο και ψαλίδι.\nΖήτησε να κόψουν τον κύκλο σε ίσα μέρη.' },
    { label: "Φάση 3 · Εννοιολόγηση (15')", body: 'Εισάγετε την ορολογία "αριθμητής" και "παρονομαστής".' },
    { label: "Φάση 4 · Αξιολόγηση (5')", body: '- Ζήτα κάθε μαθητή να γράψει ένα κλάσμα\n- Συζήτηση στην ολομέλεια' },
  ],
  common_errors: 'Οι μαθητές συχνά μπερδεύουν αριθμητή με παρονομαστή. Τόνισε ότι το κάτω είναι "πόσα συνολικά".',
  expected_outcome: 'Στο τέλος, οι μαθητές μπορούν να διαβάσουν και να γράψουν απλά κλάσματα.',
  differentiation: {
    general: 'Χρησιμοποίησε manipulatives.',
    weak: 'Δώσε προ-κομμένους κύκλους με διαφορετικά χρώματα.',
    average: 'Ζήτα να συγκρίνουν κλάσματα.',
    gifted: 'Εισαγωγή σε ισοδύναμα κλάσματα.',
  },
  env_adaptation: 'Αν είστε εξωτερικά, χρησιμοποιήστε φύλλα δέντρων.',
}

const MOCK_PROMPT = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  grade: 'Γ',
  subject: 'Μαθηματικά',
  objective: 'Να κατανοήσουν την έννοια του κλάσματος ως μέρος ενός συνόλου',
  theory: 'vygotsky_zpd',
  strategy: 'discovery',
  environments: ['classroom'],
  unit: 'Ενότητα 4',
  title: 'Ανακαλύπτοντας τα κλάσματα',
  body: SCENARIO,
  data_driven: true,
  rating: 4,
  saved: true,
  created_at: '2026-04-23T10:00:00Z',
}

// Provide a mock Supabase client via globalThis
globalThis.__mockSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: MOCK_PROMPT, error: null }),
      }),
    }),
  }),
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
}

await build({
  entryPoints: ['/tmp/pagecheck/src/app/prompts/[id]/page.tsx'],
  outfile: '/tmp/pagecheck/page.bundle.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  loader: { '.tsx': 'tsx' },
  external: ['react', 'react-dom'],
  logLevel: 'silent',
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, a => ({ path: a.path, namespace: 'stub-nav' }))
      b.onLoad({ filter: /.*/, namespace: 'stub-nav' }, () => ({
        contents: 'export function notFound(){ throw new Error("NOT_FOUND") }',
        loader: 'js',
      }))
      b.onResolve({ filter: /^next\/headers$/ }, a => ({ path: a.path, namespace: 'stub-headers' }))
      b.onLoad({ filter: /.*/, namespace: 'stub-headers' }, () => ({
        contents: 'export function cookies(){ return { get:()=>undefined, set:()=>{} } }',
        loader: 'js',
      }))
      b.onResolve({ filter: /^@\/lib\/supabase\/server$/ }, a => ({ path: a.path, namespace: 'stub-sb' }))
      b.onLoad({ filter: /.*/, namespace: 'stub-sb' }, () => ({
        contents: 'export function createClient(){ return globalThis.__mockSupabase }',
        loader: 'js',
      }))
    },
  }],
})

const mod = await import(pathToFileURL('/tmp/pagecheck/page.bundle.mjs').href)
const PromptPage = mod.default
const element = await PromptPage({ params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
const html = renderToStaticMarkup(element)

function check(name, cond) {
  console.log(cond ? 'PASS' : 'FAIL', name)
  if (!cond) process.exitCode = 1
}

// Structural
check('article root', html.startsWith('<article'))
check('title rendered', html.includes('Ανακαλύπτοντας τα κλάσματα'))
check('grade/subject breadcrumb', html.includes('Γ Δημοτικού') && html.includes('Μαθηματικά'))
check('unit shown', html.includes('Ενότητα 4'))
check('objective shown', html.includes('κλάσματος ως μέρος'))
check('theory label mapped', html.includes('Vygotsky (ZPD)'))
check('strategy label mapped', html.includes('Ανακαλυπτική μάθηση'))
check('env label mapped', html.includes('Τάξη'))
check('data-driven badge', html.includes('Data-driven'))
check('all 4 phases', (html.match(/Φάση \d · /g) || []).length === 4)
check('phase with bullets parsed as <ul>', html.includes('<ul class="list-disc'))
check('common_errors card', html.includes('Κοινά λάθη / παρανοήσεις'))
check('expected_outcome card', html.includes('Αναμενόμενο αποτέλεσμα'))
check('differentiation 4 blocks', html.includes('Γενικές οδηγίες') && html.includes('Για αδύναμους') && html.includes('Για μέσο') && html.includes('Για προχωρημένους'))
check('env_adaptation card', html.includes('Προσαρμογή στο περιβάλλον'))
check('feedback RatingStars', html.includes('role="radiogroup"') && html.includes('aria-label="Αξιολόγηση σεναρίου"'))
check('rating 4 reflected in stars', (html.match(/fill="#f59e0b"/g) || []).length >= 4)
check('SaveButton saved state', html.includes('aria-pressed="true"') && html.includes('Αποθηκεύτηκε'))
check('ReportErrorDialog trigger', html.includes('aria-haspopup="dialog"') && html.includes('Αναφορά'))
check('date formatted in Greek', html.includes('Απριλίου 2026'))
check('noindex robots via generateMetadata — cannot check here directly', true)

// ── Additional check: invalid uuid triggers notFound ──
console.log('\n--- Invalid UUID path ---')
try {
  await PromptPage({ params: { id: 'not-a-uuid' } })
  console.log('FAIL invalid uuid should have thrown NOT_FOUND')
  process.exitCode = 1
} catch (e) {
  console.log(e.message === 'NOT_FOUND' ? 'PASS invalid uuid → notFound()' : 'FAIL unexpected: ' + e.message)
}

// ── Additional check: row missing triggers notFound ──
globalThis.__mockSupabase = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
}
try {
  await PromptPage({ params: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } })
  console.log('FAIL null row should have thrown NOT_FOUND')
  process.exitCode = 1
} catch (e) {
  console.log(e.message === 'NOT_FOUND' ? 'PASS null row → notFound()' : 'FAIL unexpected: ' + e.message)
}

// ── Metadata for missing prompt ──
console.log('\n--- Metadata branch ---')
const md = await mod.generateMetadata({ params: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } })
console.log(md.title === 'Σενάριο δεν βρέθηκε — EduPrompt' ? 'PASS metadata for missing prompt' : 'FAIL ' + md.title)
