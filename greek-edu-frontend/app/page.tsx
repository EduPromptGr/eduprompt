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

// ── Δεδομένα σελίδας (static, χωρίς DB) ─────────────────────────

const STEPS = [
  {
    n: '1',
    title: 'Διάλεξε τάξη, μάθημα και στόχο',
    body: 'Συμπλήρωσε τη φόρμα σε 30 δευτερόλεπτα. Επίλεξε προαιρετικά θεωρητικό πλαίσιο, στρατηγική και ειδικές ανάγκες της τάξης σου.',
  },
  {
    n: '2',
    title: 'Η ΤΝ χτίζει το σενάριο',
    body: 'Το σύστημα παράγει 4 παιδαγωγικές φάσεις, αναμενόμενα αποτελέσματα, κοινά λάθη μαθητών και οδηγίες διαφοροποίησης για όλα τα επίπεδα.',
  },
  {
    n: '3',
    title: 'Αποθήκευσε και χρησιμοποίησε αύριο στην τάξη',
    body: 'Αξιολόγησε, αποθήκευσε και κράτα ημερολόγιο παρατηρήσεων. Όσο χρησιμοποιείς την πλατφόρμα, τα σενάρια βελτιώνονται αυτόματα.',
  },
]

const FEATURES = [
  {
    icon: '🎓',
    title: 'Βασισμένο στο ελληνικό ΑΠΣ',
    body: 'Γνωρίζει τα μαθήματα, τις τάξεις και τους στόχους του Αναλυτικού Προγράμματος Σπουδών — δεν χρειάζεται να εξηγείς το πλαίσιο.',
  },
  {
    icon: '🧠',
    title: 'Παιδαγωγικές θεωρίες ενσωματωμένες',
    body: 'Vygotsky (ZPD), Bloom, Piaget, UDL, Gardner — επίλεξε ή άσε το σύστημα να επιλέξει βάσει αυτού που δούλεψε καλύτερα για το μάθημά σου.',
  },
  {
    icon: '🌈',
    title: 'Διαφοροποίηση για κάθε μαθητή',
    body: 'Κάθε σενάριο έχει ξεχωριστές οδηγίες για αδύναμους, μέσους και gifted. Υποστήριξη για δυσλεξία, ΔΕΠΥ, ΦΑΔ και άλλες ειδικές ανάγκες.',
  },
  {
    icon: '📓',
    title: 'Παιδαγωγικό ημερολόγιο',
    body: 'Γράψε τι πήγε καλά και τι όχι αμέσως μετά το μάθημα. Το σύστημα μαθαίνει από τις παρατηρήσεις σου και βελτιώνει τα επόμενα σενάρια.',
  },
  {
    icon: '🏫',
    title: 'Πλάνο για σχολεία',
    body: 'Μοιράσου πρόσβαση με όλους τους συναδέλφους σου. Κοινόχρηστο pool 400 σεναρίων/μήνα με ενιαία διαχείριση από τον διευθυντή.',
  },
  {
    icon: '⚡',
    title: 'Έτοιμο σε 15 δευτερόλεπτα',
    body: 'Χωρίς αναμονή, χωρίς templates, χωρίς copy-paste. Από τη φόρμα στο έτοιμο σενάριο σε λιγότερο από ένα λεπτό.',
  },
]

const PERSONAS = [
  {
    role: 'Δάσκαλος Δημοτικού',
    quote:
      'Εξοικονομώ 2-3 ώρες εβδομαδιαίως στον σχεδιασμό μαθημάτων. Επιτέλους έχω χρόνο να παρατηρώ τους μαθητές μου.',
  },
  {
    role: 'Ειδικός παιδαγωγός',
    quote:
      'Το πιο χρήσιμο εργαλείο για τη διαφοροποίηση — κάθε σενάριο έρχεται ήδη με στρατηγικές για ΔΕΠΥ και δυσλεξία.',
  },
  {
    role: 'Διευθυντής σχολείου',
    quote:
      'Δώσαμε πρόσβαση σε όλους τους δασκάλους. Η ποιότητα της προετοιμασίας ανέβηκε αισθητά μέσα στον πρώτο μήνα.',
  },
]

// ── Page ─────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="text-gray-900">

      {/* ══ HERO ══════════════════════════════════════════════════ */}
      <section className="bg-gradient-to-b from-sky-50 to-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-medium mb-6">
            <span>🇬🇷</span>
            <span>Φτιαγμένο για το ελληνικό ΑΠΣ</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
            Διδακτικά σενάρια
            <br />
            <span className="text-sky-600">έτοιμα σε 15 δευτερόλεπτα</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Παιδαγωγικά τεκμηριωμένα σενάρια για κάθε μάθημα του Δημοτικού.
            Βασισμένα στο ελληνικό ΑΠΣ, με Vygotsky, Bloom και διαφοροποίηση
            για κάθε μαθητή — χωρίς κόπο.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-600 text-white font-semibold text-base hover:bg-sky-700 transition-colors shadow-sm"
            >
              Ξεκίνα δωρεάν →
            </Link>
            <Link
              href="#how-it-works"
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-base hover:bg-gray-50 transition-colors"
            >
              Δες πώς λειτουργεί
            </Link>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            3 σενάρια δωρεάν · Χωρίς πιστωτική κάρτα · Στα ελληνικά
          </p>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 md:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold">Πώς λειτουργεί</h2>
            <p className="mt-3 text-gray-500 text-base max-w-xl mx-auto">
              Τρία βήματα και το σενάριό σου είναι έτοιμο να μπει στην τάξη.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.n} className="flex flex-col items-start">
                <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 font-bold text-base flex items-center justify-center mb-4 shrink-0">
                  {step.n}
                </div>
                <h3 className="text-base font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DEMO PREVIEW ══════════════════════════════════════════ */}
      <section className="bg-gray-50 border-y border-gray-100 py-14">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Fake browser chrome */}
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
            {/* Mock scenario */}
            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs text-gray-400 mb-1">Δ&apos; Δημοτικού · Μαθηματικά · Κλάσματα</div>
                <div className="text-lg font-bold text-gray-900">
                  Ανακάλυψη ισοδύναμων κλασμάτων μέσω χειραπτικών υλικών
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-xs font-medium">Vygotsky (ZPD)</span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-xs font-medium">Συνεργατική μάθηση</span>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Φάση 1 · Ενεργοποίηση (5\')', preview: 'Δείξε στους μαθητές 2 πίτσες ίδιου μεγέθους — μία κομμένη στα 4 και μία στα 8 κομμάτια. Ρώτα: «Αν πάρετε από τη μία 2 κομμάτια και από την άλλη 4 κομμάτια, ποιος πήρε περισσότερο;»' },
                  { label: 'Φάση 2 · Διερεύνηση (15\')', preview: 'Χωρίστε σε ομάδες 3 ατόμων. Κάθε ομάδα έχει κομμένες χάρτινες λωρίδες. Ζητήστε να βρουν ζεύγη ισοδύναμων κλασμάτων χρησιμοποιώντας υπέρθεση…' },
                ].map((phase) => (
                  <div key={phase.label} className="border border-gray-200 rounded-xl p-3 bg-white">
                    <div className="text-sm font-semibold text-gray-800 mb-1">{phase.label}</div>
                    <div className="text-xs text-gray-500 line-clamp-2">{phase.preview}</div>
                  </div>
                ))}
                <div className="border border-dashed border-gray-200 rounded-xl p-3 text-center text-xs text-gray-400">
                  + 2 ακόμα φάσεις · Κοινά λάθη · Διαφοροποίηση
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FEATURES ══════════════════════════════════════════════ */}
      <section className="py-20 md:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold">Ό,τι χρειάζεσαι για να σχεδιάσεις καλύτερα μαθήματα</h2>
            <p className="mt-3 text-gray-500 text-base max-w-xl mx-auto">
              Όχι απλός γεννήτορας κειμένου — παιδαγωγικό εργαλείο που ξέρει το ελληνικό σχολείο.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-sky-200 hover:shadow-sm transition-all"
              >
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PERSONAS / TESTIMONIALS ══════════════════════════════ */}
      <section className="bg-sky-50 border-y border-sky-100 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Για δασκάλους που θέλουν να κάνουν τη διαφορά</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PERSONAS.map((p) => (
              <div key={p.role} className="bg-white rounded-2xl border border-sky-100 p-6 shadow-sm">
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map((i) => (
                    <span key={i} className="text-amber-400 text-sm">★</span>
                  ))}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                  &ldquo;{p.quote}&rdquo;
                </p>
                <div className="text-xs font-medium text-gray-500">{p.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING TEASER ════════════════════════════════════════ */}
      <section className="py-20 md:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Απλά και διαφανή τιμολόγια</h2>
          <p className="text-gray-500 text-base mb-10">
            Ξεκίνα δωρεάν. Αναβάθμισε όταν χρειαστείς περισσότερα.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-w-xl mx-auto">
            {[
              { plan: 'Δωρεάν', price: '€0', detail: '3 σενάρια / μήνα', highlight: false },
              { plan: 'Pro', price: '€14,99', detail: '150 σενάρια / μήνα', highlight: true },
            ].map((t) => (
              <div
                key={t.plan}
                className={`rounded-2xl border p-6 ${
                  t.highlight
                    ? 'border-sky-400 bg-sky-50 shadow-sm'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {t.highlight && (
                  <div className="text-xs font-semibold text-sky-600 mb-2 uppercase tracking-wide">
                    Δημοφιλές
                  </div>
                )}
                <div className="text-base font-bold mb-1">{t.plan}</div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {t.price}
                  {t.price !== '€0' && <span className="text-sm font-normal text-gray-500">/μήνα</span>}
                </div>
                <div className="text-xs text-gray-500">{t.detail}</div>
              </div>
            ))}
          </div>

          <Link
            href="/pricing"
            className="text-sm text-sky-600 font-medium hover:underline"
          >
            Δες πλήρη σύγκριση πλάνων →
          </Link>
        </div>
      </section>

      {/* ══ FINAL CTA ════════════════════════════════════════════ */}
      <section className="bg-sky-600 py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ετοιμάσου για αύριο σε 15 δευτερόλεπτα
          </h2>
          <p className="text-sky-100 text-base mb-8 max-w-xl mx-auto">
            Ξεκίνα με 3 δωρεάν σενάρια. Δεν χρειάζεσαι πιστωτική κάρτα.
          </p>
          <Link
            href="/signup"
            className="inline-block px-8 py-3.5 rounded-xl bg-white text-sky-700 font-bold text-base hover:bg-sky-50 transition-colors shadow"
          >
            Δημιούργησε δωρεάν λογαριασμό →
          </Link>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════ */}
      <footer className="bg-gray-900 text-gray-400 py-10">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <span className="font-semibold text-white">EduPrompt</span>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/pricing" className="hover:text-white transition-colors">Τιμές</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Απόρρητο</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Όροι χρήσης</Link>
            <Link href="/login" className="hover:text-white transition-colors">Σύνδεση</Link>
          </div>
          <span className="text-xs">© {new Date().getFullYear()} EduPrompt</span>
        </div>
      </footer>

    </div>
  )
}
