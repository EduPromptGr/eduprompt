// app/prompts/[id]/page.tsx
//
// Server component. Δείχνει ένα ολοκληρωμένο διδακτικό σενάριο που
// παρήχθη από το backend (FastAPI /generate → insert στον πίνακα prompts).
//
// Layout:
//   ┌─ Header (grade • subject • unit)
//   │  └─ Title
//   │     └─ Theory / Strategy badges
//   ├─ 4 Phases (accordion-free — το email-style rendering δουλεύει παντού)
//   ├─ Expected outcome
//   ├─ Common errors
//   ├─ Differentiation (general + weak/average/gifted)
//   ├─ Environment adaptation (optional)
//   └─ PromptFeedback: RatingStars + SaveButton + ReportErrorDialog
//
// Auth: το Supabase client που φτιάχνουμε εδώ τρέχει με RLS. Αν ο user
// δεν έχει δικαιώμα ανάγνωσης του row, η query γυρίζει 0 rows και
// μπαίνουμε στο notFound() — δεν χρειάζεται ξεχωριστό 401/403 branch.
//
// Metadata: generateMetadata για share previews (title + description από
// την objective). Χωρίς OG image για την ώρα.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import {
  RatingStars,
  SaveButton,
  ReportErrorDialog,
} from '@/components/PromptFeedback'
import WorksheetSection from '@/components/WorksheetSection'
import TeacherNotes from '@/components/TeacherNotes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Types που μοιράζονται με τον generator ─────────────────────
interface ScenarioBody {
  title?: string
  phases?: Array<{ label?: string; body?: string }>
  common_errors?: string
  expected_outcome?: string
  differentiation?: {
    general?: string
    weak?: string
    average?: string
    gifted?: string
  }
  env_adaptation?: string
  materials?: string[]
}

interface PromptRow {
  id: string
  grade: string
  subject: string
  objective: string
  theory: string | null
  strategy: string | null
  environments: string[] | null
  unit: string | null
  title: string
  body: ScenarioBody | string
  data_driven: boolean
  rating: number | null
  saved: boolean
  created_at: string
  teacher_notes: string | null
}

// ── Χρώματα φάσεων (ψυχολογική χρωματική πρόοδος) ────────────
// amber=περιέργεια · blue=εμπλοκή · green=κατανόηση · purple=ανάκλαση
const PHASE_COLORS = [
  { border: '#d97706', lightBorder: '#fde68a', cardBg: '#fffbeb', headerBg: '#fef3c7', text: '#92400e' }, // Αφόρμηση
  { border: '#1d4ed8', lightBorder: '#bfdbfe', cardBg: '#eff6ff', headerBg: '#dbeafe', text: '#1e3a8a' }, // Βιωματική
  { border: '#15803d', lightBorder: '#bbf7d0', cardBg: '#f0fdf4', headerBg: '#dcfce7', text: '#14532d' }, // Σύνθεση
  { border: '#7c3aed', lightBorder: '#ddd6fe', cardBg: '#f5f3ff', headerBg: '#ede9fe', text: '#4c1d95' }, // Αξιολόγηση
]
const PHASE_NEUTRAL = { border: '#6b7280', lightBorder: '#d1d5db', cardBg: '#f9fafb', headerBg: '#f3f4f6', text: '#374151' }

// ── Labels για τα εσωτερικά slugs που γράφει ο generator ──────
// Αυτά υπάρχουν στο prompt_service.py — κράτα τα sync.
const THEORY_LABELS: Record<string, string> = {
  vygotsky_zpd: 'Vygotsky (ZPD)',
  bloom: 'Ταξινομία Bloom',
  piaget: 'Piaget (στάδια)',
  udl: 'Universal Design for Learning',
  gardner: 'Πολλαπλή νοημοσύνη',
  kolb: 'Εμπειρική μάθηση (Kolb)',
}

const STRATEGY_LABELS: Record<string, string> = {
  inquiry_based: 'Διερευνητική μάθηση',
  project_based: 'Project-based',
  discovery: 'Ανακαλυπτική μάθηση',
  collaborative: 'Συνεργατική μάθηση',
  flipped: 'Ανεστραμμένη τάξη',
}

const ENV_LABELS: Record<string, string> = {
  classroom: 'Τάξη',
  lab: 'Εργαστήριο',
  outdoor: 'Εξωτερικός χώρος',
  online: 'Εξ αποστάσεως',
  library: 'Βιβλιοθήκη',
  gym: 'Γυμναστήριο',
}

// ── Metadata για social previews ────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: { id: string }
}): Promise<Metadata> {
  const prompt = await loadPrompt(params.id)
  if (!prompt) {
    return { title: 'Σενάριο δεν βρέθηκε — EduPrompt' }
  }
  const clampedObj = prompt.objective.slice(0, 160)
  return {
    title: `${prompt.title || 'Διδακτικό σενάριο'} — EduPrompt`,
    description: clampedObj,
    robots: { index: false, follow: false }, // private content
  }
}

// ── Data loader ─────────────────────────────────────────────────
async function loadPrompt(id: string): Promise<PromptRow | null> {
  // UUID shape guard — τα invalid ids δεν χρειάζεται να πέσουν στη ΒΔ
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return null
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('prompts')
    .select(
      'id, grade, subject, objective, theory, strategy, environments, unit, title, body, data_driven, rating, saved, created_at, teacher_notes',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('prompts fetch failed', error)
    return null
  }
  return (data as PromptRow | null) ?? null
}

// ── Page ────────────────────────────────────────────────────────
export default async function PromptPage({
  params,
}: {
  params: { id: string }
}) {
  const prompt = await loadPrompt(params.id)
  if (!prompt) notFound()

  // body μπορεί να είναι string (text column) ή object (jsonb column)
  const body: ScenarioBody = (() => {
    if (!prompt.body) return {}
    if (typeof prompt.body === 'string') {
      try { return JSON.parse(prompt.body) } catch { return {} }
    }
    return prompt.body as ScenarioBody
  })()
  const phases = Array.isArray(body.phases) ? body.phases : []
  const diff = body.differentiation || {}
  const envs = prompt.environments || []

  return (
    <article className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="mb-6">
        <nav
          aria-label="Breadcrumb"
          className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap"
        >
          <span>{prompt.grade} Δημοτικού</span>
          <span aria-hidden="true">•</span>
          <span>{prompt.subject}</span>
          {prompt.unit && (
            <>
              <span aria-hidden="true">•</span>
              <span>{prompt.unit}</span>
            </>
          )}
        </nav>
        <h1 className="mt-1 text-2xl md:text-3xl font-bold leading-tight">
          {prompt.title || 'Διδακτικό σενάριο'}
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-medium">Στόχος: </span>
          {prompt.objective}
        </p>

        {/* Pedagogy badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {prompt.theory && (
            <Badge color="violet">
              Θεωρία: {THEORY_LABELS[prompt.theory] ?? prompt.theory}
            </Badge>
          )}
          {prompt.strategy && (
            <Badge color="sky">
              Στρατηγική: {STRATEGY_LABELS[prompt.strategy] ?? prompt.strategy}
            </Badge>
          )}
          {envs.length > 0 && (
            <Badge color="emerald">
              Περιβάλλον: {envs.map((e) => ENV_LABELS[e] ?? e).join(', ')}
            </Badge>
          )}
          {prompt.data_driven && (
            <Badge color="amber" title="Θεωρία/στρατηγική επιλέχθηκαν από τα δικά σου δεδομένα">
              Data-driven
            </Badge>
          )}
        </div>
      </header>

      {/* ── Phases ──────────────────────────────────────────── */}
      <section className="space-y-3 mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Ροή διδασκαλίας
        </h2>
        {phases.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            Το σενάριο δεν επέστρεψε φάσεις — πιθανό generation error.
          </p>
        ) : (
          phases.map((p, i) => {
            const c = PHASE_COLORS[i] ?? PHASE_NEUTRAL
            return (
              <div
                key={i}
                className="rounded-xl overflow-hidden"
                style={{
                  border: `1px solid ${c.lightBorder}`,
                  borderLeft: `5px solid ${c.border}`,
                }}
              >
                {/* Phase header — χρωματιστό background 100-level */}
                <div
                  className="px-4 py-3 flex items-center gap-2.5"
                  style={{ backgroundColor: c.headerBg }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: c.border }}
                  >
                    {i + 1}
                  </div>
                  <h3 className="text-base font-semibold" style={{ color: c.text }}>
                    {p.label || `Φάση ${i + 1}`}
                  </h3>
                </div>
                {/* Phase body — ανοιχτόχρωμο 50-level για υπόβαθρο */}
                <div className="p-4" style={{ backgroundColor: c.cardBg }}>
                  <PhaseBody text={p.body || ''} />
                </div>
              </div>
            )
          })
        )}
      </section>

      {/* ── Expected outcome ────────────────────────────────── */}
      {body.expected_outcome && (
        <Card title="Αναμενόμενο αποτέλεσμα" tone="emerald">
          {body.expected_outcome}
        </Card>
      )}

      {/* ── Common errors ───────────────────────────────────── */}
      {body.common_errors && (
        <Card title="Κοινά λάθη / παρανοήσεις" tone="amber">
          {body.common_errors}
        </Card>
      )}

      {/* ── Differentiation ─────────────────────────────────── */}
      {(diff.general || diff.weak || diff.average || diff.gifted) && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Διαφοροποίηση
          </h2>
          <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
            {diff.general && (
              <DiffBlock label="Γενικές οδηγίες" text={diff.general} />
            )}
            {diff.weak && (
              <DiffBlock label="Για αδύναμους μαθητές" text={diff.weak} />
            )}
            {diff.average && (
              <DiffBlock label="Για μέσο επίπεδο" text={diff.average} />
            )}
            {diff.gifted && (
              <DiffBlock label="Για προχωρημένους" text={diff.gifted} />
            )}
          </div>
        </section>
      )}

      {/* ── Environment adaptation ──────────────────────────── */}
      {body.env_adaptation && (
        <Card title="Προσαρμογή στο περιβάλλον" tone="sky">
          {body.env_adaptation}
        </Card>
      )}

      {/* ── Materials ───────────────────────────────────────── */}
      {Array.isArray(body.materials) && body.materials.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
            🎒 Υλικά που χρειάζεσαι
          </h2>
          <div className="flex flex-wrap gap-2">
            {body.materials.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm"
              >
                <span aria-hidden>📦</span>
                {m}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Teacher notes ────────────────────────────────────── */}
      <TeacherNotes
        promptId={prompt.id}
        initialNotes={prompt.teacher_notes}
      />

      {/* ── Worksheets ──────────────────────────────────────── */}
      <WorksheetSection
        promptId={prompt.id}
        scenarioTitle={prompt.title || 'Διδακτικό σενάριο'}
      />

      {/* ── Feedback footer ─────────────────────────────────── */}
      <footer className="mt-8 pt-6 border-t border-gray-200">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Αξιολόγηση
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <RatingStars
            promptId={prompt.id}
            initialRating={prompt.rating ?? null}
          />
          <SaveButton promptId={prompt.id} initialSaved={prompt.saved} />
          <ReportErrorDialog promptId={prompt.id} />
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Δημιουργήθηκε {formatDate(prompt.created_at)}
        </p>
      </footer>
    </article>
  )
}

// ── Subcomponents ───────────────────────────────────────────────
function Badge({
  children,
  color,
  title,
}: {
  children: React.ReactNode
  color: 'violet' | 'sky' | 'emerald' | 'amber'
  title?: string
}) {
  const classes: Record<string, string> = {
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${classes[color]}`}
    >
      {children}
    </span>
  )
}

function Card({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'emerald' | 'amber' | 'sky'
  children: React.ReactNode
}) {
  const toneClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200',
    amber: 'bg-amber-50 border-amber-200',
    sky: 'bg-sky-50 border-sky-200',
  }
  return (
    <section className="mb-4">
      <div className={`border rounded-xl p-4 ${toneClasses[tone]}`}>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">{title}</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{children}</p>
      </div>
    </section>
  )
}

function PhaseBody({ text }: { text: string }) {
  // Ο generator γράφει newline-separated action items. Αν ξεκινάνε με "-"
  // ή "•" ή αριθμό, rendering ως list — αλλιώς paragraph με preserved newlines.
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const isList =
    lines.length > 1 &&
    lines.every((l) => /^(\s*[-•–*]|\s*\d+[.)])\s+/.test(l))

  if (isList) {
    return (
      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
        {lines.map((l, i) => (
          <li key={i}>{l.replace(/^(\s*[-•–*]|\s*\d+[.)])\s+/, '')}</li>
        ))}
      </ul>
    )
  }
  return (
    <p className="text-sm text-gray-700 whitespace-pre-wrap">{text}</p>
  )
}

function DiffBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-0.5">{label}</div>
      <div className="text-sm text-gray-700 whitespace-pre-wrap">{text}</div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('el-GR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}
