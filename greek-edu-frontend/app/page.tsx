// app/page.tsx — Landing page (public, indexable)

import type { Metadata } from 'next'
import Link from 'next/link'
import { siteUrl } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'EduPrompt — Σενάρια διδασκαλίας με ΤΝ για το Δημοτικό',
  description:
    'Παιδαγωγικά τεκμηριωμένα διδακτικά σενάρια για δασκάλους Δημοτικού. ' +
    'Βασισμένα στο ελληνικό ΑΠΣ, σε θεωρίες όπως Vygotsky και Bloom, ' +
    'έτοιμα σε 15 δευτερόλεπτα.',
  openGraph: {
    type: 'website',
    url: siteUrl(),
    title: 'EduPrompt — Σενάρια διδασκαλίας με ΤΝ',
    description:
      'Δημιούργησε παιδαγωγικά δομημένα σενάρια για οποιοδήποτε μάθημα του Δημοτικού — δωρεάν.',
    siteName: 'EduPrompt',
  },
}

// ── Static data ───────────────────────────────────────────────────

const STATS = [
  { value: '35\'', label: 'μάθημα τάξης σε 4 φάσεις' },
  { value: '60\'', label: 'εξατομικευμένο ιδιαίτερο' },
  { value: '6+', label: 'μαθήματα ΑΠΣ υποστηρίζονται' },
  { value: '<15″', label: 'για έτοιμο σενάριο' },
]

const FEATURES = [
  {
    icon: '📚',
    title: 'Ευθυγραμμισμένο με το ελληνικό ΑΠΣ',
    body: 'Γνωρίζει τάξεις, μαθήματα και στόχους Δημοτικού. Επίλεξε από τη βάση ΑΠΣ ή γράψε τον δικό σου στόχο — το σύστημα ξέρει το πλαίσιο.',
    accent: 'sky',
  },
  {
    icon: '👤',
    title: 'Εξατομίκευση για ιδιαίτερα',
    body: 'Δημιούργησε προφίλ μαθητή με δυνατά σημεία, δυσκολίες και μαθησιακό στυλ. Το Claude παράγει 60λεπτο σενάριο 1:1 προσαρμοσμένο ακριβώς σε αυτόν τον μαθητή.',
    accent: 'violet',
  },
  {
    icon: '🧠',
    title: 'Παιδαγωγικές θεωρίες ενσωματωμένες',
    body: 'Vygotsky, Bloom, Piaget, UDL, Gardner — επίλεξε ή άσε το σύστημα να αποφασίσει βάσει αυτού που απέδωσε καλύτερα για το συγκεκριμένο μάθημα.',
    accent: 'sky',
  },
  {
    icon: '🌈',
    title: 'Διαφοροποίηση για κάθε μαθητή',
    body: 'Οδηγίες για αδύναμους, μέσους και gifted σε κάθε σενάριο. Υποστήριξη για δυσλεξία, ΔΕΠΥ, ΦΑΔ και προσφυγικό υπόβαθρο.',
    accent: 'violet',
  },
  {
    icon: '📓',
    title: 'Παιδαγωγικό ημερολόγιο',
    body: 'Κράτα σημειώσεις αμέσως μετά το μάθημα. Το σύστημα μαθαίνει από τις παρατηρήσεις σου και βελτιώνει τα επόμενα σενάρια αυτόματα.',
    accent: 'sky',
  },
  {
    icon: '🏫',
    title: 'Πλάνο για σχολεία',
    body: 'Κοινόχρηστο pool 400 σεναρίων/μήνα για ολόκληρο το σύλλογο. Ενιαία διαχείριση από τον διευθυντή, ξεχωριστό ιστορικό για κάθε δάσκαλο.',
    accent: 'violet',
  },
]

const TESTIMONIALS = [
  {
    role: 'Δάσκαλος Δημοτικού',
    quote: 'Εξοικονομώ 2–3 ώρες κάθε εβδομάδα στον σχεδιασμό. Επιτέλους έχω χρόνο να παρατηρώ τους μαθητές μου αντί να γράφω σχέδια.',
    initial: 'Κ',
  },
  {
    role: 'Φιλόλογος — ιδιαίτερα',
    quote: 'Το προφίλ μαθητή άλλαξε τελείως τον τρόπο που δουλεύω. Κάθε σενάριο βγαίνει ήδη "ράψιμο" πάνω στις ανάγκες του παιδιού.',
    initial: 'Μ',
  },
  {
    role: 'Ειδικός παιδαγωγός',
    quote: 'Το πιο χρήσιμο εργαλείο για διαφοροποίηση — κάθε σενάριο έρχεται με συγκεκριμένες στρατηγικές για ΔΕΠΥ και δυσλεξία.',
    initial: 'Σ',
  },
]

const STEPS = [
  {
    n: '1',
    icon: '🎯',
    title: 'Επίλεξε τάξη, μάθημα και στόχο',
    body: 'Τάξη → μάθημα → στόχος ΑΠΣ (ή δικός σου). Για ιδιαίτερο: επίλεξε μαθητή από το προφίλ σου.',
  },
  {
    n: '2',
    icon: '⚡',
    title: 'Το Claude χτίζει το σενάριο',
    body: '4 παιδαγωγικές φάσεις, αναμενόμενα αποτελέσματα, κοινά λάθη και διαφοροποίηση — σε λιγότερο από 15 δευτερόλεπτα.',
  },
  {
    n: '3',
    icon: '📋',
    title: 'Αποθήκευσε · Χρησιμοποίησε · Βελτίωσε',
    body: 'Αξιολόγησε, κράτα σημειώσεις και επαναχρησιμοποίησε. Το σύστημα θυμάται και βελτιώνεται με κάθε μάθημα.',
  },
]

// ── Component helpers ─────────────────────────────────────────────

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold tracking-wide border border-sky-200">
      {children}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="text-gray-900 overflow-x-hidden">

      {/* ══════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════ */}
      <section className="relative bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 pt-24 pb-20 md:pt-32 md:pb-28 text-center">
          <Badge>🇬🇷 Φτιαγμένο για το ελληνικό σχολείο</Badge>

          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight">
            Το μάθημά σου,
            <br />
            <span className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">
              έτοιμο σε 15 δευτερόλεπτα.
            </span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Παιδαγωγικά τεκμηριωμένα σενάρια για <strong className="text-white">τάξη</strong> και <strong className="text-white">ιδιαίτερα</strong> —
            βασισμένα στο ΑΠΣ, με Vygotsky, Bloom και πλήρη διαφοροποίηση.
            Χωρίς copy-paste, χωρίς templates.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-base transition-colors shadow-lg shadow-sky-500/25"
            >
              Ξεκίνα δωρεάν →
            </Link>
            <Link
              href="/demo"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl border border-white/20 text-white font-medium text-base hover:bg-white/10 transition-colors"
            >
              Δες demo
            </Link>
          </div>

          <p className="mt-4 text-sm text-slate-400">
            3 σενάρια δωρεάν · Χωρίς πιστωτική κάρτα · Στα ελληνικά
          </p>

          {/* Stats strip */}
          <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span className="text-3xl font-extrabold text-white">{s.value}</span>
                <span className="mt-1 text-xs text-slate-400 leading-tight text-center">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          MODE SPLIT — Τάξη vs Ιδιαίτερο
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold">
              Ένα εργαλείο, <span className="text-sky-600">δύο κόσμοι</span>
            </h2>
            <p className="mt-3 text-gray-500 text-base max-w-xl mx-auto">
              Για το σχολείο και για το ιδιαίτερο — με την ίδια παιδαγωγική αρτιότητα.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Classroom card */}
            <div className="rounded-2xl border-2 border-sky-100 bg-sky-50 p-8">
              <div className="text-3xl mb-4">🏫</div>
              <h3 className="text-xl font-bold text-sky-900 mb-2">Μάθημα τάξης</h3>
              <p className="text-sky-800/80 text-sm leading-relaxed mb-5">
                Σενάριο <strong>35 λεπτών</strong> σε 4 φάσεις για ολόκληρη τάξη. Διαφοροποίηση για αδύναμους, μέσους και gifted. Εστίαση σε ομαδική μάθηση και scaffolding.
              </p>
              <ul className="space-y-2 text-sm text-sky-800">
                {['Ενεργοποίηση 5\'', 'Διερεύνηση 15\'', 'Εννοιολόγηση 10\'', 'Αξιολόγηση 5\''].map(p => (
                  <li key={p} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            {/* Tutoring card */}
            <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 p-8 relative overflow-hidden">
              <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-violet-600 text-white text-xs font-bold">
                ΝΕΟ
              </div>
              <div className="text-3xl mb-4">👤</div>
              <h3 className="text-xl font-bold text-violet-900 mb-2">Ιδιαίτερο μάθημα</h3>
              <p className="text-violet-800/80 text-sm leading-relaxed mb-5">
                Σενάριο <strong>60 λεπτών</strong> 1:1 με πλήρη εξατομίκευση. Δημιούργησε προφίλ μαθητή με δυνατά σημεία, δυσκολίες και μαθησιακό στυλ — το Claude προσαρμόζει τα πάντα.
              </p>
              <ul className="space-y-2 text-sm text-violet-800">
                {['Ενεργοποίηση 10\'', 'Διερεύνηση 25\'', 'Εννοιολόγηση 15\'', 'Αξιολόγηση 10\''].map(p => (
                  <li key={p} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          MOCK SCENARIO PREVIEW
      ══════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-3xl mx-auto px-4">
          <p className="text-center text-xs uppercase tracking-widest font-semibold text-gray-400 mb-6">
            Παράδειγμα εξόδου
          </p>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden">
            {/* Browser chrome */}
            <div className="bg-gray-100 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 mx-4 bg-white rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-400 text-center">
                eduprompt.gr/prompts/…
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Δ&apos; Δημοτικού · Μαθηματικά · Κλάσματα · <span className="text-violet-600 font-medium">Ιδιαίτερο — Μαρία Κ.</span></div>
                  <div className="text-lg font-bold text-gray-900">
                    Ισοδύναμα κλάσματα μέσω χειραπτικών υλικών
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-xs font-medium">Vygotsky (ZPD)</span>
                    <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-xs font-medium">Οπτικός μαθητής</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">60 λεπτά</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: "Φάση 1 · Ενεργοποίηση (10')", preview: 'Δείξε στη Μαρία 2 χάρτινες πίτσες — μία στα 4, μία στα 8 κομμάτια. «Αν πάρεις 2 κομμάτια από τη μία και 4 από την άλλη, ποιος πήρε περισσότερο;» Άσε χρόνο να σκεφτεί χωρίς υπόδειξη.' },
                  { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', label: "Φάση 2 · Διερεύνηση (25')", preview: 'Δώσε στη Μαρία έγχρωμες χάρτινες λωρίδες. Ζήτησέ της να βρει ζεύγη ισοδύναμων κλασμάτων με υπέρθεση. Χρησιμοποίησε το οπτικό της στυλ: φτιάξτε μαζί έναν τοίχο κλασμάτων στο τετράδιο…' },
                ].map(phase => (
                  <div
                    key={phase.label}
                    className="rounded-xl p-3.5 border-l-4"
                    style={{ background: phase.bg, borderColor: phase.color, borderWidth: '1px', borderLeftWidth: '4px', borderStyle: 'solid' }}
                  >
                    <div className="text-sm font-semibold mb-1" style={{ color: phase.color }}>{phase.label}</div>
                    <div className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{phase.preview}</div>
                  </div>
                ))}
                <div className="border border-dashed border-gray-200 rounded-xl p-3 text-center text-xs text-gray-400">
                  + Φάση 3 · Εννοιολόγηση (15′) &nbsp;·&nbsp; Φάση 4 · Αξιολόγηση (10′) &nbsp;·&nbsp; Κοινά λάθη &nbsp;·&nbsp; Υλικά
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 md:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold">Πώς λειτουργεί</h2>
            <p className="mt-3 text-gray-500 text-base max-w-xl mx-auto">
              Από τη φόρμα στο έτοιμο σενάριο σε τρία βήματα.
            </p>
          </div>

          <div className="relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-8 left-[calc(16.67%+1.25rem)] right-[calc(16.67%+1.25rem)] h-0.5 bg-gradient-to-r from-sky-200 via-violet-200 to-sky-200" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {STEPS.map((step, i) => (
                <div key={step.n} className="flex flex-col items-center text-center">
                  <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-md ${
                    i === 1 ? 'bg-gradient-to-br from-sky-500 to-violet-500' : 'bg-sky-600'
                  }`}>
                    {step.icon}
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border-2 border-sky-200 text-xs font-bold text-sky-700 flex items-center justify-center">
                      {step.n}
                    </span>
                  </div>
                  <h3 className="text-base font-bold mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FEATURES GRID
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-24 bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold">
              Ό,τι χρειάζεται ένας σύγχρονος εκπαιδευτικός
            </h2>
            <p className="mt-3 text-gray-500 text-base max-w-xl mx-auto">
              Όχι γεννήτορας κειμένου — παιδαγωγικό εργαλείο που ξέρει το ελληνικό σχολείο.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl bg-white border border-gray-200 p-6 hover:border-sky-300 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-base font-bold mb-2 text-gray-900">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          TESTIMONIALS
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold">
              Εμπιστεύονται το EduPrompt
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.role} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col">
                <div className="flex gap-0.5 mb-4">
                  {[1,2,3,4,5].map(i => (
                    <span key={i} className="text-amber-400">★</span>
                  ))}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed flex-1">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 font-bold text-sm flex items-center justify-center shrink-0">
                    {t.initial}
                  </div>
                  <span className="text-xs font-medium text-gray-500">{t.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          PRICING TEASER
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-24 bg-slate-50 border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-extrabold mb-3">Απλή τιμολόγηση</h2>
          <p className="text-gray-500 text-base mb-10">
            Ξεκίνα δωρεάν. Αναβάθμισε όταν χρειαστείς περισσότερα.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-w-lg mx-auto">
            {[
              { plan: 'Δωρεάν', price: '€0', detail: '3 σενάρια / μήνα', highlight: false, badge: '' },
              { plan: 'Pro', price: '€14,99', detail: '150 σενάρια / μήνα', highlight: true, badge: 'Δημοφιλές' },
            ].map((t) => (
              <div
                key={t.plan}
                className={`rounded-2xl border-2 p-6 text-left ${
                  t.highlight
                    ? 'border-sky-400 bg-gradient-to-br from-sky-50 to-blue-50 shadow-md'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {t.badge && (
                  <div className="text-xs font-bold text-sky-600 uppercase tracking-wide mb-2">{t.badge}</div>
                )}
                <div className="text-base font-bold mb-1">{t.plan}</div>
                <div className="text-3xl font-extrabold text-gray-900 mb-1">
                  {t.price}
                  {t.price !== '€0' && <span className="text-sm font-normal text-gray-500">/μήνα</span>}
                </div>
                <div className="text-xs text-gray-500">{t.detail}</div>
              </div>
            ))}
          </div>

          <Link href="/pricing" className="text-sm text-sky-600 font-semibold hover:underline">
            Δες πλήρη σύγκριση πλάνων →
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════════════ */}
      <section className="relative bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Ετοιμάσου για αύριο<br />σε 15 δευτερόλεπτα.
          </h2>
          <p className="text-slate-300 text-lg mb-8 max-w-xl mx-auto">
            Τάξη ή ιδιαίτερο — το EduPrompt έχει το σενάριο που χρειάζεσαι.
            Ξεκίνα δωρεάν, χωρίς πιστωτική κάρτα.
          </p>
          <Link
            href="/signup"
            className="inline-block px-8 py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-base transition-colors shadow-xl shadow-sky-500/30"
          >
            Δημιούργησε δωρεάν λογαριασμό →
          </Link>
          <p className="mt-4 text-sm text-slate-400">
            3 σενάρια δωρεάν · Χωρίς δέσμευση
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════ */}
      <footer className="bg-gray-950 text-gray-500 py-10">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <span className="font-bold text-white text-base">EduPrompt</span>
          <div className="flex flex-wrap justify-center gap-5">
            <Link href="/pricing"  className="hover:text-white transition-colors">Τιμές</Link>
            <Link href="/privacy"  className="hover:text-white transition-colors">Απόρρητο</Link>
            <Link href="/terms"    className="hover:text-white transition-colors">Όροι χρήσης</Link>
            <Link href="/login"    className="hover:text-white transition-colors">Σύνδεση</Link>
          </div>
          <span className="text-xs text-gray-600">© {new Date().getFullYear()} EduPrompt</span>
        </div>
      </footer>

    </div>
  )
}
