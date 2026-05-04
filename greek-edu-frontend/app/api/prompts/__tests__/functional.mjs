// functional.mjs — drives each route's POST handler through every
// validation branch using a mocked NextResponse + Supabase client.

import { build } from 'esbuild'
import { writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

mkdirSync('/tmp/routecheck/dist', { recursive: true })

// Shared mock response
class MockResponse {
  constructor(body, init) { this.body = body; this.status = init?.status ?? 200 }
  static json(body, init) { return new MockResponse(body, init) }
}

// ── Supabase mock — supports: auth.getUser, rpc, from().update()...
function makeSupabase({
  user = { id: '11111111-1111-1111-1111-111111111111' },
  rpcError = null,
  rpcData = null,
  updateData = undefined,   // undefined → maybeSingle returns null (not found)
  updateError = null,
} = {}) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async () => ({ data: rpcData, error: rpcError }),
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: updateData === undefined ? null : updateData,
                error: updateError,
              }),
            }),
          }),
        }),
      }),
    }),
  }
}

// Bundle each route; stub next/server + next/headers + @/lib/supabase/server
// via esbuild's alias & plugin mechanism.
async function bundle(entry, supabaseFactory) {
  const out = path.resolve(
    '/tmp/routecheck/dist',
    path.basename(path.dirname(entry)) + '.mjs',
  )
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
    plugins: [{
      name: 'stubs',
      setup(b) {
        b.onResolve({ filter: /^next\/server$/ }, a => ({ path: a.path, namespace: 'stub-nextserver' }))
        b.onLoad({ filter: /.*/, namespace: 'stub-nextserver' }, () => ({
          contents: `
            export class NextResponse {
              constructor(body,init){ this.body=body; this.status=init?.status??200 }
              static json(body,init){ return new NextResponse(body,init) }
            }
          `,
          loader: 'js',
        }))
        b.onResolve({ filter: /^next\/headers$/ }, a => ({ path: a.path, namespace: 'stub-nextheaders' }))
        b.onLoad({ filter: /.*/, namespace: 'stub-nextheaders' }, () => ({
          contents: 'export function cookies(){ return { get:()=>undefined, set:()=>{} } }',
          loader: 'js',
        }))
        b.onResolve({ filter: /^@\/lib\/supabase\/server$/ }, a => ({ path: a.path, namespace: 'stub-sb' }))
        b.onLoad({ filter: /.*/, namespace: 'stub-sb' }, () => ({
          contents: `
            // globalThis-based mock
            export function createClient(){ return globalThis.__testSupabase }
          `,
          loader: 'js',
        }))
      },
    }],
  })
  return out
}

function mkReq(body) {
  return {
    json: async () => {
      if (body === '__broken__') throw new Error('bad json')
      return body
    },
  }
}

const TESTS = []
function t(name, fn) { TESTS.push({ name, fn }) }

// ── rate/route.ts ──────────────────────────────────────────────
const RATE = '/tmp/routecheck/src/app/api/prompts/[id]/rate/route.ts'

t('rate: invalid uuid → 400', async () => {
  const mod = await import(pathToFileURL(await bundle(RATE)).href)
  const r = await mod.POST(mkReq({ rating: 5 }), { params: { id: 'not-uuid' } })
  assert(r.status === 400 && r.body.error.includes('Invalid prompt id'))
})

t('rate: bad json body → 400', async () => {
  const mod = await import(pathToFileURL(await bundle(RATE)).href)
  const r = await mod.POST(mkReq('__broken__'), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 400 && r.body.error.includes('Invalid JSON'))
})

t('rate: rating out of range → 400', async () => {
  const mod = await import(pathToFileURL(await bundle(RATE)).href)
  const r = await mod.POST(mkReq({ rating: 7 }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 400 && r.body.error.includes('1 and 5'))
})

t('rate: non-integer rating → 400', async () => {
  const mod = await import(pathToFileURL(await bundle(RATE)).href)
  const r = await mod.POST(mkReq({ rating: 3.5 }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 400)
})

t('rate: no auth → 401', async () => {
  const mod = await import(pathToFileURL(await bundle(RATE)).href)
  globalThis.__testSupabase = makeSupabase({ user: null })
  const r = await mod.POST(mkReq({ rating: 4 }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 401)
})

t('rate: rpc "not owned" → 404', async () => {
  const mod = await import(pathToFileURL(await bundle(RATE)).href)
  globalThis.__testSupabase = makeSupabase({ rpcError: { message: 'Prompt not found or not owned by user' } })
  const r = await mod.POST(mkReq({ rating: 4 }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 404)
})

t('rate: rpc generic error → 500', async () => {
  const mod = await import(pathToFileURL(await bundle(RATE)).href)
  globalThis.__testSupabase = makeSupabase({ rpcError: { message: 'connection timeout', code: '57P03' } })
  const origErr = console.error; console.error = () => {}
  const r = await mod.POST(mkReq({ rating: 4 }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  console.error = origErr
  assert(r.status === 500)
})

t('rate: success → 200 {success:true, rating:4}', async () => {
  const mod = await import(pathToFileURL(await bundle(RATE)).href)
  globalThis.__testSupabase = makeSupabase({})
  const r = await mod.POST(mkReq({ rating: 4 }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 200 && r.body.success === true && r.body.rating === 4)
})

// ── save/route.ts ──────────────────────────────────────────────
const SAVE = '/tmp/routecheck/src/app/api/prompts/[id]/save/route.ts'

t('save: non-boolean → 400', async () => {
  const mod = await import(pathToFileURL(await bundle(SAVE)).href)
  const r = await mod.POST(mkReq({ saved: 'yes' }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 400 && r.body.error.includes('boolean'))
})

t('save: success true → 200 savedAt set', async () => {
  const mod = await import(pathToFileURL(await bundle(SAVE)).href)
  globalThis.__testSupabase = makeSupabase({ updateData: { id: 'x', saved: true, saved_at: '2026-04-23T10:00:00Z' } })
  const r = await mod.POST(mkReq({ saved: true }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 200 && r.body.saved === true && r.body.savedAt)
})

t('save: prompt not found → 404', async () => {
  const mod = await import(pathToFileURL(await bundle(SAVE)).href)
  globalThis.__testSupabase = makeSupabase({ updateData: undefined })  // maybeSingle → null
  const r = await mod.POST(mkReq({ saved: true }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 404)
})

t('save: db error → 500', async () => {
  const mod = await import(pathToFileURL(await bundle(SAVE)).href)
  globalThis.__testSupabase = makeSupabase({ updateError: { message: 'db boom' } })
  const origErr = console.error; console.error = () => {}
  const r = await mod.POST(mkReq({ saved: false }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  console.error = origErr
  assert(r.status === 500)
})

// ── report-error/route.ts ──────────────────────────────────────
const REP = '/tmp/routecheck/src/app/api/prompts/[id]/report-error/route.ts'

t('report: invalid category → 400', async () => {
  const mod = await import(pathToFileURL(await bundle(REP)).href)
  const r = await mod.POST(mkReq({ category: 'not_a_thing', description: 'oops' }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 400 && r.body.error.includes('category must be one of'))
})

t('report: description too long → 400', async () => {
  const mod = await import(pathToFileURL(await bundle(REP)).href)
  const r = await mod.POST(mkReq({ category: 'other', description: 'x'.repeat(2001) }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 400 && r.body.error.includes('max 2000'))
})

t('report: empty description → 400', async () => {
  const mod = await import(pathToFileURL(await bundle(REP)).href)
  const r = await mod.POST(mkReq({ category: 'other', description: '   ' }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 400 && r.body.error.includes('empty'))
})

t('report: rpc not-owned → 404', async () => {
  const mod = await import(pathToFileURL(await bundle(REP)).href)
  globalThis.__testSupabase = makeSupabase({ rpcError: { message: 'Prompt not found or not owned by user' } })
  const r = await mod.POST(mkReq({ category: 'factual_error', description: 'wrong year' }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 404)
})

t('report: success → 200 with reportId', async () => {
  const mod = await import(pathToFileURL(await bundle(REP)).href)
  globalThis.__testSupabase = makeSupabase({ rpcData: 'new-uuid-here' })
  const r = await mod.POST(mkReq({ category: 'pedagogical_error', description: 'theory mismatch' }), { params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
  assert(r.status === 200 && r.body.reportId === 'new-uuid-here' && r.body.category === 'pedagogical_error')
})

function assert(cond) { if (!cond) throw new Error('assertion failed') }

// Run
let pass = 0, fail = 0
for (const test of TESTS) {
  try { await test.fn(); console.log('PASS', test.name); pass++ }
  catch (e) { console.log('FAIL', test.name, '—', e.message); fail++ }
}
console.log(`\n${pass}/${TESTS.length} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
