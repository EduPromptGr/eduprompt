// route.test.mjs
//
// Tests για το /api/generate proxy. Χρησιμοποιούμε esbuild ώστε να
// φορτώσουμε το TS straight, με stubs για:
//   - next/server (NextResponse)
//   - @/lib/supabase/server (controllable session)
//   - global.fetch (controllable upstream)
//
// Coverage:
//   - 401 αν δεν υπάρχει session
//   - 503 αν λείπει BACKEND_API_URL
//   - 400 αν invalid JSON body
//   - passthrough status & body από upstream στο 200 case
//   - 502 σε network error
//   - 504 σε abort/timeout
//   - 401 αν session.access_token == undefined αλλά υπάρχει session

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
  '..',
)
const OUT_DIR = '/tmp/navtest/out-genroute'
mkdirSync(OUT_DIR, { recursive: true })

// State that stubs read from
const stubState = {
  session: null,
  fetchImpl: null,
}

const stubPlugin = {
  name: 'proxy-stubs',
  setup(build) {
    build.onResolve({ filter: /^next\/server$/ }, () => ({
      path: 'next-server',
      namespace: 'stub',
    }))
    build.onResolve({ filter: /^@\/lib\/supabase\/server$/ }, () => ({
      path: 'supa-server',
      namespace: 'stub',
    }))
    build.onLoad({ filter: /^next-server$/, namespace: 'stub' }, () => ({
      contents: `
        export class NextResponse extends Response {
          static json(body, init = {}) {
            const headers = new Headers(init.headers || {})
            headers.set('content-type', 'application/json')
            return new NextResponse(JSON.stringify(body), { ...init, headers })
          }
        }
      `,
      loader: 'js',
    }))
    build.onLoad({ filter: /^supa-server$/, namespace: 'stub' }, () => ({
      contents: `
        import { __getStubState } from 'stubstate'
        export function createClient() {
          return {
            auth: {
              getSession: async () => ({ data: { session: __getStubState().session } }),
            },
          }
        }
      `,
      loader: 'js',
    }))
    build.onResolve({ filter: /^stubstate$/ }, () => ({
      path: 'stubstate', namespace: 'stub',
    }))
    build.onLoad({ filter: /^stubstate$/, namespace: 'stub' }, () => ({
      contents: `
        export const __getStubState = globalThis.__getStubState
      `,
      loader: 'js',
    }))
  },
}

await build({
  entryPoints: [path.join(ROOT, 'app/api/generate/route.ts')],
  outfile: path.join(OUT_DIR, 'route.bundle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  loader: { '.ts': 'ts' },
  plugins: [stubPlugin],
  logLevel: 'silent',
})

globalThis.__getStubState = () => stubState

const mod = await import(
  pathToFileURL(path.join(OUT_DIR, 'route.bundle.mjs')).href
)
const { POST } = mod

const checks = []
function t(name, fn) { checks.push({ name, fn }) }

function makeReq(body) {
  return new Request('http://test/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

// ── 401: no session ─────────────────────────────────────────
t('401 when no session', async () => {
  stubState.session = null
  process.env.BACKEND_API_URL = 'http://upstream'
  const res = await POST(makeReq({ grade: 'Α', subject: 'Math', objective: 'X'.repeat(10) }))
  return res.status === 401
})

// ── 401: session without access_token ───────────────────────
t('401 when session has no access_token', async () => {
  stubState.session = { access_token: null }
  const res = await POST(makeReq({ grade: 'Α', subject: 'Math', objective: 'X'.repeat(10) }))
  return res.status === 401
})

// ── 400: invalid JSON ───────────────────────────────────────
t('400 when invalid JSON', async () => {
  stubState.session = { access_token: 'tok' }
  const res = await POST(
    new Request('http://test/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    }),
  )
  return res.status === 400
})

// ── 503: missing BACKEND_API_URL ────────────────────────────
t('503 when BACKEND_API_URL missing', async () => {
  stubState.session = { access_token: 'tok' }
  delete process.env.BACKEND_API_URL
  const res = await POST(makeReq({ grade: 'Α', subject: 'Math', objective: 'X'.repeat(10) }))
  return res.status === 503
})

// ── 200 passthrough ─────────────────────────────────────────
t('200 passes upstream status + body through', async () => {
  stubState.session = { access_token: 'tok' }
  process.env.BACKEND_API_URL = 'http://upstream'
  globalThis.fetch = async (url, init) => {
    if (url !== 'http://upstream/api/generate') throw new Error('wrong url')
    if (init.headers.authorization !== 'Bearer tok') throw new Error('wrong auth')
    return new Response(JSON.stringify({ prompt_id: 'abc-123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const res = await POST(makeReq({
    grade: 'Α', subject: 'Math', objective: 'X'.repeat(10),
  }))
  if (res.status !== 200) return false
  const j = await res.json()
  return j.prompt_id === 'abc-123'
})

// ── 429 passthrough ─────────────────────────────────────────
t('429 from upstream is propagated', async () => {
  stubState.session = { access_token: 'tok' }
  process.env.BACKEND_API_URL = 'http://upstream'
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: 'rate_limit_exceeded' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })
  const res = await POST(makeReq({
    grade: 'Α', subject: 'Math', objective: 'X'.repeat(10),
  }))
  return res.status === 429
})

// ── 502 on network error ────────────────────────────────────
t('502 when upstream throws', async () => {
  stubState.session = { access_token: 'tok' }
  process.env.BACKEND_API_URL = 'http://upstream'
  globalThis.fetch = async () => {
    throw new Error('ECONNREFUSED')
  }
  const res = await POST(makeReq({
    grade: 'Α', subject: 'Math', objective: 'X'.repeat(10),
  }))
  return res.status === 502
})

// ── 504 on abort/timeout ────────────────────────────────────
t('504 when AbortError', async () => {
  stubState.session = { access_token: 'tok' }
  process.env.BACKEND_API_URL = 'http://upstream'
  globalThis.fetch = async () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    throw e
  }
  const res = await POST(makeReq({
    grade: 'Α', subject: 'Math', objective: 'X'.repeat(10),
  }))
  return res.status === 504
})

// ── Forwards Bearer header ──────────────────────────────────
t('forwards Bearer access_token to upstream', async () => {
  stubState.session = { access_token: 'super-secret' }
  process.env.BACKEND_API_URL = 'http://upstream'
  let captured = null
  globalThis.fetch = async (_url, init) => {
    captured = init.headers
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await POST(makeReq({ grade: 'Α', subject: 'Math', objective: 'X'.repeat(10) }))
  return captured && captured.authorization === 'Bearer super-secret'
})

// ── Run ─────────────────────────────────────────────────────
let pass = 0, fail = 0
for (const c of checks) {
  let ok = false, err = null
  try { ok = (await c.fn()) === true } catch (e) { err = e }
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
