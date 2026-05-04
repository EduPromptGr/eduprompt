// app/api/demo-generate/route.ts
//
// Mock endpoint για τη σελίδα /demo. Δεν χρειάζεται auth.
// Επιστρέφει ένα ρεαλιστικό ελληνικό παιδαγωγικό σενάριο
// βασισμένο στα inputs της φόρμας.
// Προσομοιώνει τον χρόνο απόκρισης του πραγματικού backend (2-3δλ).

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

interface DemoRequest {
  grade: string
  subject: string
  unit?: string
  chapter?: string
  objective: string
  theory?: string
  strategy?: string
  environments?: string[]
}

function pickTheory(req: DemoRequest): string {
  if (req.theory) return req.theory
  const map: Record<string, string> = {
    'Μαθηματικά': 'Vygotsky (ZPD)',
    'Γλώσσα': 'Bloom',
    'Ιστορία': 'Dewey',
    'Φυσική': 'Piaget',
    'Γεωγραφία': 'Gardner (MI)',
    'Μελέτη Περιβάλλοντος': 'UDL',
  }
  return map[req.subject] ?? 'Vygotsky (ZPD)'
}

function pickStrategy(req: DemoRequest): string {
  if (req.strategy) return req.strategy
  return 'Συνεργατική Μάθηση'
}

function buildScenario(req: DemoRequest) {
  const theory = pickTheory(req)
  const strategy = pickStrategy(req)
  const gradeLabel = `${req.grade}' Δημοτικού`
  const unitInfo = req.unit ? ` — Ενότητα: ${req.unit}` : ''
  const chapterInfo = req.chapter ? ` / Κεφ: ${req.chapter}` : ''
  const hasSpecialNeeds = (req.environments ?? []).length > 0
  const envList = req.environments ?? []

  return {
    id: 'demo-' + Math.random().toString(36).slice(2, 10),
    grade: req.grade,
    subject: req.subject,
    unit: req.unit,
    chapter: req.chapter,
    objective: req.objective,
    theory,
    strategy,
    duration_minutes: 45,
    context: `${gradeLabel} · ${req.subject}${unitInfo}${chapterInfo}`,
    content: {
      learning_objectives: [
        `Να κατανοήσουν οι μαθητές την έννοια και τη σημασία: ${req.objective.slice(0, 80)}`,
        `Να αναπτύξουν κριτική σκέψη μέσω ερωτημάτων ανώτερης τάξης (${theory})`,
        `Να συνεργαστούν σε ομάδες για επίλυση αυθεντικών προβλημάτων`,
        `Να αξιολογήσουν τη δική τους μάθηση μέσω αυτό-αξιολόγησης`,
      ],
      phases: [
        {
          name: '🔵 Φάση 1 — Ενεργοποίηση Προϋπάρχουσας Γνώσης',
          duration: '10 λεπτά',
          teacher_actions: [
            `Εισαγωγή με ερώτηση-αγκύρωση: «Τι γνωρίζετε ήδη για ${req.subject};»`,
            `Παρουσίαση εικόνας/βίντεο που συνδέει τη νέα γνώση με την καθημερινή ζωή`,
            `Καταγραφή απαντήσεων στον πίνακα — brain dump χωρίς κριτική`,
          ],
          student_activities: [
            'Μαθητές μοιράζονται προηγούμενες εμπειρίες σε ζεύγη (Think-Pair-Share)',
            `Συμπληρώνουν το KWL Chart: Τι Ξέρω / Τι Θέλω να μάθω / Τι Έμαθα`,
          ],
          materials: ['Διαδραστικός πίνακας', 'Φύλλο KWL', 'Post-it notes'],
        },
        {
          name: '🟡 Φάση 2 — Διδασκαλία Νέας Γνώσης',
          duration: '15 λεπτά',
          teacher_actions: [
            `Παρουσίαση βασικών εννοιών με χρήση ${theory}: σκαλωσιά (scaffolding) σε 3 επίπεδα δυσκολίας`,
            `Επίδειξη με εκφωνημένη σκέψη (think-aloud): «Σκέφτομαι δυνατά…»`,
            `Διατύπωση ερωτήσεων Bloom: γνώση → κατανόηση → εφαρμογή → ανάλυση`,
          ],
          student_activities: [
            'Σημειώνουν βασικά σημεία στο σχολικό τετράδιο',
            'Επιλύουν 2 καθοδηγούμενα παραδείγματα δίπλα στον εκπαιδευτικό',
            'Διατυπώνουν δικές τους ερωτήσεις («Αναρωτιέμαι γιατί…»)',
          ],
          materials: ['Παρουσίαση slides', 'Σχολικό βιβλίο', 'Χειραπτικά υλικά'],
        },
        {
          name: '🟠 Φάση 3 — Συνεργατική Εφαρμογή',
          duration: '15 λεπτά',
          teacher_actions: [
            `Οργάνωση σε ετερογενείς ομάδες 3-4 ατόμων (${strategy})`,
            'Αναθέτει ρόλους: Συντονιστής, Γραμματέας, Παρουσιαστής, Ελεγκτής',
            'Κυκλοφορεί, παρατηρεί, δίνει ανατροφοδότηση χωρίς να δίνει απαντήσεις',
          ],
          student_activities: [
            'Επιλύουν αυθεντικό πρόβλημα σχετικό με την καθημερινή ζωή',
            'Τεκμηριώνουν τη σκέψη τους γραπτά (show your work)',
            'Παρουσιάζουν τη λύση τους στην ολομέλεια',
          ],
          materials: ['Φύλλο εργασίας ομάδας', 'Markers & χαρτόνι', 'Ψηφιακή συσκευή (προαιρετικό)'],
        },
        {
          name: '🟢 Φάση 4 — Αξιολόγηση & Ανακλαστική Σκέψη',
          duration: '5 λεπτά',
          teacher_actions: [
            'Exit Ticket: 1 ερώτηση που ελέγχει τον κεντρικό στόχο',
            'Συμπλήρωση στήλης «Τι Έμαθα» στο KWL Chart',
            'Προεπισκόπηση επόμενου μαθήματος — bridge για συνέχεια',
          ],
          student_activities: [
            'Γράφουν 1 πράγμα που έμαθαν, 1 ερώτηση που έχουν ακόμα',
            'Αυτο-αξιολόγηση με traffic light: 🟢 κατάλαβα / 🟡 χρειάζομαι βοήθεια / 🔴 δεν κατάλαβα',
          ],
          materials: ['Exit ticket (μικρό χαρτάκι ή ψηφιακό)', 'Traffic light cards'],
        },
      ],
      differentiation: {
        struggling: [
          'Απλοποιημένο φύλλο εργασίας με οδηγούς (sentence starters)',
          'Ζεύγωμα με πιο ισχυρό μαθητή (peer tutoring)',
          'Χρήση χειραπτικών υλικών για απτή κατανόηση',
          ...(envList.includes('Μαθησιακές Δυσκολίες (Δυσλεξία)') ? ['Κείμενο σε γραμματοσειρά OpenDyslexic, διπλό διάστιχο'] : []),
          ...(envList.includes('ΔΕΠΥ') ? ['Κατάτμηση σε μικρά βήματα, συχνές αλλαγές δραστηριότητας (5-7 λεπτά)'] : []),
        ],
        advanced: [
          'Πρόβλημα επέκτασης: εφαρμογή σε πραγματικό σενάριο',
          'Ρόλος «εκπαιδευτή ομάδας» για ενίσχυση μεταγνώσης',
          'Δημιουργία δικού τους προβλήματος για τους συμμαθητές',
        ],
        special_needs: [
          ...(envList.includes('Φάσμα Αυτισμού (ΦΑΔ)') ? ['Οπτικό χρονόμετρο, σαφής δομή, προειδοποίηση αλλαγής δραστηριότητας'] : []),
          ...(envList.includes('Κινητικές Δυσκολίες') ? ['Ψηφιακή εκδοχή φύλλου εργασίας, εργαλεία προσβασιμότητας'] : []),
          ...(envList.includes('Προσφυγικό / Μεταναστευτικό Υπόβαθρο') ? ['Οπτικά λεξιλόγιο (word wall με εικόνες), δίγλωσση υποστήριξη'] : []),
          ...(envList.includes('Υψηλή Επίδοση (Gifted)') ? ['Curriculum compacting: παρακάμπτουν βασικές ασκήσεις, εστιάζουν σε ανοιχτά προβλήματα'] : []),
          'Ευέλικτη θέση στην τάξη ανάλογα ανάγκης',
        ].filter(Boolean),
        assessment: [
          'Παρατήρηση κατά τη συνεργατική φάση (checklist συμπεριφορών)',
          'Exit Ticket (ποσοτική + ποιοτική αξιολόγηση)',
          'Portfolio: αποθήκευση φύλλου εργασίας για αξιολόγηση προόδου',
          'Ανατροφοδότηση εντός 24ωρου — εστίαση σε διαδικασία, όχι αποτέλεσμα',
        ],
      },
      materials_full: [
        'Διαδραστικός πίνακας ή projector',
        'Φύλλο KWL (ένα ανά μαθητή)',
        'Φύλλο εργασίας ομάδας (1 ανά ομάδα)',
        'Post-it notes (3 χρώματα)',
        'Traffic light cards ή αυτοκόλλητα',
        'Exit ticket (A6 χαρτάκια ή Google Forms)',
        'Markers & χαρτόνι flip-chart',
        ...(hasSpecialNeeds ? ['Χειραπτικά υλικά για διαφοροποίηση'] : []),
      ],
      rag_sources: [
        { title: 'ΦΕΚ — Αναλυτικό Πρόγραμμα Σπουδών Δημοτικού', relevance: 0.94 },
        { title: `Vygotsky, L.S. (1978). Mind in Society — ZPD και Scaffolding`, relevance: 0.91 },
        { title: 'Bloom, B. (1956). Taxonomy of Educational Objectives', relevance: 0.87 },
        { title: 'ΥΠ.Π.Ε.Θ. — Οδηγός Εκπαιδευτικού για Διαφοροποιημένη Διδασκαλία', relevance: 0.83 },
      ],
    },
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as DemoRequest

  // Simulate LLM generation time
  await new Promise((r) => setTimeout(r, 2800))

  const scenario = buildScenario(body)

  return NextResponse.json(scenario, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
