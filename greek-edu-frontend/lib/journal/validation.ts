// lib/journal/validation.ts
//
// Shared validation logic για το journal — μοιράζεται μεταξύ POST/PATCH.
//
// Οι κανόνες ταιριάζουν ΑΚΡΙΒΩΣ με τα CHECK constraints του πίνακα
// (βλ. migration 20260422000000_phase3_core_tables.sql). Αν αλλάξει
// ένα από τα δύο, πρέπει να αλλάξει και το άλλο — αλλιώς θα πέφτουμε
// στον Postgres 23514.

// ── Whitelist tags ────────────────────────────────────────────────
// Όχι strict enum στη ΒΔ (`TEXT[]`), αλλά διατηρούμε λίστα εδώ ώστε
// (α) το UI να έχει preset checkboxes
// (β) analytics (get_feature_usage_monthly, πιθανά future cohorts) να
//     δουλεύουν με σταθερά labels.
export const TAG_PRESETS = [
  { value: 'worked_well', label: 'Λειτούργησε καλά' },
  { value: 'need_differentiation', label: 'Χρειάζεται περισσότερη διαφοροποίηση' },
  { value: 'time_exceeded', label: 'Ξεπέρασα τον χρόνο' },
  { value: 'time_short', label: 'Ολοκληρώθηκε νωρίτερα' },
  { value: 'high_engagement', label: 'Ψηλή συμμετοχή' },
  { value: 'low_engagement', label: 'Χαμηλή συμμετοχή' },
  { value: 'missed_objective', label: 'Δεν πέτυχα τον στόχο' },
  { value: 'exceeded_objective', label: 'Πέτυχα και παραπάνω' },
  { value: 'materials_issue', label: 'Πρόβλημα με υλικά' },
  { value: 'classroom_management', label: 'Θέματα διαχείρισης τάξης' },
] as const

export type TagValue = (typeof TAG_PRESETS)[number]['value']

const ALLOWED_TAG_VALUES = new Set(TAG_PRESETS.map((t) => t.value))

// ── Shapes ────────────────────────────────────────────────────────
export interface JournalCreateInput {
  title?: string | null
  reflection_text: string
  overall_rating?: number | null
  students_engaged_pct?: number | null
  tags?: string[]
  applied_on?: string | null // YYYY-MM-DD
  prompt_id?: string | null
}

export type JournalUpdateInput = Partial<JournalCreateInput>

export interface ValidationError {
  field: string
  message: string
}

// ── Helpers ───────────────────────────────────────────────────────
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// ── Title ─────────────────────────────────────────────────────────
function validateTitle(
  v: unknown,
  required: boolean,
  errs: ValidationError[],
): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  if (typeof v !== 'string') {
    errs.push({ field: 'title', message: 'must be string or null' })
    return undefined
  }
  const t = v.trim()
  if (t.length === 0) return null
  if (t.length > 200) {
    errs.push({ field: 'title', message: 'max 200 characters' })
    return undefined
  }
  return t
  // `required` param kept for symmetry — title never required στο schema
  void required
}

// ── Reflection text ───────────────────────────────────────────────
function validateReflection(
  v: unknown,
  required: boolean,
  errs: ValidationError[],
): string | undefined {
  if (v === undefined) {
    if (required) errs.push({ field: 'reflection_text', message: 'required' })
    return undefined
  }
  if (typeof v !== 'string') {
    errs.push({ field: 'reflection_text', message: 'must be string' })
    return undefined
  }
  const t = v.trim()
  if (t.length < 1) {
    errs.push({ field: 'reflection_text', message: 'cannot be empty' })
    return undefined
  }
  if (t.length > 10000) {
    errs.push({
      field: 'reflection_text',
      message: `max 10000 characters (got ${t.length})`,
    })
    return undefined
  }
  return t
}

// ── Overall rating 1-5 (nullable) ─────────────────────────────────
function validateRating(
  v: unknown,
  errs: ValidationError[],
): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (
    typeof v !== 'number' ||
    !Number.isInteger(v) ||
    v < 1 ||
    v > 5
  ) {
    errs.push({
      field: 'overall_rating',
      message: 'must be integer 1-5 or null',
    })
    return undefined
  }
  return v
}

// ── Students engaged % 0-100 (nullable) ───────────────────────────
function validatePct(
  v: unknown,
  errs: ValidationError[],
): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (
    typeof v !== 'number' ||
    !Number.isInteger(v) ||
    v < 0 ||
    v > 100
  ) {
    errs.push({
      field: 'students_engaged_pct',
      message: 'must be integer 0-100 or null',
    })
    return undefined
  }
  return v
}

// ── Tags ──────────────────────────────────────────────────────────
// Επιτρέπουμε μόνο whitelist values. Αν θέλουμε free-form tags στο
// μέλλον, αλλάζουμε μόνο εδώ.
function validateTags(
  v: unknown,
  errs: ValidationError[],
): string[] | undefined {
  if (v === undefined) return undefined
  if (!Array.isArray(v)) {
    errs.push({ field: 'tags', message: 'must be array of strings' })
    return undefined
  }
  // De-dupe + filter
  const unique = Array.from(new Set(v))
  if (unique.length > 20) {
    errs.push({ field: 'tags', message: 'max 20 tags' })
    return undefined
  }
  const bad: string[] = []
  for (const t of unique) {
    if (typeof t !== 'string') {
      errs.push({ field: 'tags', message: 'each tag must be string' })
      return undefined
    }
    if (!ALLOWED_TAG_VALUES.has(t as TagValue)) bad.push(t)
  }
  if (bad.length > 0) {
    errs.push({
      field: 'tags',
      message: `unknown tag(s): ${bad.slice(0, 3).join(', ')}`,
    })
    return undefined
  }
  return unique as string[]
}

// ── Applied-on date ───────────────────────────────────────────────
// Strict YYYY-MM-DD, not a full ISO timestamp — το DB col είναι DATE.
function validateAppliedOn(
  v: unknown,
  errs: ValidationError[],
): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  if (typeof v !== 'string' || !DATE_RE.test(v)) {
    errs.push({
      field: 'applied_on',
      message: 'must be YYYY-MM-DD date string',
    })
    return undefined
  }
  const d = new Date(v + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) {
    errs.push({ field: 'applied_on', message: 'invalid calendar date' })
    return undefined
  }
  // Όχι future dates πάνω από 1 μέρα ahead (timezone slack)
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  if (d.getTime() > tomorrow.getTime()) {
    errs.push({
      field: 'applied_on',
      message: 'cannot be in the future',
    })
    return undefined
  }
  return v
}

// ── Prompt FK ─────────────────────────────────────────────────────
function validatePromptId(
  v: unknown,
  errs: ValidationError[],
): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    errs.push({ field: 'prompt_id', message: 'must be UUID or null' })
    return undefined
  }
  return v
}

// ── Entry points ──────────────────────────────────────────────────
export function validateCreate(
  raw: unknown,
): { ok: true; data: JournalCreateInput } | { ok: false; errors: ValidationError[] } {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ field: '_root', message: 'must be object' }] }
  }
  const errs: ValidationError[] = []
  const data: JournalCreateInput = {
    title: validateTitle(raw.title, false, errs),
    reflection_text: validateReflection(raw.reflection_text, true, errs) ?? '',
    overall_rating: validateRating(raw.overall_rating, errs),
    students_engaged_pct: validatePct(raw.students_engaged_pct, errs),
    tags: validateTags(raw.tags, errs),
    applied_on: validateAppliedOn(raw.applied_on, errs),
    prompt_id: validatePromptId(raw.prompt_id, errs),
  }
  if (errs.length > 0) return { ok: false, errors: errs }
  return { ok: true, data }
}

export function validateUpdate(
  raw: unknown,
): { ok: true; data: JournalUpdateInput } | { ok: false; errors: ValidationError[] } {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ field: '_root', message: 'must be object' }] }
  }
  const errs: ValidationError[] = []
  const data: JournalUpdateInput = {}
  if ('title' in raw) data.title = validateTitle(raw.title, false, errs)
  if ('reflection_text' in raw) {
    data.reflection_text = validateReflection(raw.reflection_text, false, errs)
  }
  if ('overall_rating' in raw) {
    data.overall_rating = validateRating(raw.overall_rating, errs)
  }
  if ('students_engaged_pct' in raw) {
    data.students_engaged_pct = validatePct(raw.students_engaged_pct, errs)
  }
  if ('tags' in raw) data.tags = validateTags(raw.tags, errs)
  if ('applied_on' in raw) data.applied_on = validateAppliedOn(raw.applied_on, errs)
  if ('prompt_id' in raw) data.prompt_id = validatePromptId(raw.prompt_id, errs)

  if (errs.length > 0) return { ok: false, errors: errs }
  // Prune undefined για να μην γράψουμε `undefined` cols στη ΒΔ
  const clean: JournalUpdateInput = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) (clean as Record<string, unknown>)[k] = v
  }
  if (Object.keys(clean).length === 0) {
    return {
      ok: false,
      errors: [{ field: '_root', message: 'no valid fields to update' }],
    }
  }
  return { ok: true, data: clean }
}

export { UUID_RE }
