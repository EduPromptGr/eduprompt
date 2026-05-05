'use client'

// components/CurriculumDrawer.tsx
//
// Slide-in drawer που εμφανίζει στόχους ΑΠΣ ανά τάξη+μάθημα.
// Ανοίγει από το GenerateForm όταν ο δάσκαλος πατήσει "📚 ΑΠΣ".
// Κλικ σε στόχο → τον αντιγράφει στο objective textarea.
//
// Props:
//   open          : boolean
//   onClose       : () => void
//   grade         : string (Α-ΣΤ) — προ-συμπληρωμένο από τη φόρμα
//   subject       : string — προ-συμπληρωμένο από τη φόρμα
//   onSelect      : (objective: string) => void  — callback στη φόρμα
//
// Data fetching: GET /api/curriculum?grade=Δ&subject=Μαθηματικά
//   (Next.js proxy route → FastAPI)

import { useState, useEffect, useCallback, useRef } from 'react'

interface ObjectiveItem {
  id: string
  objective: string
  objective_code: string | null
  keywords: string[]
  source: string
  page_ref: string | null
  sort_order: number
}

interface ChapterGroup {
  chapter: string | null
  objectives: ObjectiveItem[]
}

interface UnitGroup {
  unit: string | null
  chapters: ChapterGroup[]
}

interface CurriculumData {
  grade: string
  subject: string
  total: number
  units: UnitGroup[]
}

interface Props {
  open: boolean
  onClose: () => void
  grade: string
  subject: string
  onSelect: (objective: string) => void
}

export default function CurriculumDrawer({ open, onClose, grade, subject, onSelect }: Props) {
  const [data, setData] = useState<CurriculumData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [open])

  // Fetch curriculum data when grade or subject changes (and drawer is open)
  useEffect(() => {
    if (!open || !grade || !subject) {
      setData(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setSearchQuery('')

    fetch(`/api/curriculum?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: CurriculumData) => {
        if (cancelled) return
        setData(d)
        // Auto-expand first unit
        if (d.units.length > 0) {
          setExpandedUnits(new Set([d.units[0].unit ?? '__none__']))
        }
      })
      .catch(e => {
        if (cancelled) return
        setError(`Αδυναμία φόρτωσης ΑΠΣ: ${e.message}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, grade, subject])

  const toggleUnit = useCallback((unit: string) => {
    setExpandedUnits(prev => {
      const next = new Set(prev)
      if (next.has(unit)) next.delete(unit)
      else next.add(unit)
      return next
    })
  }, [])

  const handleSelect = useCallback((obj: ObjectiveItem) => {
    onSelect(obj.objective)
    setCopiedId(obj.id)
    setTimeout(() => setCopiedId(null), 1800)
    onClose()
  }, [onSelect, onClose])

  // Filter objectives by search query
  const filteredData = useCallback((): CurriculumData | null => {
    if (!data) return null
    if (!searchQuery.trim()) return data

    const q = searchQuery.toLowerCase()
    const filteredUnits: UnitGroup[] = []

    for (const unit of data.units) {
      const filteredChapters: ChapterGroup[] = []
      for (const ch of unit.chapters) {
        const filteredObjs = ch.objectives.filter(o =>
          o.objective.toLowerCase().includes(q) ||
          (o.objective_code?.toLowerCase() ?? '').includes(q) ||
          o.keywords.some(k => k.toLowerCase().includes(q))
        )
        if (filteredObjs.length > 0) {
          filteredChapters.push({ ...ch, objectives: filteredObjs })
        }
      }
      if (filteredChapters.length > 0) {
        filteredUnits.push({ ...unit, chapters: filteredChapters })
      }
    }

    const total = filteredUnits.reduce((acc, u) =>
      acc + u.chapters.reduce((a, c) => a + c.objectives.length, 0), 0)

    return { ...data, units: filteredUnits, total }
  }, [data, searchQuery])

  const display = filteredData()

  // Escape key closes drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Στόχοι ΑΠΣ"
        className="
          fixed right-0 top-0 h-full w-full max-w-md z-50
          bg-white shadow-2xl flex flex-col
          animate-slide-in-right
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-violet-50">
          <div>
            <h2 className="text-base font-bold text-violet-900">
              📚 Στόχοι ΑΠΣ
            </h2>
            <p className="text-xs text-violet-600 mt-0.5">
              {grade ? `${grade}' Δημοτικού` : ''}
              {grade && subject ? ' · ' : ''}
              {subject || ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-violet-100 hover:text-violet-800 transition-colors"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <input
            ref={searchRef}
            type="search"
            placeholder="Αναζήτηση στόχου..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="
              w-full px-3 py-2 text-sm rounded-lg border border-gray-200
              focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100
            "
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-40 text-violet-500">
              <span className="animate-spin mr-2">⏳</span>
              Φόρτωση...
            </div>
          )}

          {error && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && !grade && (
            <p className="text-center text-sm text-gray-400 mt-10 px-4">
              Επίλεξε τάξη και μάθημα στη φόρμα για να δεις τους στόχους ΑΠΣ.
            </p>
          )}

          {!loading && !error && grade && subject && display && display.total === 0 && (
            <p className="text-center text-sm text-gray-400 mt-10 px-4">
              {searchQuery
                ? `Δεν βρέθηκαν αποτελέσματα για «${searchQuery}»`
                : `Δεν υπάρχουν καταχωρημένοι στόχοι για ${grade}' ${subject}`
              }
            </p>
          )}

          {!loading && display && display.total > 0 && (
            <div className="px-2 py-2">
              {/* Result count */}
              <p className="text-xs text-gray-400 px-2 pb-2">
                {`${display.total} στόχο${display.total === 1 ? 'ς' : 'ι'}`}
              </p>

              {display.units.map((unit, ui) => {
                const unitKey = unit.unit ?? '__none__'
                const isExpanded = expandedUnits.has(unitKey)

                return (
                  <div key={ui} className="mb-2">
                    {/* Unit header (collapsible) */}
                    {unit.unit && (
                      <button
                        onClick={() => toggleUnit(unitKey)}
                        className="
                          w-full flex items-center justify-between px-3 py-2
                          rounded-lg bg-violet-50 hover:bg-violet-100
                          text-left text-sm font-semibold text-violet-800
                          transition-colors
                        "
                      >
                        <span>📂 {unit.unit}</span>
                        <span className="text-violet-400 text-xs">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </button>
                    )}

                    {(isExpanded || !unit.unit) && unit.chapters.map((ch, ci) => (
                      <div key={ci} className="mt-1 ml-2">
                        {/* Chapter label */}
                        {ch.chapter && (
                          <p className="text-xs font-medium text-gray-500 px-2 py-1">
                            {ch.chapter}
                          </p>
                        )}

                        {/* Objectives */}
                        {ch.objectives.map(obj => (
                          <button
                            key={obj.id}
                            onClick={() => handleSelect(obj)}
                            title="Κλικ για χρήση ως στόχος"
                            className="
                              w-full text-left px-3 py-2.5 mb-1
                              rounded-lg border border-gray-100
                              hover:border-violet-300 hover:bg-violet-50
                              focus:outline-none focus:ring-2 focus:ring-violet-300
                              transition-colors group
                            "
                          >
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 mt-0.5 text-violet-400 group-hover:text-violet-600">
                                {copiedId === obj.id ? '✅' : '→'}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm text-gray-800 leading-snug">
                                  {obj.objective}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  {obj.objective_code && (
                                    <span className="text-xs text-violet-400 font-mono">
                                      {obj.objective_code}
                                    </span>
                                  )}
                                  {obj.page_ref && (
                                    <span className="text-xs text-gray-400">
                                      {obj.page_ref}
                                    </span>
                                  )}
                                </div>
                                {obj.keywords.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {obj.keywords.slice(0, 3).map((k, ki) => (
                                      <span
                                        key={ki}
                                        className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded"
                                      >
                                        {k}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400 text-center">
            Πηγή: ΑΠΣ/ΔΕΠΠΣ — Κλίκ σε στόχο για αυτόματη συμπλήρωση
          </p>
        </div>
      </aside>
    </>
  )
}
