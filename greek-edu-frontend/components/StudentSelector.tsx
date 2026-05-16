'use client'

/**
 * StudentSelector — επιλογή ή δημιουργία μαθητή για ιδιαίτερο μάθημα.
 *
 * Χρήση:
 *   <StudentSelector
 *     grade="Δ"
 *     selectedId={studentId}
 *     onSelect={(id) => setStudentId(id)}
 *   />
 *
 * Features:
 * - Λίστα ενεργών μαθητών (φιλτραρισμένη per grade αν δοθεί)
 * - Quick-add form (όνομα + grade + στυλ)
 * - Soft-delete από τη λίστα
 */

import { useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type LearningStyle = 'visual' | 'auditory' | 'kinesthetic' | 'mixed'

interface Student {
  id: string
  name: string
  grade: string
  learning_style: LearningStyle
  strengths?: string
  weaknesses?: string
  goals?: string
  notes?: string
  active: boolean
  created_at: string
}

interface Props {
  grade?: string           // pre-filters list to this grade
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const GRADES = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ']

const STYLE_LABELS: Record<LearningStyle, string> = {
  visual: '👁 Οπτικός',
  auditory: '👂 Ακουστικός',
  kinesthetic: '✋ Κιναισθητικός',
  mixed: '🔀 Μικτός',
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, init)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Σφάλμα' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Component ──────────────────────────────────────────────────────────────

export default function StudentSelector({ grade, selectedId, onSelect }: Props) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newGrade, setNewGrade] = useState(grade ?? 'Δ')
  const [newStyle, setNewStyle] = useState<LearningStyle>('mixed')
  const [newStrengths, setNewStrengths] = useState('')
  const [newWeaknesses, setNewWeaknesses] = useState('')
  const [newGoals, setNewGoals] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Keep newGrade in sync when parent grade changes
  useEffect(() => {
    if (grade) setNewGrade(grade)
  }, [grade])

  // Load students
  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const qs = grade ? `?grade=${encodeURIComponent(grade)}` : ''
      const data: Student[] = await apiFetch(`/api/students${qs}`)
      setStudents(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Αδυναμία φόρτωσης')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const student: Student = await apiFetch('/api/students', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          grade: newGrade,
          learning_style: newStyle,
          strengths: newStrengths.trim() || undefined,
          weaknesses: newWeaknesses.trim() || undefined,
          goals: newGoals.trim() || undefined,
        }),
      })
      setStudents(prev => [student, ...prev])
      onSelect(student.id)
      // Reset form
      setNewName('')
      setNewStrengths('')
      setNewWeaknesses('')
      setNewGoals('')
      setShowAdd(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Αδυναμία αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await apiFetch(`/api/students/${id}`, { method: 'DELETE' })
      setStudents(prev => prev.filter(s => s.id !== id))
      if (selectedId === id) onSelect(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Σφάλμα διαγραφής')
    }
  }

  const selected = students.find(s => s.id === selectedId)

  return (
    <div className="space-y-3">
      {/* ── Selected student badge ─────────────────────────────── */}
      {selected && (
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 border border-brand-200 px-3 py-2 text-sm">
          <span className="text-lg">👤</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-brand-800 truncate">{selected.name}</p>
            <p className="text-brand-600 text-xs">
              {selected.grade}' Δημοτικού · {STYLE_LABELS[selected.learning_style]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 text-brand-400 hover:text-brand-700 transition-colors"
            aria-label="Αποεπιλογή μαθητή"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Student list ───────────────────────────────────────── */}
      {loading ? (
        <p className="text-sm text-gray-400 animate-pulse">Φόρτωση μαθητών…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : students.length === 0 && !showAdd ? (
        <p className="text-sm text-gray-500">
          Δεν υπάρχουν μαθητές{grade ? ` για ${grade}' Δημοτικού` : ''}. Πρόσθεσε τον πρώτο!
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
          {students.map(s => (
            <li key={s.id}>
              <div
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                  s.id === selectedId
                    ? 'bg-brand-50'
                    : 'bg-white hover:bg-gray-50'
                }`}
                onClick={() => onSelect(s.id === selectedId ? null : s.id)}
              >
                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-xs shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.grade}' · {STYLE_LABELS[s.learning_style]}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setExpandedId(expandedId === s.id ? null : s.id) }}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Λεπτομέρειες μαθητή"
                  >
                    {expandedId === s.id ? '▲' : '▼'}
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleDeactivate(s.id) }}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    aria-label="Αφαίρεση μαθητή"
                  >
                    🗑
                  </button>
                </div>
              </div>
              {/* Detail expand */}
              {expandedId === s.id && (
                <div className="bg-gray-50 px-4 py-2 text-xs text-gray-600 space-y-1 border-t border-gray-100">
                  {s.strengths && <p><span className="font-medium">Δυνατά:</span> {s.strengths}</p>}
                  {s.weaknesses && <p><span className="font-medium">Δυσκολίες:</span> {s.weaknesses}</p>}
                  {s.goals && <p><span className="font-medium">Στόχοι:</span> {s.goals}</p>}
                  {!s.strengths && !s.weaknesses && !s.goals && (
                    <p className="italic text-gray-400">Δεν υπάρχουν επιπλέον στοιχεία.</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Add student toggle ─────────────────────────────────── */}
      {!showAdd ? (
        <button
          type="button"
          onClick={() => { setShowAdd(true); setTimeout(() => nameRef.current?.focus(), 50) }}
          className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 font-medium transition-colors"
        >
          <span>＋</span> Νέος μαθητής
        </button>
      ) : (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 space-y-3 animate-fade-in"
        >
          <p className="text-sm font-semibold text-brand-800">Προσθήκη νέου μαθητή</p>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Όνομα <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="π.χ. Μαρία Κ."
              maxLength={100}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Grade + Style row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Τάξη</label>
              <select
                value={newGrade}
                onChange={e => setNewGrade(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {GRADES.map(g => (
                  <option key={g} value={g}>{g}' Δημοτικού</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Μαθησιακό στυλ</label>
              <select
                value={newStyle}
                onChange={e => setNewStyle(e.target.value as LearningStyle)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {(Object.keys(STYLE_LABELS) as LearningStyle[]).map(k => (
                  <option key={k} value={k}>{STYLE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional fields */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Δυνατά σημεία (προαιρετικό)</label>
            <textarea
              value={newStrengths}
              onChange={e => setNewStrengths(e.target.value)}
              rows={2}
              placeholder="π.χ. Καλός στα Μαθηματικά, γρήγορος αναγνώστης"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Δυσκολίες / κενά (προαιρετικό)</label>
            <textarea
              value={newWeaknesses}
              onChange={e => setNewWeaknesses(e.target.value)}
              rows={2}
              placeholder="π.χ. Δυσκολία στους πολλαπλασιασμούς, ορθογραφία"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Στόχοι (προαιρετικό)</label>
            <textarea
              value={newGoals}
              onChange={e => setNewGoals(e.target.value)}
              rows={2}
              placeholder="π.χ. Να καλύψει κενά στις πράξεις με κλάσματα"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              aria-busy={saving}
              className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold py-2 transition-colors"
            >
              {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setNewName(''); setNewStrengths(''); setNewWeaknesses(''); setNewGoals('') }}
              className="px-4 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Ακύρωση
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
