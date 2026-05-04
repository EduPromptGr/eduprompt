// tests/e2e/global.setup.ts
//
// Runs ONCE before all authenticated tests.
// Logs in with E2E_TEST_EMAIL / E2E_TEST_PASSWORD and saves
// browser storage state to .auth/user.json so subsequent test
// projects can reuse the session without re-logging-in each time.
//
// If env vars are missing the setup is skipped gracefully —
// authenticated tests will still run but will be redirected to /login
// (which is itself a valid test assertion in anon specs).

import { test as setup, expect } from '@playwright/test'
import path from 'path'

const AUTH_FILE = path.join(process.cwd(), '.auth', 'user.json')

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  if (!email || !password) {
    console.warn(
      '[setup] E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — saving empty auth state. ' +
      'Authenticated tests will redirect to /login.',
    )
    // Αποθήκευσε κενό state ώστε να μη σπάσει το --storage-state dependency
    await page.context().storageState({ path: AUTH_FILE })
    return
  }

  // ── 1. Πήγαινε στη σελίδα login ────────────────────────────────
  await page.goto('/login')
  await expect(page).toHaveTitle(/EduPrompt|Σύνδεση/i)

  // ── 2. Συμπλήρωσε credentials ──────────────────────────────────
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)

  // ── 3. Submit ───────────────────────────────────────────────────
  await page.click('button[type="submit"]')

  // ── 4. Επαλήθευσε ότι φτάσαμε στο /generate (ή /dashboard) ────
  await page.waitForURL(/\/(generate|dashboard|school)/, { timeout: 15_000 })

  // ── 5. Αποθήκευσε το session state ─────────────────────────────
  await page.context().storageState({ path: AUTH_FILE })
  console.log('[setup] Auth state saved to', AUTH_FILE)
})
