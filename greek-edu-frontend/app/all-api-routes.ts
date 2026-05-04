// ⚠️ DEPRECATED — αυτό το αρχείο έχει αντικατασταθεί.
//
// Το αρχικό bundle περιείχε 6 Next.js route handlers σε ένα αρχείο,
// κάτι που δεν υποστηρίζεται από το App Router. Κάθε endpoint
// πρέπει να είναι σε δικό του `route.ts` με export name `GET`/`POST`.
//
// Νέες θέσεις:
//   /api/referral/validate   → app/api/referral/validate/route.ts
//   /api/referral/reward     → app/api/referral/reward/route.ts
//   /api/school/invite       → app/api/school/invite/route.ts
//   /api/school/join         → app/api/school/join/route.ts
//   /api/school/report       → app/api/school/report/route.ts
//   /api/subscription/pause  → app/api/subscription/pause/route.ts
//
// Μπορεί να διαγραφεί μετά από επιβεβαίωση ότι δεν υπάρχουν imports
// προς αυτό το path από άλλα αρχεία.
//
// Audit ref: C-1
export {}
