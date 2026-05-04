// app/privacy/page.tsx — Πολιτική Απορρήτου (GDPR)

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Πολιτική Απορρήτου — EduPrompt',
  description: 'Πολιτική απορρήτου και προστασίας προσωπικών δεδομένων της EduPrompt.',
}

const LAST_UPDATED = '1 Μαΐου 2026'

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-sky-600 hover:underline">
          ← Αρχική
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        Πολιτική Απορρήτου
      </h1>
      <p className="text-sm text-gray-500 mb-10">
        Τελευταία ενημέρωση: {LAST_UPDATED}
      </p>

      <div className="prose prose-gray max-w-none space-y-8 text-sm leading-relaxed text-gray-700">

        <Section title="1. Υπεύθυνος Επεξεργασίας">
          <p>
            Υπεύθυνος επεξεργασίας των δεδομένων σου είναι η <strong>EduPrompt</strong>,
            με έδρα την Ελλάδα. Για οποιοδήποτε ζήτημα σχετικά με τα προσωπικά σου
            δεδομένα, επικοινώνησε μαζί μας στο{' '}
            <a href="mailto:hello@eduprompt.gr" className="text-sky-600 hover:underline">
              hello@eduprompt.gr
            </a>.
          </p>
        </Section>

        <Section title="2. Ποια δεδομένα συλλέγουμε">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Στοιχεία λογαριασμού:</strong> email και κωδικός (αποθηκευμένος
              hashed μέσω Supabase Auth).
            </li>
            <li>
              <strong>Δεδομένα χρήσης:</strong> τα διδακτικά σενάρια που δημιουργείς,
              οι αξιολογήσεις, τα αποθηκευμένα σενάρια και οι εγγραφές ημερολογίου.
            </li>
            <li>
              <strong>Τεχνικά δεδομένα:</strong> τύπος συνδρομής, ημερομηνία εγγραφής,
              αριθμός χρήσης (για rate limiting). Δεν συλλέγουμε IP διευθύνσεις ή
              device fingerprints.
            </li>
            <li>
              <strong>Δεδομένα πληρωμής:</strong> δεν αποθηκεύουμε αριθμούς καρτών —
              η επεξεργασία γίνεται αποκλειστικά από τη Stripe.
            </li>
          </ul>
        </Section>

        <Section title="3. Γιατί χρησιμοποιούμε τα δεδομένα σου">
          <ul className="list-disc pl-5 space-y-2">
            <li>Παροχή της υπηρεσίας (δημιουργία σεναρίων, αποθήκευση, ημερολόγιο)</li>
            <li>Επικοινωνία σχετικά με τον λογαριασμό σου (επιβεβαίωση email, αποδείξεις)</li>
            <li>Βελτίωση της ποιότητας των σεναρίων βάσει ανωνύμων στατιστικών χρήσης</li>
            <li>Τιμολόγηση και διαχείριση συνδρομής μέσω Stripe</li>
          </ul>
          <p className="mt-3">
            <strong>Δεν</strong> χρησιμοποιούμε τα δεδομένα σου για διαφημίσεις,
            δεν τα πουλάμε σε τρίτους και δεν τα χρησιμοποιούμε για εκπαίδευση
            γενικών AI μοντέλων χωρίς τη συγκατάθεσή σου.
          </p>
        </Section>

        <Section title="4. Νομική βάση επεξεργασίας (GDPR)">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Εκτέλεση σύμβασης (άρθρο 6§1β):</strong> τα δεδομένα είναι
              απαραίτητα για την παροχή της υπηρεσίας.
            </li>
            <li>
              <strong>Έννομο συμφέρον (άρθρο 6§1στ):</strong> για βελτίωση της
              υπηρεσίας με ανωνύμα στατιστικά.
            </li>
            <li>
              <strong>Συγκατάθεση (άρθρο 6§1α):</strong> για marketing emails,
              αν επιλέξεις να τα λαμβάνεις.
            </li>
          </ul>
        </Section>

        <Section title="5. Τρίτοι πάροχοι">
          <p>Χρησιμοποιούμε τους παρακάτω αξιόπιστους παρόχους:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Supabase</strong> — βάση δεδομένων και authentication (EU servers)</li>
            <li><strong>Stripe</strong> — επεξεργασία πληρωμών (PCI DSS Level 1)</li>
            <li><strong>Resend</strong> — αποστολή email (transactional only)</li>
            <li><strong>Anthropic / OpenAI</strong> — δημιουργία σεναρίων (data δεν χρησιμοποιείται για εκπαίδευση)</li>
            <li><strong>Vercel / Railway</strong> — hosting υποδομής</li>
          </ul>
        </Section>

        <Section title="6. Διατήρηση δεδομένων">
          <p>
            Κρατάμε τα δεδομένα σου όσο ο λογαριασμός είναι ενεργός. Αν διαγράψεις
            τον λογαριασμό σου, τα προσωπικά σου δεδομένα διαγράφονται εντός 30 ημερών.
            Ανωνύμα στατιστικά χρήσης (χωρίς σύνδεση με το πρόσωπό σου) ενδέχεται
            να παραμείνουν για λόγους βελτίωσης της υπηρεσίας.
          </p>
        </Section>

        <Section title="7. Τα δικαιώματά σου">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Πρόσβαση:</strong> μπορείς να ζητήσεις αντίγραφο των δεδομένων σου.</li>
            <li><strong>Διόρθωση:</strong> μπορείς να διορθώσεις ανακριβή δεδομένα.</li>
            <li><strong>Διαγραφή:</strong> μπορείς να ζητήσεις διαγραφή λογαριασμού και δεδομένων.</li>
            <li><strong>Φορητότητα:</strong> μπορείς να λάβεις τα δεδομένα σου σε machine-readable μορφή.</li>
            <li><strong>Εναντίωση:</strong> μπορείς να αντιταχθείς σε επεξεργασία βάσει εννόμου συμφέροντος.</li>
          </ul>
          <p className="mt-3">
            Για άσκηση οποιουδήποτε δικαιώματος, επικοινώνησε στο{' '}
            <a href="mailto:hello@eduprompt.gr" className="text-sky-600 hover:underline">
              hello@eduprompt.gr
            </a>
            . Έχεις επίσης δικαίωμα καταγγελίας στην{' '}
            <strong>Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (ΑΠΔΠΧ)</strong>.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            Χρησιμοποιούμε μόνο <strong>απαραίτητα cookies</strong> για τη διαχείριση
            session (Supabase Auth). Δεν χρησιμοποιούμε cookies παρακολούθησης ή
            διαφημιστικά cookies.
          </p>
        </Section>

        <Section title="9. Αλλαγές στην Πολιτική">
          <p>
            Σε περίπτωση ουσιαστικής αλλαγής, θα σου στείλουμε email 30 ημέρες πριν.
            Η συνέχιση χρήσης της υπηρεσίας μετά την ενημέρωση αποτελεί αποδοχή.
          </p>
        </Section>

      </div>

      <div className="mt-12 pt-8 border-t border-gray-200 flex gap-4 text-sm">
        <Link href="/terms" className="text-sky-600 hover:underline">
          Όροι Χρήσης
        </Link>
        <Link href="/" className="text-gray-500 hover:underline">
          Αρχική
        </Link>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}
