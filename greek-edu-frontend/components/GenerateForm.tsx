'use client'

// components/GenerateForm.tsx
//
// Η κύρια φόρμα δημιουργίας σεναρίου. Mounted από το /generate page
// και — προαιρετικά — από modals/quick-generators αλλού.
//
// Roles:
//   • Συλλέγει input (grade/subject/unit/chapter/objective/theory/
//     strategy/environments) με sensible defaults.
//   • Validates client-side τα required fields (γρήγορο feedback).
//     Το FastAPI κάνει το authoritative validation — δεν duplicate-άρουμε
//     όλα τα κανόνες (π.χ. exact regex grades) εδώ, αλλά cover-άρουμε
//     τα προφανή για να μη φτάνουν αχρείαστα requests στο backend.
//   • POST σε /api/generate (Next.js proxy → FastAPI).
//   • On 200 → router.push(`/prompts/${prompt_id}`).
//   • On 429 → ευγενικό μήνυμα + link προς /pricing.
//   • On άλλα errors → inline error display.
//
// Accessibility:
//   • Όλα τα fields έχουν associated <label htmlFor>.
//   • Required fields επισημαίνονται με aria-required + visual *.
//   • Το rating-stars-style radiogroup για grade έχει role=radiogroup.
//   • Submit button έχει aria-busy κατά τη φόρτωση.
//   • Error region έχει role=alert.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CurriculumDrawer from '@/components/CurriculumDrawer'
import StudentSelector from '@/components/StudentSelector'

// ── Whitelists (mirrored από api/services/prompt_service.py) ─────
//
// Το backend κάνει το authoritative check — εμείς εδώ τα έχουμε για
// να γεμίζουμε τα <select> options. Αν προστεθεί νέα τιμή στο backend,
// ενημερώνουμε εδώ — δεν συνδέεται απαγορευτικά (το backend πάντα
// τσεκάρει).

const GRADES = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ'] as const
type Grade = (typeof GRADES)[number]

const SUBJECTS = [
  'Μαθηματικά',
  'Γλώσσα',
  'Μελέτη Περιβάλλοντος',
  'Ιστορία',
  'Φυσική',
  'Γεωγραφία',
] as const

const THEORIES = [
  'Vygotsky (ZPD)',
  'Bloom',
  'Piaget',
  'UDL',
  'Gardner (MI)',
  'Dewey',
] as const

const STRATEGIES = [
  'Συνεργατική Μάθηση',
  'Problem-Based Learning',
  'Ανακαλυπτική Μάθηση',
  'Αντεστραμμένη Τάξη',
  'Παιχνίδι Ρόλων',
  'Project-Based',
  'Άμεση Διδασκαλία',
  'Διαφοροποιημένη',
] as const

const ENVIRONMENTS = [
  'Μαθησιακές Δυσκολίες (Δυσλεξία)',
  'ΔΕΠΥ',
  'Φάσμα Αυτισμού (ΦΑΔ)',
  'Κινητικές Δυσκολίες',
  'Προσφυγικό / Μεταναστευτικό Υπόβαθρο',
  'Υψηλή Επίδοση (Gifted)',
] as const

const OBJECTIVE_MIN = 5
const OBJECTIVE_MAX = 500

// ── Loading animation data ───────────────────────────────────────
const LOADING_MESSAGES = [
  'Αναλύω τον διδακτικό στόχο…',
  'Επιλέγω παιδαγωγικό πλαίσιο…',
  'Χτίζω τη Φάση 1 — Αφόρμηση…',
  'Χτίζω τη Φάση 2 — Βιωματική Ανάπτυξη…',
  'Χτίζω τη Φάση 3 — Εννοιολόγηση…',
  'Χτίζω τη Φάση 4 — Αξιολόγηση…',
  'Προσθέτω διαφοροποίηση…',
  'Ολοκληρώνω το σενάριο…',
]

const PHASE_SKELETON = [
  { label: 'Αφόρμηση',               color: '#d97706', lightBorder: '#fde68a', headerBg: '#fef3c7', bg: '#fffbeb' },
  { label: 'Βιωματική Ανάπτυξη',    color: '#1d4ed8', lightBorder: '#bfdbfe', headerBg: '#dbeafe', bg: '#eff6ff' },
  { label: 'Εννοιολόγηση / Σύνθεση', color: '#15803d', lightBorder: '#bbf7d0', headerBg: '#dcfce7', bg: '#f0fdf4' },
  { label: 'Αξιολόγηση / Exit Ticket', color: '#7c3aed', lightBorder: '#ddd6fe', headerBg: '#ede9fe', bg: '#f5f3ff' },
]

interface FormState {
  grade: Grade | null
  subject: string
  unit: string
  chapter: string
  objective: string
  theory: string
  strategy: string
  environments: string[]
  extraInstructions: string
}

const INITIAL_STATE: FormState = {
  grade: null,
  subject: '',
  unit: '',
  chapter: '',
  objective: '',
  theory: '',
  strategy: '',
  environments: [],
  extraInstructions: '',
}

interface GenerateResponse {
  prompt_id: string
}

interface ApiError {
  error?: string
  detail?: string | { error?: string; values?: string[] }
}

export interface GenerateFormProps {
  /** Pre-fill values (π.χ. αν ο user clones ένα υπάρχον prompt). */
  initial?: Partial<FormState>
}

export default function GenerateForm({ initial }: GenerateFormProps = {}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({
    ...INITIAL_STATE,
    ...initial,
  })
  const [mode, setMode] = useState<'classroom' | 'tutoring'>('classroom')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [showExtra, setShowExtra] = useState(false)
  const [curriculumOpen, setCurriculumOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState<{
    message: string
    rateLimited?: boolean
  } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<
    Record<keyof FormState, string>
  >>({})

  // Cycling loading messages
  useEffect(() => {
    if (!submitting) { setLoadingStep(0); return }
    const id = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_MESSAGES.length - 1))
    }, 5000)
    return () => clearInterval(id)
  }, [submitting])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    // Καθάρισε field-level error όταν ο user αρχίζει να γράφει.
    if (fieldErrors[key]) {
      setFieldErrors((fe) => {
        const next = { ...fe }
        delete next[key]
        return next
      })
    }
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
    if (form.subject.length > 80) errs.subject = 'Μέγιστο 80 χαρακτήρες.'

    const obj = form.objective.trim()
    if (obj.length < OBJECTIVE_MIN) {
      errs.objective = `Ο στόχος χρειάζεται τουλάχιστον ${OBJECTIVE_MIN} χαρακτήρες.`
    } else if (obj.length > OBJECTIVE_MAX) {
      errs.objective = `Μέγιστο ${OBJECTIVE_MAX} χαρακτήρες.`
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    if (!validate()) return

    setSubmitting(true)
    void (async () => {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            grade: form.grade,
            subject: form.subject.trim(),
            unit: form.unit.trim() || null,
            chapter: form.chapter.trim() || null,
            objective: form.objective.trim(),
            theory: form.theory || null,
            strategy: form.strategy || null,
            environments: form.environments,
            extra_instructions: form.extraInstructions.trim() || null,
            mode,
            student_id: mode === 'tutoring' ? studentId : null,
          }),
        })

        if (res.status === 429) {
          const j = (await res.json().catch(() => ({}))) as ApiError
          setError({
            message:
              extractErrorMessage(j) ||
              'Ξεπέρασες το όριο σεναρίων για το πλάνο σου.',
            rateLimited: true,
          })
          return
        }

        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as ApiError
          setError({
            message:
              extractErrorMessage(j) ||
              `Σφάλμα από τον server (HTTP ${res.status}).`,
          })
          return
        }

        const data = (await res.json()) as GenerateResponse
        if (!data.prompt_id) {
          setError({
            message: 'Λάθος απάντηση από τον server — δεν υπάρχει prompt_id.',
          })
          return
        }
        router.push(`/prompts/${data.prompt_id}`)
      } catch (err) {
        setError({
          message:
            (err as Error).message || 'Πρόβλημα δικτύου. Προσπάθησε ξανά.',
        })
      } finally {
        setSubmitting(false)
      }
    })()
  }

  const objectiveLen = form.objective.trim().length
  const objectiveTooLong = objectiveLen > OBJECTIVE_MAX

  // ── Loading state — αντικαθιστά τη φόρμα όσο δημιουργείται το σενάριο
  if (submitting) {
    return (
      <div className="max-w-2xl">
        {/* Spinner + μήνυμα */}
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
            <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-2xl select-none">✏️</div>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-800">
              {LOADING_MESSAGES[loadingStep]}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Μην κλείσεις την καρτέλα — συνήθως 20–45 δευτερόλεπτα
            </p>
          </div>
        </div>

        {/* Skeleton phase cards */}
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Ροή διδασκαλίας
        </p>
        <div className="space-y-3">
          {PHASE_SKELETON.map((phase, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden animate-pulse"
              style={{
                border: `1px solid ${phase.lightBorder}`,
                borderLeft: `5px solid ${phase.color}`,
              }}
            >
              {/* Header skeleton */}
              <div
                className="px-4 py-3 flex items-center gap-2.5"
                style={{ backgroundColor: phase.headerBg }}
              >
                <div
                  className="w-7 h-7 rounded-full shrink-0"
                  style={{ backgroundColor: phase.color, opacity: 0.5 }}
                />
                <div
                  className="h-4 rounded-full w-44"
                  style={{ backgroundColor: phase.color, opacity: 0.3 }}
                />
              </div>
              {/* Body skeleton */}
              <div className="px-4 py-4 space-y-2.5" style={{ backgroundColor: phase.bg }}>
                <div className="h-3 rounded-full w-full"    style={{ backgroundColor: phase.color, opacity: 0.15 }} />
                <div className="h-3 rounded-full w-11/12"  style={{ backgroundColor: phase.color, opacity: 0.15 }} />
                <div className="h-3 rounded-full w-4/6"    style={{ backgroundColor: phase.color, opacity: 0.15 }} />
                {i === 1 && <div className="h-3 rounded-full w-3/6" style={{ backgroundColor: phase.color, opacity: 0.15 }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6 max-w-2xl"
    >
      {/* ── Mode toggle ────────────────────────────── */}
      <div>
        <p className="block text-sm font-semibold text-gray-700 mb-2">
          🎓 Τύπος μαθήματος
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'classroom'}
            onClick={() => { setMode('classroom'); setStudentId(null) }}
            className={
              mode === 'classroom'
                ? 'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-violet-500 bg-violet-50 text-violet-700 text-sm font-bold shadow-sm'
                : 'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-medium hover:border-violet-300 hover:bg-violet-50 transition-colors'
            }
          >
            🏫 <span>Τάξη <span className="text-xs font-normal opacity-70">(35 λεπτά)</span></span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'tutoring'}
            onClick={() => setMode('tutoring')}
            className={
              mode === 'tutoring'
                ? 'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-brand-500 bg-brand-50 text-brand-700 text-sm font-bold shadow-sm'
                : 'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-medium hover:border-brand-300 hover:bg-brand-50 transition-colors'
            }
          >
            👤 <span>Ιδιαίτερο <span className="text-xs font-normal opacity-70">(60 λεπτά)</span></span>
          </button>
        </div>
      </div>

      {/* ── Student selector (tutoring mode only) ─── */}
      {mode === 'tutoring' && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 animate-fade-in">
          <p className="text-sm font-semibold text-brand-800 mb-3">
            👤 Μαθητής{' '}
            <span className="text-xs font-normal text-brand-500">(προαιρετικό — ενισχύει την εξατομίκευση)</span>
          </p>
          <StudentSelector
            grade={form.grade ?? undefined}
            selectedId={studentId}
            onSelect={setStudentId}
          />
        </div>
      )}

      {/* ── Grade (radiogroup) ─────────────────────── */}
      <fieldset>
        <legend className="block text-sm font-semibold text-gray-700 mb-2">
          📚 Τάξη <span className="text-rose-500" aria-hidden>*</span>
        </legend>
        <div
          role="radiogroup"
          aria-label="Τάξη"
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.grade)}
          className="flex flex-wrap gap-2"
        >
          {GRADES.map((g) => {
            const active = form.grade === g
            return (
              <button
                type="button"
                key={g}
                role="radio"
                aria-checked={active}
                onClick={() => set('grade', g)}
                className={
                  active
                    ? 'px-4 py-2 rounded-xl border-2 border-violet-500 bg-violet-50 text-violet-700 text-sm font-bold shadow-sm'
                    : 'px-4 py-2 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-medium hover:border-violet-300 hover:bg-violet-50 transition-colors'
                }
              >
                {g}′
              </button>
            )
          })}
        </div>
        {fieldErrors.grade && (
          <p className="mt-1.5 text-xs text-rose-500">{fieldErrors.grade}</p>
        )}
      </fieldset>

      {/* ── Subject ─────────────────────────────────── */}
      <div>
        <label
          htmlFor="gen-subject"
          className="block text-sm font-semibold text-gray-700 mb-2"
        >
          🎨 Μάθημα <span className="text-rose-500" aria-hidden>*</span>
        </label>
        <input
          id="gen-subject"
          type="text"
          list="gen-subject-options"
          required
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.subject)}
          value={form.subject}
          onChange={(e) => set('subject', e.target.value)}
          maxLength={80}
          placeholder="π.χ. Μαθηματικά"
          className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-colors"
        />
        <datalist id="gen-subject-options">
          {SUBJECTS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {fieldErrors.subject && (
          <p className="mt-1.5 text-xs text-rose-500">{fieldErrors.subject}</p>
        )}
      </div>

      {/* ── Unit + Chapter (side by side σε desktop) ─ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="gen-unit"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            📖 Ενότητα{' '}
            <span className="text-xs font-normal text-gray-400">
              (προαιρετικό)
            </span>
          </label>
          <input
            id="gen-unit"
            type="text"
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            maxLength={200}
            placeholder="π.χ. Κλάσματα"
            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-colors"
          />
        </div>
        <div>
          <label
            htmlFor="gen-chapter"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            📑 Κεφάλαιο{' '}
            <span className="text-xs font-normal text-gray-400">
              (προαιρετικό)
            </span>
          </label>
          <input
            id="gen-chapter"
            type="text"
            value={form.chapter}
            onChange={(e) => set('chapter', e.target.value)}
            maxLength={200}
            placeholder="π.χ. Πρόσθεση κλασμάτων"
            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-colors"
          />
        </div>
      </div>

      {/* ── Objective ──────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="gen-objective"
            className="block text-sm font-semibold text-gray-700"
          >
            🎯 Στόχος μαθήματος{' '}
            <span className="text-rose-500" aria-hidden>*</span>
          </label>
          {form.grade && form.subject && (
            <button
              type="button"
              onClick={() => setCurriculumOpen(true)}
              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium border border-violet-200 hover:border-violet-400 rounded-lg px-2.5 py-1 transition-colors bg-violet-50 hover:bg-violet-100"
              title="Δες στόχους ΑΠΣ"
            >
              📚 ΑΠΣ
            </button>
          )}
        </div>
        <textarea
          id="gen-objective"
          rows={3}
          required
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.objective)}
          value={form.objective}
          onChange={(e) => set('objective', e.target.value)}
          maxLength={OBJECTIVE_MAX + 50 /* allow extra to show error */}
          placeholder="π.χ. Οι μαθητές να προσθέτουν κλάσματα με ίδιο παρονομαστή."
          className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-colors"
        />
        <div className="flex justify-between items-center mt-1.5 text-xs">
          <span className={fieldErrors.objective ? 'text-rose-500' : 'text-gray-400'}>
            {fieldErrors.objective ?? 'Καθαρός, μετρήσιμος στόχος. 1–2 προτάσεις.'}
          </span>
          <span
            className={
              objectiveTooLong
                ? 'text-rose-500'
                : objectiveLen >= OBJECTIVE_MAX - 50
                ? 'text-amber-500'
                : 'text-gray-400'
            }
          >
            {objectiveLen}/{OBJECTIVE_MAX}
          </span>
        </div>
      </div>

      {/* ── Theory + Strategy ──────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="gen-theory"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            🧠 Θεωρητικό πλαίσιο{' '}
            <span className="text-xs font-normal text-gray-400">
              (προαιρετικό)
            </span>
          </label>
          <select
            id="gen-theory"
            value={form.theory}
            onChange={(e) => set('theory', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-colors"
          >
            <option value="">— Άσε το να επιλεγεί αυτόματα —</option>
            {THEORIES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="gen-strategy"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            ⚡ Στρατηγική{' '}
            <span className="text-xs font-normal text-gray-400">
              (προαιρετικό)
            </span>
          </label>
          <select
            id="gen-strategy"
            value={form.strategy}
            onChange={(e) => set('strategy', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-colors"
          >
            <option value="">— Άσε την να επιλεγεί αυτόματα —</option>
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Environments (multi-checkbox) ──────────── */}
      <fieldset>
        <legend className="block text-sm font-semibold text-gray-700 mb-2">
          🌈 {mode === 'tutoring' ? 'Ειδικές ανάγκες / προφίλ μαθητή' : 'Διαφοροποίηση τάξης'}{' '}
          <span className="text-xs font-normal text-gray-400">
            (επίλεξε όσα ισχύουν)
          </span>
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ENVIRONMENTS.map((env) => {
            const checked = form.environments.includes(env)
            return (
              <label
                key={env}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 text-sm cursor-pointer transition-colors ${
                  checked
                    ? 'border-violet-400 bg-violet-50 text-violet-800'
                    : 'border-gray-200 text-gray-600 hover:border-violet-200 hover:bg-violet-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleEnvironment(env)}
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-400"
                />
                <span>{env}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* ── Extra instructions (collapsible) ─────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
        >
          <span className={`transition-transform duration-200 ${showExtra ? 'rotate-90' : ''}`}>▶</span>
          {showExtra ? 'Απόκρυψη ειδικών οδηγιών' : '➕ Ειδικές οδηγίες για τον AI (προαιρετικό)'}
        </button>
        {showExtra && (
          <div className="mt-3">
            <label
              htmlFor="gen-extra"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              💬 Ειδικές οδηγίες
              <span className="ml-2 text-xs font-normal text-gray-400">(π.χ. «Χρησιμοποίησε μόνο ομαδική εργασία», «Αποφύγε εικόνες»)</span>
            </label>
            <textarea
              id="gen-extra"
              rows={2}
              value={form.extraInstructions}
              onChange={(e) => set('extraInstructions', e.target.value)}
              maxLength={400}
              placeholder="Γράψε οδηγίες που θέλεις να λάβει υπόψη ο AI κατά τη δημιουργία…"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-violet-200 bg-violet-50 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-colors"
            />
            <p className="text-xs text-gray-400 mt-1">{form.extraInstructions.length}/400</p>
          </div>
        )}
      </div>

      {/* ── Error region ──────────────────────────── */}
      {error && (
        <div
          role="alert"
          className={
            error.rateLimited
              ? 'border-2 border-amber-300 bg-amber-50 rounded-xl p-4 text-sm text-amber-900'
              : 'border-2 border-rose-300 bg-rose-50 rounded-xl p-4 text-sm text-rose-900'
          }
        >
          <p>{error.message}</p>
          {error.rateLimited && (
            <p className="mt-1.5">
              <Link
                href="/pricing"
                className="font-semibold underline hover:no-underline"
              >
                Δες τα πλάνα →
              </Link>
            </p>
          )}
        </div>
      )}

      {/* ── Actions ───────────────────────────────── */}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="px-7 py-3 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-violet-200 transition-all"
        >
          {submitting
            ? '⏳ Δημιουργία…'
            : mode === 'tutoring'
            ? '✨ Δημιουργία σεναρίου ιδιαίτερου'
            : '✨ Δημιουργία σεναρίου τάξης'
          }
        </button>
        <Link
          href="/saved"
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          Άκυρο
        </Link>
      </div>

    </form>

    {/* ── CurriculumDrawer ─────────────────────────── */}
    <CurriculumDrawer
      open={curriculumOpen}
      onClose={() => setCurriculumOpen(false)}
      grade={form.grade ?? ''}
      subject={form.subject}
      onSelect={(objective) => {
        set('objective', objective)
      }}
    />
    </>
  )
}

// ── Helpers ─────────────────────────────────────────────────────

function extractErrorMessage(j: ApiError): string {
  if (typeof j.detail === 'string') return j.detail
  if (j.detail && typeof j.detail === 'object') {
    if (j.detail.error === 'invalid_environments') {
      return `Μη έγκυρες επιλογές διαφοροποίησης: ${(
        j.detail.values ?? []
      ).join(', ')}`
    }
    if (j.detail.error) return j.detail.error
  }
  return j.error ?? ''
}
