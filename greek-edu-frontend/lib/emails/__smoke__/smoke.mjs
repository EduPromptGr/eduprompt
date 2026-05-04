// smoke.mjs — render each email template with sample args and verify output.
import { build } from 'esbuild'
import { writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve('./src/lib/emails')
const OUT = path.resolve('./out')
mkdirSync(OUT, { recursive: true })

const TEMPLATES = [
  {
    name: 'welcome',
    entry: path.join(ROOT, 'templates/welcome.ts'),
    export: 'welcomeEmail',
    args: { firstName: 'Θοδωρής', dashboardUrl: 'https://eduprompt.gr/dashboard' },
    expect: {
      subjectContains: 'EduPrompt',
      htmlContains: ['Θοδωρής', 'Δημιούργησε', 'dashboard'],
    },
  },
  {
    name: 'invoicePaid',
    entry: path.join(ROOT, 'templates/invoicePaid.ts'),
    export: 'invoicePaidEmail',
    args: {
      amount: 14.99,
      plan: 'pro',
      paidAt: new Date('2026-04-23T10:00:00Z'),
      invoiceUrl: 'https://invoice.stripe.com/test/abc123',
    },
    expect: {
      subjectContains: '14,99',
      htmlContains: ['Pro', '150', 'invoice.stripe.com', '14,99'],
    },
  },
  {
    name: 'schoolInvite',
    entry: path.join(ROOT, 'templates/schoolInvite.ts'),
    export: 'schoolInviteEmail',
    args: {
      inviterEmail: 'maria@school.gr',
      inviteLink: 'https://eduprompt.gr/join-school?token=abc123',
      schoolName: '1ο Δημοτικό Ιωαννίνων',
      expiresInDays: 7,
    },
    expect: {
      subjectContains: 'Πρόσκληση στο EduPrompt',
      htmlContains: ['maria@school.gr', '1ο Δημοτικό', 'join-school?token=abc123'],
    },
  },
  {
    name: 'referralReward',
    entry: path.join(ROOT, 'templates/referralReward.ts'),
    export: 'referralRewardEmail',
    args: {
      referrerEmail: 'teacher@example.gr',
      months: 1,
      referredEmail: 'friend@example.gr',
    },
    expect: {
      subjectContains: 'δωρεάν',
      htmlContains: ['friend@example.gr', '1 μήνα'],
    },
  },
]

function structuralChecks(html) {
  const issues = []
  if (!/^<!DOCTYPE html>/i.test(html)) issues.push('missing <!DOCTYPE html>')
  if (!/<html[^>]*lang="el"/.test(html)) issues.push('missing lang="el" on <html>')
  if (!/<meta charset="utf-8"/i.test(html)) issues.push('missing UTF-8 charset')
  if (!/<meta name="viewport"/i.test(html)) issues.push('missing viewport meta')
  if (!/<title>/.test(html)) issues.push('missing <title>')
  if (!/<table[^>]*role="presentation"/.test(html)) {
    issues.push('no role="presentation" table found (email layout)')
  }
  const pairs = ['html', 'body', 'table', 'tr', 'td', 'div', 'a', 'p', 'h1', 'h2', 'ul', 'li']
  for (const tag of pairs) {
    const open = (html.match(new RegExp('<' + tag + '(\\s[^>]*)?>', 'gi')) || []).length
    const close = (html.match(new RegExp('</' + tag + '>', 'gi')) || []).length
    if (open !== close) issues.push(`unbalanced <${tag}>: ${open} open vs ${close} close`)
  }
  if (/{{.*?}}/.test(html)) issues.push('unresolved {{ }} placeholder found')
  if (/undefined|\[object Object\]/.test(html)) {
    issues.push('rendered "undefined" or "[object Object]"')
  }
  if (html.length < 500) issues.push(`suspiciously short (${html.length} bytes)`)
  if (html.length > 50000) issues.push(`suspiciously long (${html.length} bytes)`)
  return issues
}

function hostileArgsFor(name, args) {
  if (name === 'welcome') return { ...args, firstName: '<script>alert(1)</script>' }
  if (name === 'schoolInvite') return { ...args, inviterEmail: 'x@a.gr', schoolName: '<img src=x onerror=alert(1)>' }
  if (name === 'referralReward') return { ...args, referredEmail: '"><script>alert(1)</script>' }
  return null
}

async function bundleTemplate(tmpl) {
  const outfile = path.resolve('./out', `${tmpl.name}.bundled.mjs`)
  await build({
    entryPoints: [tmpl.entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
  })
  return outfile
}

const results = []

for (const tmpl of TEMPLATES) {
  const res = { name: tmpl.name, issues: [], ok: false, subject: '', size: 0 }
  try {
    const bundled = await bundleTemplate(tmpl)
    const mod = await import(pathToFileURL(bundled).href)
    const fn = mod[tmpl.export]
    if (typeof fn !== 'function') {
      res.issues.push(`export ${tmpl.export} is not a function`)
      results.push(res); continue
    }

    const rendered = fn(tmpl.args)
    if (typeof rendered?.html !== 'string' || typeof rendered?.subject !== 'string') {
      res.issues.push('return value missing {subject, html} strings')
      results.push(res); continue
    }

    res.subject = rendered.subject
    res.size = rendered.html.length
    writeFileSync(path.join(OUT, `${tmpl.name}.html`), rendered.html, 'utf8')

    res.issues.push(...structuralChecks(rendered.html))
    if (!rendered.subject.trim()) res.issues.push('empty subject')
    if (tmpl.expect.subjectContains && !rendered.subject.includes(tmpl.expect.subjectContains)) {
      res.issues.push(`subject missing "${tmpl.expect.subjectContains}"`)
    }
    for (const needle of tmpl.expect.htmlContains) {
      if (!rendered.html.includes(needle)) {
        res.issues.push(`html missing "${needle}"`)
      }
    }

    const hostile = hostileArgsFor(tmpl.name, tmpl.args)
    if (hostile) {
      const hr = fn(hostile)
      writeFileSync(path.join(OUT, `${tmpl.name}.hostile.html`), hr.html, 'utf8')
      if (/<script>alert\(1\)<\/script>/.test(hr.html)) issues_xss(res, 'unescaped <script>')
      if (/<img src=x onerror=alert\(1\)>/.test(hr.html)) issues_xss(res, 'unescaped <img onerror>')
    }

    res.ok = res.issues.length === 0
  } catch (err) {
    res.issues.push(`exception: ${err.message}`)
  }
  results.push(res)
}

function issues_xss(res, msg) { res.issues.push(`XSS: ${msg}`) }

console.log('\n=== Email smoke test ===\n')
let allOk = true
for (const r of results) {
  const status = r.ok ? 'PASS' : 'FAIL'
  console.log(`[${status}] ${r.name.padEnd(16)} ${r.size.toString().padStart(6)}B  subject="${r.subject}"`)
  for (const issue of r.issues) console.log(`        - ${issue}`)
  if (!r.ok) allOk = false
}
console.log(`\nOutput files -> ${OUT}`)
process.exit(allOk ? 0 : 1)
