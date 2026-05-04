// playwright.config.ts
//
// Playwright E2E configuration για EduPrompt.
//
// Χρήση:
//   npm run test:e2e              -- headless, όλα τα tests
//   npm run test:e2e:ui           -- Playwright UI mode (visual runner)
//   npm run test:e2e:debug        -- step-by-step debug mode
//   npx playwright test --headed  -- με browser ανοιχτό
//
// Env vars για E2E:
//   BASE_URL               (default: http://localhost:3000)
//   E2E_TEST_EMAIL         email δοκιμαστικού χρήστη (Pro plan)
//   E2E_TEST_PASSWORD      κωδικός δοκιμαστικού χρήστη
//   E2E_FREE_EMAIL         email δοκιμαστικού χρήστη (free plan)
//   E2E_FREE_PASSWORD      κωδικός δοκιμαστικού χρήστη (free)

import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export default defineConfig({
  // Βρες tests στο tests/e2e/
  testDir: './tests/e2e',

  // Αγνόησε unit/render tests (*.mjs, *.render.mjs)
  testMatch: '**/*.spec.ts',

  // Timeout per test — 30s αρκετό για SSR pages
  timeout: 30_000,

  // Timeout για expect assertions
  expect: {
    timeout: 10_000,
  },

  // Κάθε test file τρέχει παράλληλα, αλλά tests εντός file σειριακά
  // (κρίσιμο όταν tests σε ίδιο file μοιράζονται login state)
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,

  // Επαναλαμβάνουμε αποτυχημένα tests 1 φορά σε CI
  retries: process.env.CI ? 1 : 0,

  // Reporter
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

  use: {
    // Base URL για page.goto('/generate') κλπ.
    baseURL: BASE_URL,

    // Κρατάμε trace σε αποτυχία για debug
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Locale — εμφάνιση Ελληνικών dates / messages
    locale: 'el-GR',
    timezoneId: 'Europe/Athens',
  },

  projects: [
    // ── Setup project: δημιουργεί authenticated state ───────────
    // Τρέχει πρώτο, αποθηκεύει cookies/storage στο .auth/
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // ── Desktop Chromium (κύριο target deploy: Vercel → Chrome) ──
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Authenticated tests χρησιμοποιούν τον αποθηκευμένο state
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
      // Τρέχει tests που χρειάζονται auth
      testMatch: /(?!.*\.anon\.).*\.spec\.ts/,
    },

    // ── Anon tests (δεν χρειάζονται login) ───────────────────────
    // Τρέχουν χωρίς να εξαρτώνται από το setup
    {
      name: 'chromium-anon',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*\.anon\.spec\.ts/,
    },

    // ── Mobile (Pixel 5) για responsive checks ────────────────────
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
      testMatch: /(?!.*\.anon\.).*\.spec\.ts/,
    },
  ],

  // Ξεκίνα next dev αν δεν τρέχει ήδη (local μόνο — CI έχει ήδη server)
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
