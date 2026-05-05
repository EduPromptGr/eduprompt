"""
scripts/seed_curriculum_db.py

Σπέρνει το curriculum_objectives + curriculum_chunks tables με πραγματικά
δεδομένα ΑΠΣ (Αναλυτικό Πρόγραμμα Σπουδών) για το ελληνικό Δημοτικό.

Χρήση:
    python scripts/seed_curriculum_db.py
    python scripts/seed_curriculum_db.py --dry-run   # εμφανίζει χωρίς insert
    python scripts/seed_curriculum_db.py --truncate  # σβήνει και ξαναβάζει
    python scripts/seed_curriculum_db.py --grade Δ --subject Μαθηματικά

Χρειάζεται:
    SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY στο .env

Πηγή δεδομένων: ΑΠΣ/ΔΕΠΠΣ (ΦΕΚ 304/13-03-2003) + ΝΕΑΠΣ 2021 (Πιλοτικό)
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import uuid
from typing import Any

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


# ================================================================
# ΑΠΣ DATA
# Δομή: { grade: { subject: [ { unit, chapter, objective, keywords,
#                               objective_code, source, page_ref } ] } }
# ================================================================

CURRICULUM: dict[str, dict[str, list[dict[str, Any]]]] = {

    # ─────────────────────────────────────────────────────────────
    # Α' ΔΗΜΟΤΙΚΟΥ
    # ─────────────────────────────────────────────────────────────
    "Α": {
        "Μαθηματικά": [
            {
                "unit": "Αριθμοί",
                "chapter": "Αρίθμηση",
                "objective": "Να μετράει, αναγνωρίζει και γράφει τους αριθμούς 0-20",
                "keywords": ["αρίθμηση", "μέτρηση", "αριθμοί"],
                "objective_code": "ΜΑΘ-Α-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.12",
                "sort_order": 10,
            },
            {
                "unit": "Αριθμοί",
                "chapter": "Αρίθμηση",
                "objective": "Να συγκρίνει αριθμούς 0-20 με τα σύμβολα <, > και =",
                "keywords": ["σύγκριση", "αριθμοί", "σύμβολα"],
                "objective_code": "ΜΑΘ-Α-1.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.13",
                "sort_order": 20,
            },
            {
                "unit": "Πράξεις",
                "chapter": "Πρόσθεση",
                "objective": "Να εκτελεί προσθέσεις με αποτέλεσμα έως 20",
                "keywords": ["πρόσθεση", "άθροισμα", "πράξεις"],
                "objective_code": "ΜΑΘ-Α-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.20",
                "sort_order": 30,
            },
            {
                "unit": "Πράξεις",
                "chapter": "Αφαίρεση",
                "objective": "Να εκτελεί αφαιρέσεις με αριθμούς έως 20",
                "keywords": ["αφαίρεση", "διαφορά", "πράξεις"],
                "objective_code": "ΜΑΘ-Α-2.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.25",
                "sort_order": 40,
            },
            {
                "unit": "Γεωμετρία",
                "chapter": "Σχήματα",
                "objective": "Να αναγνωρίζει και ονομάζει βασικά γεωμετρικά σχήματα (κύκλος, τετράγωνο, τρίγωνο, ορθογώνιο)",
                "keywords": ["γεωμετρία", "σχήματα", "αναγνώριση"],
                "objective_code": "ΜΑΘ-Α-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.40",
                "sort_order": 50,
            },
        ],
        "Γλώσσα": [
            {
                "unit": "Ανάγνωση",
                "chapter": "Αποκωδικοποίηση",
                "objective": "Να αναγνωρίζει και αποκωδικοποιεί τα γράμματα του αλφαβήτου",
                "keywords": ["ανάγνωση", "γράμματα", "αλφάβητο"],
                "objective_code": "ΓΛΩ-Α-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.5",
                "sort_order": 10,
            },
            {
                "unit": "Ανάγνωση",
                "chapter": "Αποκωδικοποίηση",
                "objective": "Να διαβάζει απλές λέξεις και προτάσεις με σωστή προφορά",
                "keywords": ["ανάγνωση", "λέξεις", "προτάσεις"],
                "objective_code": "ΓΛΩ-Α-1.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.8",
                "sort_order": 20,
            },
            {
                "unit": "Γραφή",
                "chapter": "Ορθογραφία",
                "objective": "Να γράφει ορθογραφημένα απλές λέξεις του λεξιλογίου της τάξης",
                "keywords": ["γραφή", "ορθογραφία", "λεξιλόγιο"],
                "objective_code": "ΓΛΩ-Α-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.15",
                "sort_order": 30,
            },
            {
                "unit": "Επικοινωνία",
                "chapter": "Προφορικός λόγος",
                "objective": "Να συμμετέχει σε απλές συνομιλίες, να εκφράζει ανάγκες και συναισθήματα",
                "keywords": ["επικοινωνία", "προφορικός λόγος", "συνομιλία"],
                "objective_code": "ΓΛΩ-Α-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.22",
                "sort_order": 40,
            },
        ],
        "Μελέτη Περιβάλλοντος": [
            {
                "unit": "Εγώ και το σχολείο μου",
                "chapter": None,
                "objective": "Να γνωρίζει τους χώρους, τα πρόσωπα και τους κανόνες του σχολείου",
                "keywords": ["σχολείο", "κοινωνικοποίηση", "κανόνες"],
                "objective_code": "ΜΠΑ-Α-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.6",
                "sort_order": 10,
            },
            {
                "unit": "Φυσικό περιβάλλον",
                "chapter": "Εποχές",
                "objective": "Να αναγνωρίζει τα χαρακτηριστικά των τεσσάρων εποχών",
                "keywords": ["εποχές", "φύση", "καιρός"],
                "objective_code": "ΜΠΑ-Α-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.30",
                "sort_order": 20,
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────
    # Β' ΔΗΜΟΤΙΚΟΥ
    # ─────────────────────────────────────────────────────────────
    "Β": {
        "Μαθηματικά": [
            {
                "unit": "Αριθμοί",
                "chapter": "Αρίθμηση έως 100",
                "objective": "Να μετράει, γράφει και συγκρίνει αριθμούς έως 100",
                "keywords": ["αρίθμηση", "δεκάδες", "αριθμοί έως 100"],
                "objective_code": "ΜΑΘ-Β-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.10",
                "sort_order": 10,
            },
            {
                "unit": "Πράξεις",
                "chapter": "Πρόσθεση και Αφαίρεση",
                "objective": "Να εκτελεί προσθέσεις και αφαιρέσεις αριθμών έως 100",
                "keywords": ["πρόσθεση", "αφαίρεση", "δεκάδες"],
                "objective_code": "ΜΑΘ-Β-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.18",
                "sort_order": 20,
            },
            {
                "unit": "Πράξεις",
                "chapter": "Πολλαπλασιασμός",
                "objective": "Να κατανοεί την έννοια του πολλαπλασιασμού ως επαναλαμβανόμενη πρόσθεση",
                "keywords": ["πολλαπλασιασμός", "πίνακας", "επαναλαμβανόμενη πρόσθεση"],
                "objective_code": "ΜΑΘ-Β-2.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.35",
                "sort_order": 30,
            },
            {
                "unit": "Μέτρηση",
                "chapter": "Χρόνος",
                "objective": "Να διαβάζει το ρολόι (ακέραιες ώρες και μισάωρα)",
                "keywords": ["ρολόι", "χρόνος", "ώρες"],
                "objective_code": "ΜΑΘ-Β-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.50",
                "sort_order": 40,
            },
        ],
        "Γλώσσα": [
            {
                "unit": "Ανάγνωση",
                "chapter": "Κατανόηση κειμένου",
                "objective": "Να κατανοεί απλά αφηγηματικά κείμενα και να απαντά σε ερωτήσεις κατανόησης",
                "keywords": ["κατανόηση", "ανάγνωση", "αφηγηματικό κείμενο"],
                "objective_code": "ΓΛΩ-Β-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.10",
                "sort_order": 10,
            },
            {
                "unit": "Γραφή",
                "chapter": "Παραγωγή κειμένου",
                "objective": "Να γράφει απλές προτάσεις και μικρά κείμενα με αρχή και τέλος",
                "keywords": ["γραφή", "παραγωγή κειμένου", "προτάσεις"],
                "objective_code": "ΓΛΩ-Β-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.18",
                "sort_order": 20,
            },
            {
                "unit": "Γραμματική",
                "chapter": "Μέρη του λόγου",
                "objective": "Να αναγνωρίζει ουσιαστικά και ρήματα σε απλές προτάσεις",
                "keywords": ["γραμματική", "ουσιαστικά", "ρήματα", "μέρη λόγου"],
                "objective_code": "ΓΛΩ-Β-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.30",
                "sort_order": 30,
            },
        ],
        "Μελέτη Περιβάλλοντος": [
            {
                "unit": "Φυσικό περιβάλλον",
                "chapter": "Κύκλος του νερού",
                "objective": "Να εξηγεί τα στάδια του κύκλου του νερού (εξάτμιση, συμπύκνωση, κατακρήμνιση)",
                "keywords": ["κύκλος νερού", "εξάτμιση", "βροχή", "φύση"],
                "objective_code": "ΜΠΑ-Β-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.24",
                "sort_order": 10,
            },
            {
                "unit": "Κοινωνικό περιβάλλον",
                "chapter": "Οικογένεια",
                "objective": "Να περιγράφει τους ρόλους και τις σχέσεις στην οικογένεια",
                "keywords": ["οικογένεια", "ρόλοι", "σχέσεις"],
                "objective_code": "ΜΠΑ-Β-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.40",
                "sort_order": 20,
            },
            {
                "unit": "Φυσικό περιβάλλον",
                "chapter": "Φυτά και ζώα",
                "objective": "Να διακρίνει τα βασικά χαρακτηριστικά φυτών και ζώων και να τα ταξινομεί",
                "keywords": ["φυτά", "ζώα", "ταξινόμηση", "φύση"],
                "objective_code": "ΜΠΑ-Β-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.50",
                "sort_order": 30,
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────
    # Γ' ΔΗΜΟΤΙΚΟΥ
    # ─────────────────────────────────────────────────────────────
    "Γ": {
        "Μαθηματικά": [
            {
                "unit": "Αριθμοί",
                "chapter": "Αρίθμηση έως 1000",
                "objective": "Να αναγνωρίζει, γράφει και συγκρίνει αριθμούς έως 1000",
                "keywords": ["εκατοντάδες", "αρίθμηση", "αριθμοί έως 1000"],
                "objective_code": "ΜΑΘ-Γ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.8",
                "sort_order": 10,
            },
            {
                "unit": "Πράξεις",
                "chapter": "Πολλαπλασιασμός",
                "objective": "Να αποστηθίζει και χρησιμοποιεί τον πίνακα πολλαπλασιασμού (1-10)",
                "keywords": ["πίνακας πολλαπλασιασμού", "αποστήθιση", "πολλαπλάσια"],
                "objective_code": "ΜΑΘ-Γ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.25",
                "sort_order": 20,
            },
            {
                "unit": "Πράξεις",
                "chapter": "Διαίρεση",
                "objective": "Να κατανοεί την έννοια της διαίρεσης και να εκτελεί απλές διαιρέσεις",
                "keywords": ["διαίρεση", "διαιρέτης", "πηλίκο"],
                "objective_code": "ΜΑΘ-Γ-2.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.38",
                "sort_order": 30,
            },
            {
                "unit": "Κλάσματα",
                "chapter": "Εισαγωγή στα κλάσματα",
                "objective": "Να κατανοεί την έννοια του κλάσματος ως μέρος ενός όλου",
                "keywords": ["κλάσματα", "μισό", "τέταρτο", "τρίτο"],
                "objective_code": "ΜΑΘ-Γ-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.55",
                "sort_order": 40,
            },
            {
                "unit": "Γεωμετρία",
                "chapter": "Γωνίες",
                "objective": "Να αναγνωρίζει και ονομάζει ορθή, οξεία και αμβλεία γωνία",
                "keywords": ["γωνίες", "ορθή", "οξεία", "αμβλεία", "γεωμετρία"],
                "objective_code": "ΜΑΘ-Γ-4.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.65",
                "sort_order": 50,
            },
        ],
        "Γλώσσα": [
            {
                "unit": "Ανάγνωση",
                "chapter": "Κατανόηση κειμένου",
                "objective": "Να κατανοεί πληροφοριακά και λογοτεχνικά κείμενα, εντοπίζοντας κεντρική ιδέα και λεπτομέρειες",
                "keywords": ["κατανόηση", "πληροφοριακό κείμενο", "λογοτεχνικό κείμενο"],
                "objective_code": "ΓΛΩ-Γ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.8",
                "sort_order": 10,
            },
            {
                "unit": "Γραφή",
                "chapter": "Παραγωγή κειμένου",
                "objective": "Να γράφει κείμενα με αρχή, μέση και τέλος, χρησιμοποιώντας συνδετικές λέξεις",
                "keywords": ["παραγωγή κειμένου", "δομή", "συνδετικές λέξεις"],
                "objective_code": "ΓΛΩ-Γ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.20",
                "sort_order": 20,
            },
            {
                "unit": "Γραμματική",
                "chapter": "Ουσιαστικά",
                "objective": "Να κλίνει ουσιαστικά α' και β' κλίσης στον ενικό και πληθυντικό",
                "keywords": ["ουσιαστικά", "κλίση", "γένος", "αριθμός"],
                "objective_code": "ΓΛΩ-Γ-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.35",
                "sort_order": 30,
            },
            {
                "unit": "Γραμματική",
                "chapter": "Ρήματα",
                "objective": "Να συζυγεί ρήματα α' συζυγίας στον ενεστώτα και αόριστο",
                "keywords": ["ρήματα", "συζυγία", "ενεστώτας", "αόριστος"],
                "objective_code": "ΓΛΩ-Γ-3.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.42",
                "sort_order": 40,
            },
        ],
        "Ιστορία": [
            {
                "unit": "Μυθολογία",
                "chapter": "Αρχαία Ελλάδα",
                "objective": "Να γνωρίζει βασικούς μύθους της ελληνικής μυθολογίας και τις αξίες που εκφράζουν",
                "keywords": ["μυθολογία", "αρχαία Ελλάδα", "μύθοι", "θεοί"],
                "objective_code": "ΙΣΤ-Γ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.10",
                "sort_order": 10,
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────
    # Δ' ΔΗΜΟΤΙΚΟΥ
    # ─────────────────────────────────────────────────────────────
    "Δ": {
        "Μαθηματικά": [
            {
                "unit": "Αριθμοί",
                "chapter": "Αρίθμηση",
                "objective": "Να αναγνωρίζει, γράφει και συγκρίνει αριθμούς έως 1.000.000",
                "keywords": ["εκατομμύριο", "αρίθμηση", "θέσεις αριθμού"],
                "objective_code": "ΜΑΘ-Δ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.10",
                "sort_order": 10,
            },
            {
                "unit": "Πράξεις",
                "chapter": "Πολλαπλασιασμός",
                "objective": "Να εκτελεί πολλαπλασιασμό πολυψήφιων αριθμών",
                "keywords": ["πολλαπλασιασμός", "πολυψήφιοι", "αλγόριθμος"],
                "objective_code": "ΜΑΘ-Δ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.22",
                "sort_order": 20,
            },
            {
                "unit": "Πράξεις",
                "chapter": "Διαίρεση",
                "objective": "Να εκτελεί διαίρεση πολυψήφιων αριθμών με διψήφιο διαιρέτη",
                "keywords": ["διαίρεση", "πολυψήφιοι", "υπόλοιπο"],
                "objective_code": "ΜΑΘ-Δ-2.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.35",
                "sort_order": 30,
            },
            {
                "unit": "Κλάσματα",
                "chapter": "Ισοδύναμα κλάσματα",
                "objective": "Να αναγνωρίζει και παράγει ισοδύναμα κλάσματα",
                "keywords": ["ισοδύναμα κλάσματα", "απλοποίηση", "επέκταση"],
                "objective_code": "ΜΑΘ-Δ-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.50",
                "sort_order": 40,
            },
            {
                "unit": "Κλάσματα",
                "chapter": "Πράξεις με κλάσματα",
                "objective": "Να εκτελεί πρόσθεση και αφαίρεση ομόνομων κλασμάτων",
                "keywords": ["κλάσματα", "πρόσθεση", "αφαίρεση", "ομόνομα"],
                "objective_code": "ΜΑΘ-Δ-3.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.55",
                "sort_order": 50,
            },
            {
                "unit": "Γεωμετρία",
                "chapter": "Τρίγωνα",
                "objective": "Να αναγνωρίζει και ταξινομεί τρίγωνα βάσει πλευρών και γωνιών",
                "keywords": ["τρίγωνα", "ισόπλευρο", "ισοσκελές", "σκαληνό", "γεωμετρία"],
                "objective_code": "ΜΑΘ-Δ-4.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.65",
                "sort_order": 60,
            },
            {
                "unit": "Γεωμετρία",
                "chapter": "Περίμετρος",
                "objective": "Να υπολογίζει την περίμετρο πολυγώνων",
                "keywords": ["περίμετρος", "πολύγωνα", "μέτρηση"],
                "objective_code": "ΜΑΘ-Δ-4.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.72",
                "sort_order": 70,
            },
            {
                "unit": "Δεδομένα",
                "chapter": "Γραφήματα",
                "objective": "Να διαβάζει και κατασκευάζει απλά γραφήματα (ράβδων, εικονογράμματα)",
                "keywords": ["γραφήματα", "δεδομένα", "ράβδοι", "στατιστική"],
                "objective_code": "ΜΑΘ-Δ-5.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.80",
                "sort_order": 80,
            },
        ],
        "Γλώσσα": [
            {
                "unit": "Ανάγνωση",
                "chapter": "Κειμενικά είδη",
                "objective": "Να κατανοεί και να διακρίνει αφηγηματικά, περιγραφικά και πληροφοριακά κείμενα",
                "keywords": ["κειμενικά είδη", "αφηγηματικό", "περιγραφικό", "πληροφοριακό"],
                "objective_code": "ΓΛΩ-Δ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.8",
                "sort_order": 10,
            },
            {
                "unit": "Γραφή",
                "chapter": "Παραγωγή κειμένου",
                "objective": "Να γράφει περιγραφικά κείμενα με ζωντανές λεπτομέρειες και κατάλληλο λεξιλόγιο",
                "keywords": ["περιγραφή", "λεπτομέρειες", "λεξιλόγιο", "γραφή"],
                "objective_code": "ΓΛΩ-Δ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.20",
                "sort_order": 20,
            },
            {
                "unit": "Γραμματική",
                "chapter": "Επίθετα",
                "objective": "Να αναγνωρίζει και χρησιμοποιεί επίθετα στους τρεις βαθμούς σύγκρισης",
                "keywords": ["επίθετα", "θετικός", "συγκριτικός", "υπερθετικός"],
                "objective_code": "ΓΛΩ-Δ-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.35",
                "sort_order": 30,
            },
            {
                "unit": "Γραμματική",
                "chapter": "Ρήματα",
                "objective": "Να αναγνωρίζει και χρησιμοποιεί χρόνους ρημάτων (ενεστώτας, παρατατικός, αόριστος, μέλλοντας)",
                "keywords": ["χρόνοι ρημάτων", "ενεστώτας", "παρατατικός", "αόριστος"],
                "objective_code": "ΓΛΩ-Δ-3.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.45",
                "sort_order": 40,
            },
        ],
        "Ιστορία": [
            {
                "unit": "Προϊστορική περίοδος",
                "chapter": "Πρώτοι άνθρωποι",
                "objective": "Να περιγράφει τον τρόπο ζωής των πρώτων ανθρώπων (τροφοσυλλογή, εργαλεία, κατοικία)",
                "keywords": ["προϊστορία", "πρώτοι άνθρωποι", "εργαλεία", "σπήλαια"],
                "objective_code": "ΙΣΤ-Δ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.12",
                "sort_order": 10,
            },
            {
                "unit": "Αρχαία Ελλάδα",
                "chapter": "Πόλεις-Κράτη",
                "objective": "Να γνωρίζει τα χαρακτηριστικά των αρχαίων ελληνικών πόλεων-κρατών (Αθήνα, Σπάρτη)",
                "keywords": ["πόλεις κράτη", "Αθήνα", "Σπάρτη", "πολίτης"],
                "objective_code": "ΙΣΤ-Δ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.30",
                "sort_order": 20,
            },
            {
                "unit": "Αρχαία Ελλάδα",
                "chapter": "Περσικοί Πόλεμοι",
                "objective": "Να αφηγείται τα κύρια γεγονότα των Περσικών Πολέμων (Μαραθώνας, Θερμοπύλες, Σαλαμίνα)",
                "keywords": ["Περσικοί Πόλεμοι", "Μαραθώνας", "Θερμοπύλες", "Σαλαμίνα"],
                "objective_code": "ΙΣΤ-Δ-2.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.40",
                "sort_order": 30,
            },
        ],
        "Γεωγραφία": [
            {
                "unit": "Χάρτες",
                "chapter": "Ανάγνωση χάρτη",
                "objective": "Να διαβάζει χάρτες χρησιμοποιώντας υπόμνημα, κλίμακα και προσανατολισμό",
                "keywords": ["χάρτες", "υπόμνημα", "κλίμακα", "προσανατολισμός"],
                "objective_code": "ΓΕΩ-Δ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.8",
                "sort_order": 10,
            },
            {
                "unit": "Ελλάδα",
                "chapter": "Γεωγραφικές περιοχές",
                "objective": "Να εντοπίζει και περιγράφει τις γεωγραφικές περιοχές της Ελλάδας",
                "keywords": ["Ελλάδα", "περιοχές", "γεωγραφία", "νησιά"],
                "objective_code": "ΓΕΩ-Δ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.20",
                "sort_order": 20,
            },
        ],
        "Φυσική": [
            {
                "unit": "Ύλη",
                "chapter": "Καταστάσεις ύλης",
                "objective": "Να περιγράφει τις τρεις καταστάσεις της ύλης και τις μεταβολές μεταξύ τους",
                "keywords": ["ύλη", "στερεό", "υγρό", "αέριο", "τήξη", "εξάτμιση"],
                "objective_code": "ΦΥΣ-Δ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.10",
                "sort_order": 10,
            },
            {
                "unit": "Ενέργεια",
                "chapter": "Θερμότητα",
                "objective": "Να εξηγεί τη μεταφορά θερμότητας και τη χρήση θερμομέτρου",
                "keywords": ["θερμότητα", "θερμοκρασία", "θερμόμετρο", "αγωγιμότητα"],
                "objective_code": "ΦΥΣ-Δ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.25",
                "sort_order": 20,
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────
    # Ε' ΔΗΜΟΤΙΚΟΥ
    # ─────────────────────────────────────────────────────────────
    "Ε": {
        "Μαθηματικά": [
            {
                "unit": "Δεκαδικοί αριθμοί",
                "chapter": "Εισαγωγή",
                "objective": "Να κατανοεί και χρησιμοποιεί δεκαδικούς αριθμούς με δύο δεκαδικά ψηφία",
                "keywords": ["δεκαδικοί", "δεκαδικά ψηφία", "μονάδα", "δέκατο", "εκατοστό"],
                "objective_code": "ΜΑΘ-Ε-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.8",
                "sort_order": 10,
            },
            {
                "unit": "Πράξεις με δεκαδικούς",
                "chapter": "Πρόσθεση/Αφαίρεση",
                "objective": "Να εκτελεί πρόσθεση και αφαίρεση δεκαδικών αριθμών",
                "keywords": ["δεκαδικοί", "πρόσθεση", "αφαίρεση"],
                "objective_code": "ΜΑΘ-Ε-1.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.18",
                "sort_order": 20,
            },
            {
                "unit": "Εμβαδόν",
                "chapter": "Εμβαδόν ορθογωνίου",
                "objective": "Να υπολογίζει το εμβαδόν ορθογωνίου, τετραγώνου και ανάγει μονάδες εμβαδού",
                "keywords": ["εμβαδόν", "ορθογώνιο", "τετράγωνο", "τ.μ."],
                "objective_code": "ΜΑΘ-Ε-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.55",
                "sort_order": 30,
            },
            {
                "unit": "Αναλογίες",
                "chapter": "Εισαγωγή",
                "objective": "Να κατανοεί την έννοια της αναλογίας και να λύνει απλά προβλήματα τριών",
                "keywords": ["αναλογίες", "κανόνας τριών", "ποσοστά"],
                "objective_code": "ΜΑΘ-Ε-4.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.70",
                "sort_order": 40,
            },
        ],
        "Ιστορία": [
            {
                "unit": "Βυζαντινή Αυτοκρατορία",
                "chapter": "Ίδρυση και ακμή",
                "objective": "Να γνωρίζει τη δημιουργία και τα χαρακτηριστικά της Βυζαντινής Αυτοκρατορίας",
                "keywords": ["Βυζάντιο", "Κωνσταντινούπολη", "αυτοκρατορία", "χριστιανισμός"],
                "objective_code": "ΙΣΤ-Ε-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.15",
                "sort_order": 10,
            },
            {
                "unit": "Βυζαντινή Αυτοκρατορία",
                "chapter": "Πολιτισμός",
                "objective": "Να περιγράφει στοιχεία του βυζαντινού πολιτισμού (τέχνη, μουσική, αρχιτεκτονική)",
                "keywords": ["βυζαντινός πολιτισμός", "εκκλησία", "ψηφιδωτά", "μουσική"],
                "objective_code": "ΙΣΤ-Ε-1.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.25",
                "sort_order": 20,
            },
        ],
        "Φυσική": [
            {
                "unit": "Ηλεκτρισμός",
                "chapter": "Ηλεκτρικό κύκλωμα",
                "objective": "Να κατανοεί την έννοια του ηλεκτρικού κυκλώματος και να κατασκευάζει απλά κυκλώματα",
                "keywords": ["ηλεκτρισμός", "κύκλωμα", "μπαταρία", "αγωγοί"],
                "objective_code": "ΦΥΣ-Ε-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.12",
                "sort_order": 10,
            },
            {
                "unit": "Φως και Ήχος",
                "chapter": "Φως",
                "objective": "Να εξηγεί τη διάδοση, ανάκλαση και διάθλαση φωτός",
                "keywords": ["φως", "ανάκλαση", "διάθλαση", "σκιά"],
                "objective_code": "ΦΥΣ-Ε-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.30",
                "sort_order": 20,
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────
    # ΣΤ' ΔΗΜΟΤΙΚΟΥ
    # ─────────────────────────────────────────────────────────────
    "ΣΤ": {
        "Μαθηματικά": [
            {
                "unit": "Αριθμοί",
                "chapter": "Ρητοί αριθμοί",
                "objective": "Να κατανοεί και εκτελεί πράξεις με θετικούς και αρνητικούς αριθμούς",
                "keywords": ["ρητοί", "αρνητικοί", "αξονας", "θετικοί"],
                "objective_code": "ΜΑΘ-ΣΤ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.8",
                "sort_order": 10,
            },
            {
                "unit": "Γεωμετρία",
                "chapter": "Κύκλος",
                "objective": "Να υπολογίζει περίμετρο και εμβαδόν κύκλου",
                "keywords": ["κύκλος", "ακτίνα", "διάμετρος", "π (πι)", "εμβαδόν"],
                "objective_code": "ΜΑΘ-ΣΤ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.50",
                "sort_order": 20,
            },
            {
                "unit": "Ποσοστά",
                "chapter": "Εισαγωγή",
                "objective": "Να κατανοεί και υπολογίζει ποσοστά σε πρακτικές καταστάσεις",
                "keywords": ["ποσοστά", "επί τοις εκατό", "εκπτώσεις", "τόκοι"],
                "objective_code": "ΜΑΘ-ΣΤ-3.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.65",
                "sort_order": 30,
            },
            {
                "unit": "Στατιστική",
                "chapter": "Βασικές έννοιες",
                "objective": "Να υπολογίζει μέση τιμή, διάμεσο, επικρατούσα τιμή σε σύνολα δεδομένων",
                "keywords": ["στατιστική", "μέση τιμή", "διάμεσος", "επικρατούσα"],
                "objective_code": "ΜΑΘ-ΣΤ-4.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.80",
                "sort_order": 40,
            },
        ],
        "Ιστορία": [
            {
                "unit": "Νεότερη Ελλάδα",
                "chapter": "Επανάσταση 1821",
                "objective": "Να αφηγείται τα αίτια, τα γεγονότα και τα αποτελέσματα της Ελληνικής Επανάστασης",
                "keywords": ["1821", "επανάσταση", "Κολοκοτρώνης", "ανεξαρτησία"],
                "objective_code": "ΙΣΤ-ΣΤ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.15",
                "sort_order": 10,
            },
            {
                "unit": "Νεότερη Ελλάδα",
                "chapter": "Σύγχρονη Ελλάδα",
                "objective": "Να γνωρίζει σημαντικά γεγονότα της σύγχρονης ελληνικής ιστορίας (20ος αιώνας)",
                "keywords": ["σύγχρονη ιστορία", "20ος αιώνας", "Β' Παγκόσμιος", "ΕΟΚ"],
                "objective_code": "ΙΣΤ-ΣΤ-1.2",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.40",
                "sort_order": 20,
            },
        ],
        "Φυσική": [
            {
                "unit": "Δυνάμεις",
                "chapter": "Εισαγωγή",
                "objective": "Να αναγνωρίζει και μετράει δυνάμεις (βάρος, άνωση, τριβή)",
                "keywords": ["δυνάμεις", "βάρος", "άνωση", "τριβή", "νευτώνιο"],
                "objective_code": "ΦΥΣ-ΣΤ-1.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.10",
                "sort_order": 10,
            },
            {
                "unit": "Απλές μηχανές",
                "chapter": None,
                "objective": "Να κατανοεί τη λειτουργία απλών μηχανών (μοχλός, τροχαλία, επίπεδο)",
                "keywords": ["απλές μηχανές", "μοχλός", "τροχαλία", "επίπεδο"],
                "objective_code": "ΦΥΣ-ΣΤ-2.1",
                "source": "ΑΠΣ-2021",
                "page_ref": "σ.30",
                "sort_order": 20,
            },
        ],
    },
}


def _build_objectives_rows() -> list[dict[str, Any]]:
    """Μετατρέπει το CURRICULUM dict σε list of DB rows."""
    rows: list[dict[str, Any]] = []
    for grade, subjects in CURRICULUM.items():
        for subject, objectives in subjects.items():
            for obj in objectives:
                rows.append({
                    "id": str(uuid.uuid4()),
                    "grade": grade,
                    "subject": subject,
                    "unit": obj.get("unit"),
                    "chapter": obj.get("chapter"),
                    "objective": obj["objective"],
                    "objective_code": obj.get("objective_code"),
                    "keywords": obj.get("keywords", []),
                    "source": obj.get("source", "ΑΠΣ-2021"),
                    "page_ref": obj.get("page_ref"),
                    "sort_order": obj.get("sort_order", 0),
                })
    return rows


def _build_chunks_rows(objectives: list[dict]) -> list[dict[str, Any]]:
    """
    Φτιάχνει curriculum_chunks από objectives.
    Κάθε objective γίνεται ένα chunk με enriched content για καλύτερο embedding.
    """
    rows: list[dict[str, Any]] = []
    for obj in objectives:
        grade   = obj["grade"]
        subject = obj["subject"]
        unit    = obj.get("unit", "")
        chapter = obj.get("chapter", "")
        code    = obj.get("objective_code", "")
        kws     = ", ".join(obj.get("keywords", []))

        # Enriched content: δίνει context στον embedder
        content_parts = [
            f"Τάξη: {grade}' Δημοτικού | Μάθημα: {subject}",
        ]
        if unit:
            content_parts.append(f"Ενότητα: {unit}")
        if chapter:
            content_parts.append(f"Κεφάλαιο: {chapter}")
        content_parts.append(f"Μαθησιακός Στόχος: {obj['objective']}")
        if kws:
            content_parts.append(f"Λέξεις-κλειδιά: {kws}")

        source_parts = [f"ΑΠΣ-2021-{grade}-{subject[:3].upper()}"]
        if obj.get("page_ref"):
            source_parts.append(obj["page_ref"])

        rows.append({
            "id": str(uuid.uuid4()),
            "grade": grade,
            "subject": subject,
            "unit": unit or None,
            "chapter": chapter or None,
            "content": "\n".join(content_parts),
            "source": "-".join(source_parts),
            "chunk_type": "objective",
        })
    return rows


def seed(dry_run: bool = False, truncate: bool = False,
         grade_filter: str | None = None, subject_filter: str | None = None) -> None:
    from supabase import create_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)

    db = create_client(url, key)

    objectives = _build_objectives_rows()
    chunks     = _build_chunks_rows(objectives)

    # Apply filters
    if grade_filter:
        objectives = [r for r in objectives if r["grade"] == grade_filter]
        chunks     = [r for r in chunks     if r["grade"] == grade_filter]
    if subject_filter:
        objectives = [r for r in objectives if r["subject"] == subject_filter]
        chunks     = [r for r in chunks     if r["subject"] == subject_filter]

    logger.info("Objectives to seed: %d", len(objectives))
    logger.info("Chunks to seed:     %d", len(chunks))

    if dry_run:
        logger.info("DRY RUN — no DB writes")
        for r in objectives[:3]:
            logger.info("  sample objective: %s | %s | %s",
                        r["grade"], r["subject"], r["objective"][:60])
        return

    if truncate:
        if grade_filter or subject_filter:
            # Targeted delete
            q1 = db.table("curriculum_objectives").delete()
            q2 = db.table("curriculum_chunks").delete()
            if grade_filter:
                q1 = q1.eq("grade", grade_filter)
                q2 = q2.eq("grade", grade_filter)
            if subject_filter:
                q1 = q1.eq("subject", subject_filter)
                q2 = q2.eq("subject", subject_filter)
            q1.execute()
            q2.execute()
        else:
            db.table("curriculum_objectives").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            db.table("curriculum_chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        logger.info("Truncated existing data")

    # Insert in batches of 100
    BATCH = 100
    for i in range(0, len(objectives), BATCH):
        batch = objectives[i:i + BATCH]
        try:
            db.table("curriculum_objectives").upsert(batch).execute()
            logger.info("  objectives inserted: %d-%d", i + 1, i + len(batch))
        except Exception as e:
            logger.error("objectives insert failed at batch %d: %s", i, e)
            raise

    for i in range(0, len(chunks), BATCH):
        batch = chunks[i:i + BATCH]
        try:
            db.table("curriculum_chunks").upsert(batch).execute()
            logger.info("  chunks inserted: %d-%d", i + 1, i + len(batch))
        except Exception as e:
            logger.error("chunks insert failed at batch %d: %s", i, e)
            raise

    logger.info("✅  Seed complete: %d objectives, %d chunks", len(objectives), len(chunks))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed ΑΠΣ curriculum data")
    parser.add_argument("--dry-run",  action="store_true", help="Εκτύπωσε χωρίς insert")
    parser.add_argument("--truncate", action="store_true", help="Σβήσε και ξαναβάλε")
    parser.add_argument("--grade",    help="Φίλτρο τάξης π.χ. Δ")
    parser.add_argument("--subject",  help="Φίλτρο μαθήματος π.χ. Μαθηματικά")
    args = parser.parse_args()

    seed(
        dry_run=args.dry_run,
        truncate=args.truncate,
        grade_filter=args.grade,
        subject_filter=args.subject,
    )
