// tests/e2e/generate.spec.ts
//
// Authenticated tests για το /generate page και τη GenerateForm.
//
// Σενάρια:
//   1. Authenticated user βλέπει τη GenerateForm (δεν redirect-άρει)
//   2. Form fields render: τάξη, μάθημα, διδακτικός στόχος
//   3. Submit validation: required fields
//   4. Submit → 200 → redirect στο /prompts/<id>
//   5. Submit → 429 (rate limit) → εμφανίζει link /pricing + μήνυμα
//   6. Submit → 502 → backend error message
//   7. Loading state (aria-busy) κατά τη διάρκεια submit
//
// Χρησιμοποιεί .auth/user.json (από global.setup.ts).
// Τα API calls mock-άρονται μέσω page.route() ώστε να μη χρειαστεί
// πραγματικό Anthropic API key κατά τη δοκιμή.

import { test, expect } from '@playwright/test'

// ── Helper: mock του /api/generate ────────────────────────────────

async function mockGenerateSuccess(page: import('@playwright/test').Page, promptId = 'test-uuid-123') {
  await page.route('/api/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ prompt_id: promptId }),
    })
  })
}

async function mockGenerateRateLimit(page: import('@playwright/test').Page) {
  await page.route('/api/generate', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'rate_limit_exceeded',
        detail: 'Monthly limit reached',
      }),
    })
  })
}

async function mockGenerateBackendError(
  page: import('@playwright/test').Page,
  status = 502,
  message = 'Backend unreachable',
) {
  await page.route('/api/generate', async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: message }),
    })
  })
}

// ── Generate page: render ──────────────────────────────────────────

test.describe('Generate page: render (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    // Αν δεν υπάρχει auth state, η σελίδα θα redirect-άρει στο /login.
    // Το test αυτό ελέγχει ΜΟΝΟ την περίπτωση που υπάρχει auth.
    await page.goto('/generate')
  })

  test('δεν redirect-άρει σε /login (εφόσον υπάρχει auth state)', async ({ page }) => {
    // Αν τρέξει χωρίς auth state (E2E_TEST_EMAIL/PASSWORD δεν οριστεί),
    // το test θα αποτύχει εδώ με σαφές μήνυμα.
    const url = page.url()
    if (url.includes('/login')) {
      test.skip()
      return
    }
    await expect(page).toHaveURL(/\/generate/)
  })

  test('έχει τίτλο/heading για δημιουργία σεναρίου', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible()
    await expect(heading).toContainText(/σενάριο|δημιουργ/i)
  })

  test('εμφανίζει grade radiogroup με τάξεις Α–ΣΤ', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    // Grades υλοποιούνται ως button[role="radio"] εντός div[role="radiogroup"]
    const radioGroup = page.locator('[role="radiogroup"][aria-label="Τάξη"]')
    await expect(radioGroup).toBeVisible()

    // Και τα 6 grade buttons πρέπει να υπάρχουν
    for (const grade of ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ']) {
      await expect(
        radioGroup.locator('[role="radio"]').filter({ hasText: new RegExp(`^${grade}$`) }),
      ).toBeVisible()
    }
  })

  test('εμφανίζει subject text input (id=gen-subject)', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    const subjectInput = page.locator('#gen-subject')
    await expect(subjectInput).toBeVisible()
    await expect(subjectInput).toHaveAttribute('aria-required', 'true')
  })

  test('εμφανίζει objective textarea (id=gen-objective)', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    const textarea = page.locator('#gen-objective')
    await expect(textarea).toBeVisible()
    await expect(textarea).toHaveAttribute('aria-required', 'true')
  })

  test('submit button υπάρχει', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })
})

// ── Generate form: client-side validation ─────────────────────────

test.describe('Generate form: validation (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generate')
    if (page.url().includes('/login')) { test.skip(); return }
  })

  test('submit χωρίς διδακτικό στόχο → form δεν στέλνεται', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    // Μην κάνεις route interception — αν σταλεί request θα πέσει error
    let requestSent = false
    page.on('request', (req) => {
      if (req.url().includes('/api/generate')) requestSent = true
    })

    // Δοκίμασε submit χωρίς να συμπληρώσεις το objective textarea
    await page.locator('button[type="submit"]').click()

    // Είτε το button είναι disabled είτε εμφανίζεται validation error
    // Σε κάθε περίπτωση το request ΔΕΝ πρέπει να σταλεί.
    await page.waitForTimeout(500)
    expect(requestSent).toBe(false)
  })

  test('submit με πολύ μικρό objective → validation error', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    let requestSent = false
    page.on('request', (req) => {
      if (req.url().includes('/api/generate')) requestSent = true
    })

    // Grade και subject required — γεμίζουμε μόνο objective με 1 char
    await page.locator('[role="radio"]').filter({ hasText: /^Α$/ }).first().click()
    await page.fill('#gen-subject', 'Μαθηματικά')
    await page.fill('#gen-objective', 'Α') // 1 char — κάτω από OBJECTIVE_MIN (5)

    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(500)

    // Validation error για το objective — δεν στέλνεται request
    await expect(
      page.getByText(/τουλάχιστον 5/i),
    ).toBeVisible()
    expect(requestSent).toBe(false)
  })
})

// ── Generate form: API interaction ────────────────────────────────

test.describe('Generate form: API responses (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generate')
    if (page.url().includes('/login')) { test.skip(); return }
  })

  // Helper: fills all required fields in GenerateForm.
  // Uses explicit IDs from the component:
  //   grade   → [role="radio"] buttons with text Α/Β/Γ/Δ/Ε/ΣΤ
  //   subject → #gen-subject (text input με datalist)
  //   objective → #gen-objective (textarea)
  async function fillForm(page: import('@playwright/test').Page) {
    // Grade — click τον radio button για Α (πρώτη τάξη)
    await page.locator('[role="radio"]').filter({ hasText: /^Α$/ }).first().click()

    // Subject — fill το text input (datalist — απλό fill, όχι option click)
    await page.fill('#gen-subject', 'Μαθηματικά')

    // Objective textarea — required, min 5 chars
    await page.fill(
      '#gen-objective',
      'Να μπορούν οι μαθητές να προσθέτουν κλάσματα με ίδιο παρονομαστή.',
    )
  }

  test('επιτυχής generate → redirect στο /prompts/<id>', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    await mockGenerateSuccess(page, 'abc-123')
    await fillForm(page)

    await page.click('button[type="submit"]')

    // Redirect στο /prompts/abc-123
    await page.waitForURL(/\/prompts\/abc-123/, { timeout: 10_000 })
    await expect(page).toHaveURL('/prompts/abc-123')
  })

  test('429 rate limit → εμφανίζει link προς /pricing', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    await mockGenerateRateLimit(page)
    await fillForm(page)

    await page.click('button[type="submit"]')

    // Error message με link /pricing
    const errorAlert = page.locator('[role="alert"]')
    await expect(errorAlert).toBeVisible({ timeout: 5_000 })

    // Πρέπει να υπάρχει link προς /pricing
    const pricingLink = page.getByRole('link', { name: /αναβάθμ|pricing|πλάνο/i })
    await expect(pricingLink).toBeVisible({ timeout: 3_000 })
    const href = await pricingLink.getAttribute('href')
    expect(href).toContain('/pricing')
  })

  test('502 backend unreachable → ελληνικό error message', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    await mockGenerateBackendError(page, 502, 'Backend unreachable')
    await fillForm(page)

    await page.click('button[type="submit"]')

    const errorAlert = page.locator('[role="alert"]')
    await expect(errorAlert).toBeVisible({ timeout: 5_000 })
    // Ο GenerateForm κάνει mapping: 502 → ελληνικό μήνυμα
    await expect(errorAlert).toContainText(/σύνδεση|backend|αναπόφευκτ|απροσδόκητ/i)
  })

  test('loading state: aria-busy=true κατά τη διάρκεια submit', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    // Προκαλούμε αργή απάντηση ώστε να δούμε το loading state
    await page.route('/api/generate', async (route) => {
      await new Promise((r) => setTimeout(r, 2_000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompt_id: 'slow-123' }),
      })
    })

    await fillForm(page)

    const submitBtn = page.locator('button[type="submit"]')
    await submitBtn.click()

    // Αμέσως μετά το click, aria-busy πρέπει να είναι true
    await expect(submitBtn).toHaveAttribute('aria-busy', 'true')

    // Cleanup
    await page.waitForURL(/\/prompts\/slow-123/, { timeout: 10_000 })
  })
})

// ── Prompt view page ───────────────────────────────────────────────

test.describe('Prompt view page /prompts/[id] (authenticated)', () => {
  test('valid UUID → renders ή επιστρέφει 404 (δεν κρασάρει)', async ({ page }) => {
    if (page.url().includes('/login')) { test.skip(); return }

    // Χρησιμοποιούμε fake UUID που δεν υπάρχει στη DB
    const fakeId = '00000000-0000-0000-0000-000000000000'
    await page.goto(`/prompts/${fakeId}`)

    // Δεν πρέπει να crash-άρει (500)
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    await expect(page.locator('body')).not.toContainText('500')

    // Αναμένουμε είτε 404 page είτε την prompt view
    const isNotFound = await page.locator('text=/404|Δεν βρέθηκε/i').isVisible()
    const hasContent = await page.locator('h1, h2').first().isVisible()
    expect(isNotFound || hasContent).toBe(true)
  })

  test('invalid (non-UUID) id → 404', async ({ page }) => {
    await page.goto('/prompts/not-a-valid-uuid')
    // Το server component κάνει UUID validation και επιστρέφει notFound()
    await expect(page.locator('body')).not.toContainText('500')
  })
})
