'use client'

// components/ScheduleEditor.tsx
//
// Διαδραστικός editor ωρολογίου προγράμματος.
// Πλήρης CRUD μέσω /api/schedules proxy routes.
//
// Δομή UI:
//   • Header: επιλογή τάξης / σχολικό έτος / αποθήκευση / διαγραφή
//   • Πίνακας: Δευτέρα–Παρασκευή × 7 ώρες (εικόνα τυπικού ΔΣ)
//   • Κελί: μάθημα (combobox) + διάρκεια (λεπτά)
//   • Footer: ανακεφαλαίωση συχνότητας μαθημάτων

import { useState, useEffect, useCallback, useRef } from 'react'

const GRADES = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ'] as const
type Grade = (typeof GRADES)[number]

const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή'] as const
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const
type DayKey = (typeof DAY_KEYS)[number]

const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const

const COMMON_SUBJECTS = [
  'Μαθηματικά',
  'Γλώσσα',
  'Μελέτη Περιβάλλοντος',
  'Ιστορία',
  'Φυσική',
  'Γεωγραφία',
  'Θρησκευτικά',
  'Αγγλικά',
  'Μουσική',
  'Εικαστικά',
  'Φυσική Αγωγή',
  'Πληροφορική',
] as const

const DEFAULT_START = '08:00'
const DEFAULT_DURATION = 45

interface PeriodSlot {
  period: number
  subject: string
  start: string
  duration: number
}

type Schedule = Record<DayKey, PeriodSlot[]>

interface ScheduleRecord {
  id: string
  grade: string
  school_year: string
  label: string | null
  schedule: Schedule
}

function emptySchedule(): Schedule {
  const s: Partial<Schedule> = {}
  for (const key of DAY_KEYS) s[key] = []
  return s as Schedule
}

function periodStart(period: number): string {
  // Τυπική ώρα έναρξης: 08:00, +45' ανά ώρα (χωρίς διάλειμμα modeling)
  const totalMins = (period - 1) * 45
  const h = String(Math.floor(totalMins / 60) + 8).padStart(2, '0')
  const m = String(totalMins % 60).padStart(2, '0')
  return `${h}:${m}`
}

function subjectFrequency(schedule: Schedule): Record<string, number> {
  const freq: Record<string, number> = {}
  for (const slots of Object.values(schedule)) {
    for (const slot of slots) {
      if (slot.subject) freq[slot.subject] = (freq[slot.subject] ?? 0) + 1
    }
  }
  return freq
}

export default function ScheduleEditor() {
  const [selectedGrade, setSelectedGrade] = useState<Grade>('Δ')
  const [schoolYear, setSchoolYear] = useState('2025-2026')
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule())
  const [savedRecord, setSavedRecord] = useState<ScheduleRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing schedule on grade/year change
  useEffect(() => {
    setLoading(true)
    setError(null)
    setSavedRecord(null)

    fetch('/api/schedules')
      .then(r => r.ok ? r.json() : [])
      .then((records: ScheduleRecord[]) => {
        const match = records.find(
          r => r.grade === selectedGrade && r.school_year === schoolYear
        )
        if (match) {
          setSavedRecord(match)
          // Normalise: ensure all day keys exist
          const normalised = emptySchedule()
          for (const key of DAY_KEYS) {
            normalised[key] = (match.schedule[key] ?? []).map(s => ({ ...s }))
          }
          setSchedule(normalised)
        } else {
          setSchedule(emptySchedule())
        }
      })
      .catch(e => setError(`Σφάλμα φόρτωσης: ${e.message}`))
      .finally(() => setLoading(false))
  }, [selectedGrade, schoolYear])

  const getSlot = useCallback((day: DayKey, period: number): PeriodSlot | undefined => {
    return schedule[day].find(s => s.period === period)
  }, [schedule])

  const setSlot = useCallback((day: DayKey, period: number, partial: Partial<PeriodSlot>) => {
    setSchedule(prev => {
      const updated = { ...prev }
      const existing = updated[day].find(s => s.period === period)
      if (existing) {
        // Update existing
        updated[day] = updated[day].map(s =>
          s.period === period ? { ...s, ...partial } : s
        )
      } else {
        // Create new slot
        updated[day] = [
          ...updated[day],
          {
            period,
            subject: partial.subject ?? '',
            start: partial.start ?? periodStart(period),
            duration: partial.duration ?? DEFAULT_DURATION,
          },
        ]
      }
      // Remove empty slots
      updated[day] = updated[day].filter(s => s.subject.trim())
      return updated
    })
    setSaveStatus('idle')
  }, [])

  // Debounced auto-save
  useEffect(() => {
    if (saving) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const hasContent = Object.values(schedule).some(slots => slots.length > 0)
      if (!hasContent) return

      setSaving(true)
      try {
        const method = savedRecord ? 'PATCH' : 'POST'
        const url = savedRecord
          ? `/api/schedules/${savedRecord.id}`
          : '/api/schedules'

        const body = savedRecord
          ? { schedule }
          : { grade: selectedGrade, school_year: schoolYear, schedule }

        const res = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          setSaveStatus('error')
          return
        }

        const data: ScheduleRecord = await res.json()
        setSavedRecord(data)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('error')
      } finally {
        setSaving(false)
      }
    }, 2000)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule])

  const handleDelete = async () => {
    if (!savedRecord) return
    if (!confirm('Να διαγραφεί το ωρολόγιο; Η ενέργεια δεν αναιρείται.')) return

    try {
      await fetch(`/api/schedules/${savedRecord.id}`, { method: 'DELETE' })
      setSavedRecord(null)
      setSchedule(emptySchedule())
      setSaveStatus('idle')
    } catch (e) {
      setError(`Σφάλμα διαγραφής: ${(e as Error).message}`)
    }
  }

  const freq = subjectFrequency(schedule)
  const topSubjects = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const statusColor = saveStatus === 'saved'
    ? 'text-emerald-600'
    : saveStatus === 'error'
    ? 'text-rose-500'
    : 'text-gray-400'

  const statusLabel = saving
    ? '💾 Αποθήκευση…'
    : saveStatus === 'saved'
    ? '✅ Αποθηκεύτηκε'
    : saveStatus === 'error'
    ? '❌ Σφάλμα αποθήκευσης'
    : savedRecord
    ? '✓ Συγχρονισμένο'
    : '⬤ Μη αποθηκευμένο'

  return (
    <div className="space-y-6">
      {/* ── Controls ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        {/* Grade */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Τάξη</label>
          <div className="flex gap-1.5">
            {GRADES.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGrade(g)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                  selectedGrade === g
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-gray-200 text-gray-600 hover:border-violet-200'
                }`}
              >
                {g}′
              </button>
            ))}
          </div>
        </div>

        {/* School year */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Σχολικό έτος</label>
          <select
            value={schoolYear}
            onChange={e => setSchoolYear(e.target.value)}
            className="px-3 py-1.5 rounded-lg border-2 border-gray-200 text-sm focus:border-violet-400 outline-none"
          >
            <option value="2024-2025">2024–2025</option>
            <option value="2025-2026">2025–2026</option>
            <option value="2026-2027">2026–2027</option>
          </select>
        </div>

        {/* Status */}
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
          {savedRecord && (
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs text-rose-500 hover:text-rose-700 border border-rose-200 hover:border-rose-400 px-3 py-1.5 rounded-lg transition-colors"
            >
              🗑 Διαγραφή
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-violet-500 animate-pulse">
          ⏳ Φόρτωση…
        </div>
      ) : (
        <>
          {/* ── Schedule Grid ──────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="bg-violet-50">
                    <th className="border-b border-gray-200 px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-16">
                      Ώρα
                    </th>
                    {DAYS.map(day => (
                      <th
                        key={day}
                        className="border-b border-gray-200 px-3 py-2.5 text-left text-xs font-semibold text-violet-700"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map(period => (
                    <tr key={period} className={period % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'}>
                      <td className="border-b border-gray-100 px-3 py-2 text-xs text-gray-400 font-mono">
                        {period}η
                      </td>
                      {DAY_KEYS.map((dayKey, di) => {
                        const slot = getSlot(dayKey, period)
                        return (
                          <td key={dayKey} className="border-b border-l border-gray-100 px-2 py-1.5">
                            <SlotCell
                              value={slot?.subject ?? ''}
                              duration={slot?.duration ?? DEFAULT_DURATION}
                              onChange={(subject, duration) => {
                                setSlot(dayKey, period, {
                                  subject,
                                  duration,
                                  start: periodStart(period),
                                })
                              }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Subject frequency summary ──────────────── */}
          {topSubjects.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Συχνότητα μαθημάτων (ώρες/εβδομάδα)
              </h2>
              <div className="flex flex-wrap gap-2">
                {topSubjects.map(([subject, count]) => (
                  <span
                    key={subject}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-800"
                  >
                    <span className="font-semibold">{subject}</span>
                    <span className="text-xs bg-violet-200 text-violet-700 rounded-full px-1.5 py-0.5">
                      {`${count}×`}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Tip ────────────────────────────────────── */}
          <div className="text-xs text-gray-400 text-center pb-2">
            💡 Τα αλλαγές αποθηκεύονται αυτόματα μετά από 2 δευτερόλεπτα.
            Άδεια κελιά δεν αποθηκεύονται.
          </div>
        </>
      )}
    </div>
  )
}


// ── SlotCell ────────────────────────────────────────────────────
// Μικρό inline component για ένα κελί του πίνακα.

interface SlotCellProps {
  value: string
  duration: number
  onChange: (subject: string, duration: number) => void
}

function SlotCell({ value, duration, onChange }: SlotCellProps) {
  const [subject, setSubject] = useState(value)
  const [dur, setDur] = useState(duration)
  const [focused, setFocused] = useState(false)

  // Sync props → local state when parent resets
  useEffect(() => { setSubject(value) }, [value])
  useEffect(() => { setDur(duration) }, [duration])

  const commit = useCallback(() => {
    onChange(subject.trim(), dur)
    setFocused(false)
  }, [subject, dur, onChange])

  return (
    <div className={`rounded-lg transition-all ${focused ? 'ring-2 ring-violet-200 bg-violet-50' : ''}`}>
      <input
        type="text"
        list="schedule-subjects"
        value={subject}
        placeholder="Μάθημα"
        onChange={e => setSubject(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
        className={`w-full text-xs px-2 py-1 rounded-t-lg bg-transparent outline-none ${
          subject ? 'text-gray-800 font-medium' : 'text-gray-400'
        }`}
      />
      {focused && (
        <div className="flex items-center gap-1 px-2 pb-1">
          <input
            type="number"
            value={dur}
            min={15}
            max={180}
            step={5}
            onChange={e => setDur(Number(e.target.value))}
            className="w-14 text-xs px-1 py-0.5 border border-violet-200 rounded text-gray-600 outline-none"
          />
          <span className="text-xs text-gray-400">λεπτά</span>
        </div>
      )}
    </div>
  )
}

// datalist για autocomplete
declare global {
  namespace JSX {
    interface IntrinsicElements {
      datalist: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDataListElement>, HTMLDataListElement>
    }
  }
}

// Render the datalist once globally
function SubjectDatalist() {
  return (
    <datalist id="schedule-subjects">
      {COMMON_SUBJECTS.map(s => <option key={s} value={s} />)}
    </datalist>
  )
}
