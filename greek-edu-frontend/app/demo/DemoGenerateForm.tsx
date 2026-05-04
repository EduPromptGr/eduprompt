'use client'

// app/demo/DemoGenerateForm.tsx
//
// Demo version της GenerateForm — δεν απαιτεί auth.
// Αντί για redirect σε /prompts/[id], δείχνει το σενάριο inline.

import { useState } from 'react'

const GRADES = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ'] as const
type Grade = (typeof GRADES)[number]

const SUBJECTS = ['Μαθηματικά', 'Γλώσσα', 'Μελέτη Περιβάλλοντος', 'Ιστορία', 'Φυσική', 'Γεωγραφία'] as const
const THEORIES = ['Vygotsky (ZPD)', 'Bloom', 'Piaget', 'UDL', 'Gardner (MI)', 'Dewey'] as const
const STRATEGIES = ['Συνεργατική Μάθηση', 'Problem-Based Learning', 'Ανακαλυπτική Μάθηση', 'Αντεστραμμένη Τάξη', 'Παιχνίδι Ρόλων', 'Project-Based', 'Άμεση Διδασκαλία', 'Διαφοροποιημένη'] as const
const ENVIRONMENTS = ['Μαθησιακές Δυσκολίες (Δυσλεξία)', 'ΔΕΠΥ', 'Φάσμα Αυτισμού (ΦΑΔ)', 'Κινητικές Δυσκολίες', 'Προσφυγικό / Μεταναστευτικό Υπόβαθρο', 'Υψηλή Επίδοση (Gifted)'] as const

const OBJECTIVE_MIN = 5
const OBJECTIVE_MAX = 500

interface FormState {
  grade: Grade | null
  subject: string
  unit: string
  chapter: string
  objective: string
  theory: string
  strategy: string
  environments: string[]
}

const INITIAL_STATE: FormState = {
  grade: 'Δ',
  subject: 'Μαθηματικά',
  unit: 'Κλάσματα',
  chapter: 'Πρόσθεση κλασμάτων με ίδιο παρονομαστή',
  objective: 'Οι μαθητές να μπορούν να προσθέτουν κλάσματα με ίδιο παρονομαστή και να αναγνωρίζουν τα ισοδύναμα κλάσματα στην καθημερινή ζωή.',
  theory: 'Vygotsky (ZPD)',
  strategy: 'Συνεργατική Μάθηση',
  environments: [],
}

// ── Types for scenario response ───────────────────────────────────
interface Phase {
  name: string
  duration: string
  teacher_actions: string[]
  student_activities: string[]
  materials: string[]
}

interface Scenario {
  id: string
  grade: string
  subject: string
  unit?: string
  chapter?: string
  objective: string
  theory: string
  strategy: string
  duration_minutes: number
  context: string
  content: {
    learning_objectives: string[]
    phases: Phase[]
    differentiation: {
      struggling: string[]
      advanced: string[]
      special_needs: string[]
      assessment: string[]
    }
    materials_full: string[]
    rag_sources: Array<{ title: string; relevance: number }>
  }
}

// ── Loading steps animation ────────────────────────────────────────
const LOADING_STEPS = [
  { label: 'Ανάκτηση παιδαγωγικού πλαισίου από βάση γνώσης…', icon: '🔍' },
  { label: 'Εφαρμογή θεωρητικού πλαισίου…', icon: '📚' },
  { label: 'Δημιουργία φάσεων μαθήματος με AI…', icon: '🤖' },
  { label: 'Προσαρμογή διαφοροποίησης…', icon: '🎯' },
  { label: 'Τελική επεξεργασία σεναρίου…', icon: '✨' },
]

function LoadingView() {
  const [step, setStep] = useState(0)

  // Advance steps every ~560ms
  useState(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 560)
    return () => clearInterval(id)
  })

  return (
    <div className="mt-10 bg-white rounded-2xl border border-gray-200 p-8 max-w-2xl shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center animate-pulse">
          <span className="text-sky-600 text-lg">⚡</span>
        </div>
        <div>
          <p className="font-semibold text-gray-900">Δημιουργία σεναρίου…</p>
          <p className="text-xs text-gray-500">Συνήθως 8–15 δευτερόλεπτα</p>
        </div>
      </div>

      <div className="space-y-3">
        {LOADING_STEPS.map((s, i) => (
          <div key={i} className={`flex items-center gap-3 text-sm transition-opacity duration-300 ${i <= step ? 'opacity-100' : 'opacity-30'}`}>
            <span className="text-base">{s.icon}</span>
            <span className={i < step ? 'text-gray-400 line-through' : i === step ? 'text-sky-700 font-medium' : 'text-gray-400'}>
              {s.label}
            </span>
            {i < step && <span className="text-green-500 ml-auto">✓</span>}
            {i === step && (
              <span className="ml-auto">
                <span className="inline-block w-4 h-4 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-sky-500 rounded-full transition-all duration-500"
          style={{ width: `${((step + 1) / LOADING_STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  )
}

// ── Scenario result view ──────────────────────────────────────────
function ScenarioView({ scenario, onReset }: { scenario: Scenario; onReset: () => void }) {
  const { content } = scenario

  return (
    <div className="mt-8 space-y-6 animate-[fadeIn_0.4s_ease]">
      {/* Header card */}
      <div className="bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-medium">{scenario.grade}' Δημοτικού</span>
              <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">{scenario.subject}</span>
              <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">{scenario.theory}</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">{scenario.strategy}</span>
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">⏱ {scenario.duration_minutes} λεπτά</span>
            </div>
            {scenario.unit && (
              <p className="text-xs text-gray-500 mb-1">Ενότητα: <strong>{scenario.unit}</strong>{scenario.chapter ? ` › ${scenario.chapter}` : ''}</p>
            )}
            <p className="text-sm text-gray-700 leading-relaxed"><span className="font-medium text-gray-900">Στόχος:</span> {scenario.objective}</p>
          </div>
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-2xl">🎓</div>
        </div>
      </div>

      {/* Μαθησιακοί στόχοι */}
      <Section title="🎯 Μαθησιακοί Στόχοι" color="sky">
        <ul className="space-y-2">
          {content.learning_objectives.map((obj, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-sky-500 font-bold mt-0.5">›</span>
              <span>{obj}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Φάσεις μαθήματος */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">📋 Φάσεις Μαθήματος</h3>
        <div className="space-y-4">
          {content.phases.map((phase, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">{phase.name}</h4>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{phase.duration}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Εκπαιδευτικός</p>
                  <ul className="space-y-1">
                    {phase.teacher_actions.map((a, j) => (
                      <li key={j} className="text-xs text-gray-600 flex gap-1.5"><span className="text-blue-400 mt-0.5">•</span>{a}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Μαθητές</p>
                  <ul className="space-y-1">
                    {phase.student_activities.map((a, j) => (
                      <li key={j} className="text-xs text-gray-600 flex gap-1.5"><span className="text-green-400 mt-0.5">•</span>{a}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {phase.materials.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {phase.materials.map((m, j) => (
                    <span key={j} className="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">📎 {m}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Διαφοροποίηση */}
      <Section title="🌈 Διαφοροποίηση Διδασκαλίας" color="violet">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DiffGroup label="Μαθητές που δυσκολεύονται" color="rose" items={content.differentiation.struggling} />
          <DiffGroup label="Προχωρημένοι μαθητές" color="emerald" items={content.differentiation.advanced} />
          {content.differentiation.special_needs.length > 0 && (
            <DiffGroup label="Ειδικές εκπαιδευτικές ανάγκες" color="amber" items={content.differentiation.special_needs} />
          )}
          <DiffGroup label="Αξιολόγηση" color="blue" items={content.differentiation.assessment} />
        </div>
      </Section>

      {/* Υλικά */}
      <Section title="📦 Υλικά & Πόροι" color="gray">
        <div className="flex flex-wrap gap-2">
          {content.materials_full.map((m, i) => (
            <span key={i} className="text-sm bg-white border border-gray-200 text-gray-700 px-3 py-1 rounded-full shadow-sm">{m}</span>
          ))}
        </div>
      </Section>

      {/* RAG sources */}
      <Section title="📖 Παιδαγωγικές Πηγές (RAG)" color="indigo">
        <p className="text-xs text-gray-500 mb-3">Το σενάριο τεκμηριώθηκε από τις παρακάτω πηγές της βάσης γνώσης:</p>
        <div className="space-y-2">
          {content.rag_sources.map((src, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 text-xs text-gray-700">{src.title}</div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${src.relevance * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500">{Math.round(src.relevance * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Demo notice + CTA */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">⚡ Αυτό είναι demo σενάριο</p>
        <p className="text-xs text-amber-700">Το πραγματικό σενάριο δημιουργείται από το Claude AI της Anthropic με RAG από παιδαγωγικές πηγές. Εγγράψου για να αποθηκεύσεις, να επεξεργαστείς και να εκτυπώσεις το σενάριό σου.</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          onClick={onReset}
          className="px-5 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
        >
          ← Δημιούργησε άλλο σενάριο
        </button>
        <a
          href="/signup"
          className="px-5 py-2.5 rounded-lg border border-sky-600 text-sky-700 text-sm font-medium hover:bg-sky-50 transition-colors"
        >
          Δωρεάν εγγραφή →
        </a>
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          🖨 Εκτύπωση
        </button>
      </div>
    </div>
  )
}

function Section({ title, children, color }: { title: string; children: React.ReactNode; color: string }) {
  const borders: Record<string, string> = {
    sky: 'border-sky-100 bg-sky-50/40',
    violet: 'border-violet-100 bg-violet-50/40',
    gray: 'border-gray-100 bg-gray-50/40',
    indigo: 'border-indigo-100 bg-indigo-50/40',
  }
  return (
    <div className={`border rounded-xl p-5 ${borders[color] ?? borders.gray}`}>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  )
}

function DiffGroup({ label, color, items }: { label: string; color: string; items: string[] }) {
  const colors: Record<string, string> = {
    rose: 'text-rose-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  }
  if (!items.length) return null
  return (
    <div>
      <p className={`text-xs font-semibold mb-1.5 ${colors[color] ?? ''}`}>{label}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-gray-600 flex gap-1.5"><span className="mt-0.5 shrink-0">•</span>{item}</li>
        ))}
      </ul>
    </div>
  )
}

// ── Main form component ───────────────────────────────────────────
export default function DemoGenerateForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [submitting, setSubmitting] = useState(false)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (fieldErrors[key]) setFieldErrors((fe) => { const n = { ...fe }; delete n[key]; return n })
  }

  function toggleEnvironment(env: string) {
    setForm((f) => ({
      ...f,
      environments: f.environments.includes(env)
        ? f.environments.filter((e) => e !== env)
        : [...f.environments, env],
    }))
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.grade) errs.grade = 'Διάλεξε τάξη.'
    if (!form.subject.trim()) errs.subject = 'Διάλεξε ή γράψε μάθημα.'
    const obj = form.objective.trim()
    if (obj.length < OBJECTIVE_MIN) errs.objective = `Τουλάχιστον ${OBJECTIVE_MIN} χαρακτήρες.`
    if (obj.length > OBJECTIVE_MAX) errs.objective = `Μέγιστο ${OBJECTIVE_MAX} χαρακτήρες.`
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    if (!validate()) return

    setSubmitting(true)
    setScenario(null)

    try {
      const res = await fetch('/api/demo-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grade: form.grade,
          subject: form.subject.trim(),
          unit: form.unit.trim() || undefined,
          chapter: form.chapter.trim() || undefined,
          objective: form.objective.trim(),
          theory: form.theory || undefined,
          strategy: form.strategy || undefined,
          environments: form.environments,
        }),
      })

      if (!res.ok) {
        setError(`Σφάλμα server (HTTP ${res.status}). Προσπάθησε ξανά.`)
        return
      }

      const data = (await res.json()) as Scenario
      setScenario(data)

      // Scroll to result
      setTimeout(() => {
        document.getElementById('demo-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch {
      setError('Πρόβλημα δικτύου. Βεβαιώσου ότι ο server τρέχει.')
    } finally {
      setSubmitting(false)
    }
  }

  const objectiveLen = form.objective.trim().length

  return (
    <div>
      {/* ── Form ── */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5 max-w-2xl">

        {/* Grade */}
        <fieldset>
          <legend className="block text-sm font-medium text-gray-800 mb-1.5">
            Τάξη <span className="text-rose-600" aria-hidden>*</span>
          </legend>
          <div role="radiogroup" aria-label="Τάξη" className="flex flex-wrap gap-2">
            {GRADES.map((g) => {
              const active = form.grade === g
              return (
                <button
                  type="button"
                  key={g}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setField('grade', g)}
                  className={active
                    ? 'px-3 py-1.5 rounded-lg border border-sky-600 bg-sky-50 text-sky-700 text-sm font-medium'
                    : 'px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50'}
                >
                  {g}
                </button>
              )
            })}
          </div>
          {fieldErrors.grade && <p className="mt-1 text-xs text-rose-600">{fieldErrors.grade}</p>}
        </fieldset>

        {/* Subject */}
        <div>
          <label htmlFor="gen-subject" className="block text-sm font-medium text-gray-800 mb-1.5">
            Μάθημα <span className="text-rose-600" aria-hidden>*</span>
          </label>
          <input
            id="gen-subject"
            type="text"
            list="gen-subject-options"
            required
            value={form.subject}
            onChange={(e) => setField('subject', e.target.value)}
            maxLength={80}
            placeholder="π.χ. Μαθηματικά"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
          />
          <datalist id="gen-subject-options">
            {SUBJECTS.map((s) => <option key={s} value={s} />)}
          </datalist>
          {fieldErrors.subject && <p className="mt-1 text-xs text-rose-600">{fieldErrors.subject}</p>}
        </div>

        {/* Unit + Chapter */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="gen-unit" className="block text-sm font-medium text-gray-800 mb-1.5">
              Ενότητα <span className="text-xs font-normal text-gray-500">(προαιρετικό)</span>
            </label>
            <input id="gen-unit" type="text" value={form.unit} onChange={(e) => setField('unit', e.target.value)} maxLength={200} placeholder="π.χ. Κλάσματα" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none" />
          </div>
          <div>
            <label htmlFor="gen-chapter" className="block text-sm font-medium text-gray-800 mb-1.5">
              Κεφάλαιο <span className="text-xs font-normal text-gray-500">(προαιρετικό)</span>
            </label>
            <input id="gen-chapter" type="text" value={form.chapter} onChange={(e) => setField('chapter', e.target.value)} maxLength={200} placeholder="π.χ. Πρόσθεση κλασμάτων" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none" />
          </div>
        </div>

        {/* Objective */}
        <div>
          <label htmlFor="gen-objective" className="block text-sm font-medium text-gray-800 mb-1.5">
            Στόχος μαθήματος <span className="text-rose-600" aria-hidden>*</span>
          </label>
          <textarea
            id="gen-objective"
            rows={3}
            required
            value={form.objective}
            onChange={(e) => setField('objective', e.target.value)}
            placeholder="π.χ. Οι μαθητές να προσθέτουν κλάσματα με ίδιο παρονομαστή."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
          />
          <div className="flex justify-between items-center mt-1 text-xs">
            <span className={fieldErrors.objective ? 'text-rose-600' : 'text-gray-500'}>
              {fieldErrors.objective ?? 'Καθαρός, μετρήσιμος στόχος. 1–2 προτάσεις.'}
            </span>
            <span className={objectiveLen > OBJECTIVE_MAX ? 'text-rose-600' : 'text-gray-400'}>{objectiveLen}/{OBJECTIVE_MAX}</span>
          </div>
        </div>

        {/* Theory + Strategy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="gen-theory" className="block text-sm font-medium text-gray-800 mb-1.5">
              Θεωρητικό πλαίσιο <span className="text-xs font-normal text-gray-500">(προαιρετικό)</span>
            </label>
            <select id="gen-theory" value={form.theory} onChange={(e) => setField('theory', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none">
              <option value="">— Αυτόματα —</option>
              {THEORIES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="gen-strategy" className="block text-sm font-medium text-gray-800 mb-1.5">
              Στρατηγική <span className="text-xs font-normal text-gray-500">(προαιρετικό)</span>
            </label>
            <select id="gen-strategy" value={form.strategy} onChange={(e) => setField('strategy', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none">
              <option value="">— Αυτόματα —</option>
              {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Environments */}
        <fieldset>
          <legend className="block text-sm font-medium text-gray-800 mb-1.5">
            Διαφοροποίηση τάξης <span className="text-xs font-normal text-gray-500">(επίλεξε όσα ισχύουν)</span>
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ENVIRONMENTS.map((env) => {
              const checked = form.environments.includes(env)
              return (
                <label key={env} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 text-sm cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={checked} onChange={() => toggleEnvironment(env)} className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                  <span className="text-gray-700">{env}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* Error */}
        {error && (
          <div role="alert" className="border border-rose-300 bg-rose-50 rounded-lg p-3 text-sm text-rose-900">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="px-6 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {submitting ? '⚡ Δημιουργία…' : '✨ Δημιούργησε σενάριο'}
          </button>
          {!submitting && (
            <span className="text-xs text-gray-400">Χωρίς εγγραφή · Δωρεάν demo</span>
          )}
        </div>

        {submitting && (
          <p className="text-xs text-gray-500 animate-pulse">
            Συνήθως παίρνει 8–15 δευτερόλεπτα. Φέρνουμε παιδαγωγικές πηγές από τη βάση γνώσης…
          </p>
        )}
      </form>

      {/* ── Loading animation ── */}
      {submitting && <LoadingView />}

      {/* ── Result ── */}
      {scenario && !submitting && (
        <div id="demo-result">
          <div className="flex items-center gap-2 mt-8 mb-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-500 font-medium px-2">✅ Σενάριο έτοιμο</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <ScenarioView scenario={scenario} onReset={() => setScenario(null)} />
        </div>
      )}
    </div>
  )
}
