'use client'

// components/WorksheetSection.tsx

import { useState, useEffect, Component, type ReactNode, type ErrorInfo } from 'react'

// ── Error Boundary ────────────────────────────────────────────────
class WorksheetErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return { error: msg }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[WorksheetSection] ERROR BOUNDARY caught:', error)
    console.error('[WorksheetSection] Component stack:', info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 mt-4">
          <p className="font-semibold mb-1">Σφάλμα εμφάνισης φυλλαδίων</p>
          <p className="font-mono text-xs break-all">{this.state.error}</p>
          <p className="mt-2 text-xs text-rose-600">
            Άνοιξε F12 → Console και στείλε τα [WorksheetSection] logs.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Types ─────────────────────────────────────────────────────────
interface Activity {
  number: number
  instruction: string
  type: string
  content: string | null
  answer_lines: number
}

interface Worksheet {
  title: string
  type: string
  image_keywords: string[]
  instructions: string
  activities: Activity[]
}

// ── Wikipedia image fetch ─────────────────────────────────────────
async function fetchWikipediaImage(keywords: string[]): Promise<string | null> {
  for (const kw of keywords) {
    try {
      const url =
        `https://en.wikipedia.org/w/api.php?action=query` +
        `&titles=${encodeURIComponent(kw)}` +
        `&prop=pageimages&format=json&pithumbsize=500&origin=*`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      const pages = data?.query?.pages as Record<string, { thumbnail?: { source: string } }>
      if (pages) {
        const page = Object.values(pages)[0]
        if (page?.thumbnail?.source) return page.thumbnail.source
      }
    } catch { /* try next keyword */ }
  }
  return null
}

// ── Helpers ───────────────────────────────────────────────────────
function safeStr(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v
  if (v === null || v === undefined) return fallback
  try { return String(v) } catch { return fallback }
}

function safeLines(n: unknown, fallback = 3): number {
  const v = Math.floor(Number(n))
  return (isNaN(v) || !isFinite(v) || v < 1) ? fallback : Math.min(v, 8)
}

function safeInt(n: unknown, fallback: number): number {
  const v = Number(n)
  return (isNaN(v) || !isFinite(v) || v < 1) ? fallback : Math.floor(v)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function typeIcon(type: string): string {
  const map: Record<string, string> = {
    'ανοιχτή_ερώτηση': '✍️',
    'πολλαπλή_επιλογή': '🔘',
    'συμπλήρωση': '📝',
    'αντιστοίχιση': '🔗',
    'παρατήρηση': '👁️',
    'σχέδιο': '🎨',
  }
  return map[type] ?? '📌'
}

// ── Normalization ─────────────────────────────────────────────────
function normalizeWorksheets(raw: unknown): Worksheet[] {
  console.log('[WorksheetSection] raw response:', JSON.stringify(raw).slice(0, 600))

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    console.warn('[WorksheetSection] unexpected top-level type:', typeof raw)
    return []
  }

  const data = raw as Record<string, unknown>
  if (!Array.isArray(data.worksheets)) {
    console.warn('[WorksheetSection] data.worksheets is not an array:', typeof data.worksheets)
    return []
  }

  const result: Worksheet[] = []

  for (let wi = 0; wi < data.worksheets.length; wi++) {
    try {
      const ws = data.worksheets[wi]
      if (!ws || typeof ws !== 'object' || Array.isArray(ws)) {
        console.warn(`[WS] worksheet[${wi}] invalid:`, ws)
        continue
      }
      const w = ws as Record<string, unknown>

      const actsArr = Array.isArray(w.activities) ? w.activities : []
      const activities: Activity[] = []

      for (let ai = 0; ai < actsArr.length; ai++) {
        try {
          const act = actsArr[ai]
          if (!act || typeof act !== 'object' || Array.isArray(act)) {
            console.warn(`[WS] activity[${wi}][${ai}] invalid:`, act)
            continue
          }
          const a = act as Record<string, unknown>
          activities.push({
            number:       safeInt(a.number, ai + 1),
            instruction:  safeStr(a.instruction),
            type:         safeStr(a.type, 'ανοιχτή_ερώτηση') || 'ανοιχτή_ερώτηση',
            content:      typeof a.content === 'string' ? a.content : null,
            answer_lines: safeLines(a.answer_lines),
          })
        } catch (ae) {
          console.error(`[WS] activity[${wi}][${ai}] error:`, ae)
        }
      }

      const kwArr = Array.isArray(w.image_keywords)
        ? (w.image_keywords as unknown[]).filter((k): k is string => typeof k === 'string')
        : []

      const normalized: Worksheet = {
        title:          safeStr(w.title, 'Φυλλάδιο'),
        type:           safeStr(w.type, 'φύλλο_εργασίας') || 'φύλλο_εργασίας',
        image_keywords: kwArr,
        instructions:   safeStr(w.instructions),
        activities,
      }

      console.log(`[WS] worksheet[${wi}]:`, normalized.title, '—', activities.length, 'activities')
      result.push(normalized)
    } catch (we) {
      console.error(`[WS] worksheet[${wi}] error:`, we)
    }
  }

  return result
}

// ── Print HTML ────────────────────────────────────────────────────
function buildPrintHTML(ws: Worksheet, imageUrl: string | null, notes: Record<string, number | string> = {}): string {
  const typeLabel = ws.type === 'φύλλο_αξιολόγησης' ? 'Φύλλο Αξιολόγησης' : 'Φύλλο Εργασίας'
  const acts = Array.isArray(ws.activities) ? ws.activities : []

  let activitiesHTML = ''
  for (let i = 0; i < acts.length; i++) {
    const act = acts[i]
    const numLines = safeLines(act.answer_lines)
    let lines = ''
    for (let li = 0; li < numLines; li++) { lines += '<div class="line"></div>' }
    const actType = safeStr(act.type)
    const noteKey = `ws0-act${i}` // wsIdx is always 0 during print of a single card
    const actNote = safeStr(notes[noteKey])
    activitiesHTML += `
      <div class="activity">
        <div class="act-header">
          <span class="act-num">${escapeHtml(String(act.number))}</span>
          <span class="act-text">${escapeHtml(act.instruction)}</span>
        </div>
        ${act.content ? `<div class="act-content">${escapeHtml(act.content)}</div>` : ''}
        ${actType === 'σχέδιο'
          ? '<div class="draw-box"></div>'
          : `<div class="lines">${lines}</div>`
        }
        ${actNote ? `<div class="teacher-note">📝 ${escapeHtml(actNote)}</div>` : ''}
      </div>`
  }

  return `<!DOCTYPE html>
<html lang="el"><head><meta charset="UTF-8"><title>${escapeHtml(ws.title)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:12pt;color:#111;padding:18mm 20mm;line-height:1.5}
.top-header{display:flex;justify-content:space-between;font-size:9pt;color:#555;margin-bottom:6px}
.field-group{display:flex;align-items:center;gap:4px}
.field-line{display:inline-block;border-bottom:1px solid #999;min-width:100px;height:14px}
.title-block{border-top:3px solid #111;border-bottom:1px solid #ccc;padding:10px 0 8px;margin-bottom:14px;text-align:center}
.type-badge{font-size:9pt;color:#666;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
h1{font-size:16pt;font-weight:700}
.img-wrap{text-align:center;margin:12px 0}
.img-wrap img{max-height:140px;max-width:280px;border-radius:6px;border:1px solid #ddd}
.instructions{background:#f5f5f5;border-left:3px solid #999;padding:6px 10px;font-size:10pt;margin-bottom:16px}
.activity{margin-bottom:18px;page-break-inside:avoid}
.act-header{display:flex;gap:8px;align-items:flex-start;margin-bottom:5px}
.act-num{background:#111;color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10pt;font-weight:700;flex-shrink:0}
.act-text{font-size:11pt;font-weight:500;line-height:1.4}
.act-content{margin:5px 0 5px 30px;font-size:10pt;color:#333;white-space:pre-wrap;background:#fafafa;border:1px solid #e0e0e0;border-radius:4px;padding:6px 10px}
.lines{margin:6px 0 0 30px}
.line{border-bottom:1px solid #bbb;height:24px;margin-bottom:2px}
.draw-box{margin:6px 0 0 30px;border:1px solid #bbb;border-radius:4px;height:80px}
.teacher-note{margin:4px 0 0 30px;font-size:9pt;color:#555;font-style:italic;border-left:2px solid #a78bfa;padding-left:6px}
.footer{margin-top:30px;border-top:1px solid #ddd;padding-top:8px;text-align:center;font-size:8pt;color:#aaa}
@media print{body{padding:14mm 16mm}@page{margin:10mm}}
</style></head><body>
<div class="top-header">
  <div class="field-group">Ονοματεπώνυμο: <span class="field-line"></span></div>
  <div class="field-group">Ημερομηνία: <span class="field-line" style="min-width:70px"></span></div>
  <div class="field-group">Τάξη: <span class="field-line" style="min-width:50px"></span></div>
</div>
<div class="title-block">
  <div class="type-badge">${typeLabel}</div>
  <h1>${escapeHtml(ws.title)}</h1>
</div>
${imageUrl ? `<div class="img-wrap"><img src="${imageUrl}" alt=""/></div>` : ''}
${ws.instructions ? `<div class="instructions">${escapeHtml(ws.instructions)}</div>` : ''}
${activitiesHTML}
<div class="footer">Δημιουργήθηκε με EduPrompt &middot; eduprompt.gr</div>
</body></html>`
}

// ── Activity Row (sub-component, isolated) ────────────────────────
function ActivityRow({
  act,
  wsIdx: _wsIdx,
  actIdx: _actIdx,
  note,
  onNoteChange,
}: {
  act: Activity
  wsIdx: number
  actIdx: number
  note: string
  onNoteChange: (v: string) => void
}) {
  const [showNote, setShowNote] = useState(note.length > 0)
  const icon = typeIcon(act?.type ?? '')
  const typeLabel = (act?.type ?? '').replace(/_/g, ' ')
  return (
    <div className="px-5 py-3 flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {act.number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1.5 mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{icon}</span>
            <span className="text-xs text-gray-500 capitalize">{typeLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            className="text-xs text-gray-400 hover:text-violet-600 transition-colors"
            title="Σημείωση δασκάλου"
          >
            {showNote ? '✕ σημείωση' : '✎ σημείωση'}
          </button>
        </div>
        <p className="text-sm text-gray-800">{act.instruction}</p>
        {act.content ? (
          <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{act.content}</p>
        ) : null}
        <div className="mt-1.5 space-y-1">
          <div className="h-px bg-gray-300 w-full" />
          <div className="h-px bg-gray-300 w-full" />
          <div className="h-px bg-gray-300 w-full" />
        </div>
        {showNote && (
          <div className="mt-2">
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Σημείωση για αυτή τη δραστηριότητα…"
              rows={2}
              maxLength={500}
              className="w-full px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-xs focus:border-violet-400 focus:ring-1 focus:ring-violet-100 outline-none resize-none text-gray-700 placeholder:text-gray-400"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Worksheet Card (sub-component, isolated) ──────────────────────
function WorksheetCard({
  ws,
  wsIdx,
  printing,
  onPrint,
  notes,
  onNoteChange,
}: {
  ws: Worksheet
  wsIdx: number
  printing: number | null
  onPrint: (i: number) => void
  notes: Record<string, string>
  onNoteChange: (key: string, value: string) => void
}) {
  const typeLabel = ws.type === 'φύλλο_αξιολόγησης'
    ? '📋 Φύλλο Αξιολόγησης'
    : '📝 Φύλλο Εργασίας'

  const acts = Array.isArray(ws.activities) ? ws.activities : []
  const actCount = acts.length
  const hasImage = Array.isArray(ws.image_keywords) && ws.image_keywords.length > 0
  const footerText = `${actCount} δραστηριότητ${actCount === 1 ? 'α' : 'ες'}${hasImage ? ' · Με εικόνα από Wikipedia' : ''}`

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 block">
            {typeLabel}
          </span>
          <h3 className="text-base font-bold text-gray-900">{ws.title}</h3>
          {ws.instructions ? (
            <p className="text-xs text-gray-500 mt-1">{ws.instructions}</p>
          ) : null}
        </div>
        <button
          onClick={() => onPrint(wsIdx)}
          disabled={printing === wsIdx}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-60 transition-colors"
        >
          {printing === wsIdx ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Ετοιμάζω…
            </>
          ) : (
            <>🖨️ Αποθήκευση PDF</>
          )}
        </button>
      </div>

      {/* Activities */}
      <div className="divide-y divide-gray-100">
        {acts.map((act, actIdx) => {
          const noteKey = `ws${wsIdx}-act${actIdx}`
          return (
            <ActivityRow
              key={noteKey}
              act={act}
              wsIdx={wsIdx}
              actIdx={actIdx}
              note={notes[noteKey] ?? ''}
              onNoteChange={(v) => onNoteChange(noteKey, v)}
            />
          )
        })}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 border-t border-gray-100 px-5 py-2.5">
        <span className="text-xs text-gray-400">{footerText}</span>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────
export default function WorksheetSection({
  promptId,
  scenarioTitle: _scenarioTitle,
}: {
  promptId: string
  scenarioTitle: string
}) {
  const [status, setStatus]       = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [worksheets, setWorksheets] = useState<Worksheet[]>([])
  const [errorMsg, setErrorMsg]   = useState('')
  const [printing, setPrinting]   = useState<number | null>(null)
  // notes: key = "ws{wsIdx}-act{actIdx}", value = teacher's note text
  const [notes, setNotes] = useState<Record<string, string>>({})

  // Load notes from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`ws-notes-${promptId}`)
      if (stored) setNotes(JSON.parse(stored) as Record<string, string>)
    } catch { /* localStorage unavailable — skip */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleNoteChange(key: string, value: string) {
    setNotes((prev) => {
      const next = { ...prev, [key]: value }
      try { localStorage.setItem(`ws-notes-${promptId}`, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // Log worksheets state whenever it changes to 'done' — helps debug render issues
  useEffect(() => {
    if (status === 'done') {
      console.log('[WorksheetSection] entering done state. worksheets:', worksheets.length)
      worksheets.forEach((ws, i) => {
        console.log(
          `[WorksheetSection] ws[${i}]:`,
          'title=', ws.title,
          'type=', ws.type,
          'activities=', Array.isArray(ws.activities) ? ws.activities.length : ws.activities,
          'image_keywords=', Array.isArray(ws.image_keywords) ? ws.image_keywords.length : ws.image_keywords,
        )
      })
    }
  }, [status, worksheets])

  async function handleGenerate() {
    setStatus('loading')
    setWorksheets([])
    setErrorMsg('')
    try {
      const res = await fetch('/api/worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: promptId }),
      })

      let rawData: unknown
      try {
        rawData = await res.json()
      } catch {
        throw new Error(`Μη έγκυρο JSON από server (HTTP ${res.status})`)
      }

      if (!res.ok) {
        const d = rawData as Record<string, unknown> | null
        throw new Error(safeStr(d?.error) || safeStr(d?.detail) || `HTTP ${res.status}`)
      }

      const normalized = normalizeWorksheets(rawData)


      if (normalized.length === 0) {
        throw new Error('Δεν δημιουργήθηκαν φυλλάδια — δοκίμασε ξανά')
      }

      setWorksheets(normalized)
      setStatus('done')
    } catch (e) {
      console.error('[WorksheetSection] handleGenerate error:', e)
      setErrorMsg((e as Error).message || 'Άγνωστο σφάλμα')
      setStatus('error')
    }
  }

  async function handlePrint(idx: number) {
    if (idx < 0 || idx >= worksheets.length) return
    setPrinting(idx)
    try {
      const ws = worksheets[idx]
      const imageUrl = Array.isArray(ws.image_keywords) && ws.image_keywords.length > 0
        ? await fetchWikipediaImage(ws.image_keywords)
        : null
      // Remap notes keys from ws{idx}-act{n} → ws0-act{n} for the print function
      const printNotes: Record<string, string> = {}
      Object.entries(notes).forEach(([k, v]) => {
        if (k.startsWith(`ws${idx}-`)) printNotes[k.replace(`ws${idx}-`, 'ws0-')] = v
      })
      const html = buildPrintHTML(ws, imageUrl, printNotes)
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => { w.print(); setPrinting(null) }, 600)
      } else {
        setPrinting(null)
      }
    } catch (e) {
      console.error('[WorksheetSection] print error:', e)
      setPrinting(null)
    }
  }

  // ── IDLE ──────────────────────────────────────────────────────────
  if (status === 'idle') {
    return (
      <section className="mt-10 pt-8 border-t border-gray-200">
        <div className="flex items-start gap-4">
          <div className="text-3xl select-none mt-0.5">📄</div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Φυλλάδια Εργασίας &amp; Αξιολόγησης
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Δημιούργησε έτοιμα-για-εκτύπωση φυλλάδια που συνοδεύουν το σενάριο.
            </p>
            <button
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors"
            >
              ✨ Δημιουργία Φυλλαδίων
            </button>
          </div>
        </div>
      </section>
    )
  }

  // ── LOADING ───────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <section className="mt-10 pt-8 border-t border-gray-200">
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
            <div className="absolute inset-0 rounded-full border-4 border-sky-600 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-xl select-none">📄</div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Δημιουργία φυλλαδίων…</p>
            <p className="text-xs text-gray-400 mt-1">Σχεδιάζω δραστηριότητες βασισμένες στο σενάριό σου</p>
          </div>
          <div className="w-full max-w-lg space-y-3 mt-2">
            <div className="rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="h-10 bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-5/6" />
                <div className="h-3 bg-gray-200 rounded w-4/6" />
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="h-10 bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-5/6" />
                <div className="h-3 bg-gray-200 rounded w-4/6" />
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // ── ERROR ─────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <section className="mt-10 pt-8 border-t border-gray-200">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold mb-1">Σφάλμα δημιουργίας φυλλαδίων</p>
          <p className="mb-3">{errorMsg}</p>
          <button
            onClick={handleGenerate}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700"
          >
            Δοκίμασε ξανά
          </button>
        </div>
      </section>
    )
  }

  // ── DONE ──────────────────────────────────────────────────────────
  return (
    <section className="mt-10 pt-8 border-t border-gray-200">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <span>📄</span>
          <span>Φυλλάδια Εργασίας &amp; Αξιολόγησης</span>
        </h2>
        <button
          onClick={handleGenerate}
          className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
        >
          ↺ Αναγέννηση
        </button>
      </div>

      <WorksheetErrorBoundary>
        <div className="space-y-6">
          {worksheets.map((ws, wsIdx) => (
            <WorksheetCard
              key={wsIdx}
              ws={ws}
              wsIdx={wsIdx}
              printing={printing}
              onPrint={handlePrint}
              notes={notes}
              onNoteChange={handleNoteChange}
            />
          ))}
        </div>
      </WorksheetErrorBoundary>
    </section>
  )
}
