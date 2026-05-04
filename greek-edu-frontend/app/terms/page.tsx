// app/terms/page.tsx — Όροι Χρήσης

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Όροι Χρήσης — EduPrompt',
  description: 'Όροι χρήσης της πλατφόρμας EduPrompt για δασκάλους Δημοτικού.',
}

const LAST_UPDATED = '1 Μαΐου 2026'

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-sky-600 hover:underline">
          ← Αρχική
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Όροι Χρήσης</h1>
      <p className="text-sm text-gray-500 mb-10">
        Τελευταία ενημέρωση: {LAST_UPDATED}
      </p>

      <div className="space-y-8 text-sm leading-relaxed text-gray-700">

        <Section title="1. Αποδοχή Όρων">
          <p>
            Χρησιμοποιώντας την πλατφόρμα EduPrompt αποδέχεσαι τους παρόντες Όρους Χρήσης.
            Αν διαφωνείς, παρακαλούμε να μην χρησιμοποιήσεις την υπηρεσία.
          </p>
        </Section>

        <Section title="2. Περιγραφή Υπηρεσίας">
          <p>
            Η EduPrompt παρέχει εργαλείο AI-υποστηριζόμενης δημιουργίας παιδαγωγικών
            σεναρίων διδασκαλίας για δασκάλους Δημοτικού, βασισμένο στο ελληνικό
            Αναλυτικό Πρόγραμμα Σπουδών. Τα παραγόμενα σενάρια αποτελούν προτάσεις
            και δεν υποκαθιστούν την επαγγελματική κρίση του εκπαιδευτικού.
          </p>
        </Section>

        <Section title="3. Λογαριασμός Χρήστη">
          <ul className="list-disc pl-5 space-y-2">
            <li>Πρέπει να είσαι τουλάχιστον 18 ετών για να δημιουργήσεις λογαριασμό.</li>
            <li>Είσαι υπεύθυνος για την ασφάλεια του κωδικού σου.</li>
            <li>Δεν επιτρέπεται κοινοποίηση λογαριασμού με τρίτους (εκτός από το πλάνο Σχολείου).</li>
            <li>Ειδοποίησέ μας αμέσως σε περίπτωση μη εξουσιοδοτημένης χρήσης.</li>
          </ul>
        </Section>

        <Section title="4. Συνδρομές και Πληρωμές">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Οι πληρωμές γίνονται μέσω Stripe και ανανεώνονται αυτόματα κάθε μήνα.
            </li>
            <li>
              Μπορείς να ακυρώσεις οποτεδήποτε — η ακύρωση ισχύει από την επόμενη
              περίοδο χρέωσης.
            </li>
            <li>
              Δεν υπάρχει επιστροφή χρημάτων για ήδη χρεωμένες περιόδους, εκτός αν
              υπήρξε τεχνικό πρόβλημα από μεριά μας.
            </li>
            <li>
              Διατηρούμε το δικαίωμα αλλαγής τιμών με 30 ημέρες προειδοποίηση.
            </li>
          </ul>
        </Section>

        <Section title="5. Αποδεκτή Χρήση">
          <p>Αναλαμβάνεις να μη χρησιμοποιείς την υπηρεσία για:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Δημιουργία παράνομου, προσβλητικού ή παραπλανητικού περιεχομένου</li>
            <li>Μαζική αυτοματοποιημένη χρήση (scraping, bots)</li>
            <li>Μεταπώληση ή επαναδιανομή σεναρίων χωρίς άδεια</li>
            <li>Οποιαδήποτε χρήση που παραβιάζει ελληνική ή ευρωπαϊκή νομοθεσία</li>
          </ul>
        </Section>

        <Section title="6. Πνευματική Ιδιοκτησία">
          <p>
            Τα παραγόμενα σενάρια ανήκουν σε εσένα. Η EduPrompt διατηρεί το δικαίωμα
            χρήσης ανωνύμων, συγκεντρωτικών δεδομένων για βελτίωση της υπηρεσίας.
            Ο κώδικας, το design και η επωνυμία EduPrompt ανήκουν αποκλειστικά σε εμάς.
          </p>
        </Section>

        <Section title="7. Αποποίηση Ευθύνης">
          <p>
            Τα παραγόμενα σενάρια δημιουργούνται από AI και παρέχονται{' '}
            <strong>«ως έχουν»</strong>. Η EduPrompt δεν εγγυάται παιδαγωγική
            αρτιότητα για κάθε περίπτωση. Ο εκπαιδευτικός φέρει την αποκλειστική
            ευθύνη για την τελική χρήση στην τάξη.
          </p>
          <p className="mt-2">
            Η συνολική ευθύνη μας περιορίζεται στο ποσό που έχεις καταβάλει τους
            τελευταίους 3 μήνες.
          </p>
        </Section>

        <Section title="8. Τερματισμός">
          <p>
            Διατηρούμε το δικαίωμα αναστολής ή τερματισμού λογαριασμού σε περίπτωση
            παραβίασης των παρόντων όρων, με άμεση ισχύ και χωρίς προηγούμενη ειδοποίηση
            σε σοβαρές παραβάσεις.
          </p>
        </Section>

        <Section title="9. Εφαρμοστέο Δίκαιο">
          <p>
            Οι παρόντες όροι διέπονται από το ελληνικό δίκαιο. Αρμόδια δικαστήρια
            ορίζονται τα δικαστήρια της Αθήνας.
          </p>
        </Section>

        <Section title="10. Επικοινωνία">
          <p>
            Για οποιαδήποτε απορία σχετικά με τους Όρους Χρήσης:{' '}
            <a href="mailto:hello@eduprompt.gr" className="text-sky-600 hover:underline">
              hello@eduprompt.gr
            </a>
          </p>
        </Section>

      </div>

      <div className="mt-12 pt-8 border-t border-gray-200 flex gap-4 text-sm">
        <Link href="/privacy" className="text-sky-600 hover:underline">
          Πολιτική Απορρήτου
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
