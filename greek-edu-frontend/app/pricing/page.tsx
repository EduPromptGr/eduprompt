// app/pricing/page.tsx — Pricing page (public, indexable)

import type { Metadata } from 'next'
import Link from 'next/link'
import CheckoutButton from './CheckoutButton'

export const metadata: Metadata = {
  title: 'Τιμές — EduPrompt',
  description:
    'Απλά και διαφανή τιμολόγια για δασκάλους και σχολεία. Ξεκίνα δωρεάν με 3 σενάρια τον μήνα.',
}

// ── Δεδομένα πλάνων ──────────────────────────────────────────────

const PLANS = [
  {
    id: 'free',
    name: 'Δωρεάν',
    price: '€0',
    priceSub: 'για πάντα',
    cta: 'Ξεκίνα δωρεάν',
    ctaHref: '/signup',        // plain Link — δεν χρειάζεται Stripe
    checkoutPlan: null as null | 'pro',
    highlight: false,
    badge: null,
    features: [
      '3 σενάρια / μήνα',
      '1 σενάριο / ημέρα',
      'Όλες οι θεωρίες & στρατηγικές',
      'Αποθήκευση σεναρίων',
      'Παιδαγωγικό ημερολόγιο',
      'Αξιολόγηση σεναρίων',
    ],
    notIncluded: [
      'Προφίλ τάξης',
      'Data-driven επιλογή θεωρίας',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '€14,99',
    priceSub: '/μήνα',
    cta: 'Ξεκίνα Pro',
    ctaHref: null,
    checkoutPlan: 'pro' as const,  // → CheckoutButton → /api/checkout
    highlight: true,
    badge: 'Δημοφιλές',
    features: [
      '150 σενάρια / μήνα',
      '12 σενάρια / ημέρα',
      'Όλες οι θεωρίες & στρατηγικές',
      'Αποθήκευση σεναρίων',
      'Παιδαγωγικό ημερολόγιο',
      'Αξιολόγηση σεναρίων',
      'Προφίλ τάξης (AI insights)',
      'Data-driven επιλογή θεωρίας',
      'Προτεραιότητα support',
    ],
    notIncluded: [],
  },
]

const FAQS = [
  {
    q: 'Χρειάζομαι πιστωτική κάρτα για το δωρεάν πλάνο;',
    a: 'Όχι. Εγγράφεσαι με email και κωδικό — χωρίς κάρτα, χωρίς δέσμευση.',
  },
  {
    q: 'Τι γίνεται αν ξεπεράσω το όριο σεναρίων;',
    a: 'Δεν χρεώνεσαι αυτόματα. Το σύστημα σου δείχνει φιλικό μήνυμα με επιλογή αναβάθμισης. Τα αποθηκευμένα σενάρια παραμένουν προσβάσιμα.',
  },
  {
    q: 'Μπορώ να ακυρώσω οποτεδήποτε;',
    a: 'Ναι. Ακύρωση με ένα κλικ από τις ρυθμίσεις. Δεν υπάρχει ελάχιστη διάρκεια συνδρομής.',
  },
  {
    q: 'Ποια δεδομένα κρατάτε;',
    a: 'Μόνο τα σενάρια που δημιουργείς, τις αξιολογήσεις σου και τα στοιχεία εγγραφής. Δεν πουλάμε δεδομένα σε τρίτους. Διάβασε την Πολιτική Απορρήτου για λεπτομέρειες.',
  },
]

// ── Page ─────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <div className="text-gray-900">

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <section className="bg-gradient-to-b from-sky-50 to-white border-b border-gray-100 py-16 md:py-20 text-center px-4">
        <h1 className="text-4xl font-bold mb-4">Απλά τιμολόγια, χωρίς εκπλήξεις</h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Ξεκίνα δωρεάν. Αναβάθμισε όταν χρειαστείς περισσότερα σενάρια.
          Ακύρωση οποτεδήποτε.
        </p>
      </section>

      {/* ══ PLANS ═══════════════════════════════════════════════ */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-2xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl border p-7 flex flex-col ${
                  plan.highlight
                    ? 'border-sky-400 bg-sky-50 shadow-md ring-1 ring-sky-300'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Badge */}
                <div className="h-5 mb-3">
                  {plan.badge && (
                    <span className="inline-block text-xs font-semibold text-sky-600 bg-sky-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {plan.badge}
                    </span>
                  )}
                </div>

                {/* Name + price */}
                <div className="mb-6">
                  <h2 className="text-xl font-bold mb-2">{plan.name}</h2>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-sm text-gray-500">{plan.priceSub}</span>
                  </div>
                </div>

                {/* CTA — free plan: plain Link, paid plans: CheckoutButton */}
                <div className="mb-7">
                  {plan.checkoutPlan ? (
                    <CheckoutButton
                      plan={plan.checkoutPlan}
                      label={plan.cta}
                      variant={plan.highlight ? 'primary' : 'dark'}
                    />
                  ) : (
                    <Link
                      href={plan.ctaHref!}
                      className="block w-full py-2.5 rounded-xl text-center text-sm font-semibold transition-colors bg-gray-900 text-white hover:bg-gray-700"
                    >
                      {plan.cta}
                    </Link>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                      <span className="text-gray-700">{f}</span>
                    </li>
                  ))}
                  {plan.notIncluded.map((f) => (
                    <li key={f} className="flex items-start gap-2 opacity-40">
                      <span className="text-gray-400 mt-0.5 shrink-0">✕</span>
                      <span className="text-gray-500 line-through">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ COMPARISON TABLE ════════════════════════════════════ */}
      <section className="py-16 px-4 bg-gray-50 border-y border-gray-100">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">Σύγκριση πλάνων</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 pr-6 font-semibold text-gray-700 w-1/2">Χαρακτηριστικό</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Δωρεάν</th>
                  <th className="text-center py-3 px-4 font-semibold text-sky-700 bg-sky-50 rounded-t-lg">Pro</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Σενάρια / μήνα', '3', '150'],
                  ['Σενάρια / ημέρα', '1', '12'],
                  ['Θεωρητικά πλαίσια', '✓', '✓'],
                  ['Στρατηγικές διδασκαλίας', '✓', '✓'],
                  ['Αποθήκευση σεναρίων', '✓', '✓'],
                  ['Παιδαγωγικό ημερολόγιο', '✓', '✓'],
                  ['Διαφοροποίηση τάξης', '✓', '✓'],
                  ['Προφίλ τάξης (AI insights)', '—', '✓'],
                  ['Data-driven θεωρία', '—', '✓'],
                  ['Προτεραιότητα support', '—', '✓'],
                ].map(([feature, free, pro]) => (
                  <tr key={feature} className="border-b border-gray-100 hover:bg-white transition-colors">
                    <td className="py-3 pr-6 text-gray-700">{feature}</td>
                    <td className="text-center py-3 px-4 text-gray-500">{free}</td>
                    <td className="text-center py-3 px-4 bg-sky-50 text-sky-700 font-medium">{pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══ FAQ ══════════════════════════════════════════════════ */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">Συχνές ερωτήσεις</h2>

          <div className="space-y-4">
            {FAQS.map((faq) => (
              <div
                key={faq.q}
                className="rounded-xl border border-gray-200 p-5"
              >
                <h3 className="text-base font-semibold mb-2">{faq.q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ BOTTOM CTA ══════════════════════════════════════════ */}
      <section className="bg-sky-600 py-16 px-4 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">
          Έτοιμος να δοκιμάσεις;
        </h2>
        <p className="text-sky-100 text-base mb-6">
          3 σενάρια δωρεάν — χωρίς πιστωτική κάρτα, χωρίς δεσμεύσεις.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3 max-w-sm mx-auto">
          <Link
            href="/signup"
            className="flex-1 px-7 py-3 rounded-xl bg-white text-sky-700 font-bold text-sm hover:bg-sky-50 transition-colors shadow text-center"
          >
            Ξεκίνα δωρεάν →
          </Link>
          <a
            href="mailto:hello@eduprompt.gr"
            className="flex-1 px-7 py-3 rounded-xl border border-sky-300 text-white font-medium text-sm hover:bg-sky-700 transition-colors text-center"
          >
            Ερωτήσεις;
          </a>
        </div>
      </section>

    </div>
  )
}
