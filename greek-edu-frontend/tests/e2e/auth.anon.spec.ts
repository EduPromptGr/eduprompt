// tests/e2e/auth.anon.spec.ts
//
// Ανώνυμοι (non-authenticated) έλεγχοι για:
//   • Middleware redirect: protected routes → /login?next=<path>
//   • Login page render + form fields
//   • Signup page render + form fields
//   • ?next= param preservation μέσα στο login form
//   • Wrong credentials → ελληνικό error message
//
// Τρέχουν χωρίς login state (project: chromium-anon).
// Δεν χρησιμοποιούν πραγματικό Supabase — τα form submit tests
// mock-άρουν το /api route layer ώστε να μη χρειαστεί network.

import { test, expect } from '@playwright/test'

// ── Middleware redirect tests ──────────────────────────────────────

test.describe('Middleware: protected route redirect', () => {
  test('GET /generate → redirect /login?next=/generate', async ({ page }) => {
    const response = await page.goto('/generate')

    // Επαλήθευσε ότι βρισκόμαστε στο /login
    await expect(page).toHaveURL(/\/login/)

    // Επαλήθευσε ότι υπάρχει το ?next=/generate param
    const url = new URL(page.url())
    expect(url.searchParams.get('next')).toBe('/generate')

    // Το response status μπορεί να είναι 200 (redirect γίνεται client-side
    // από next/navigation) ή 307 — δεχόμαστε και τα δύο.
    expect([200, 307, 308]).toContain(response?.status() ?? 200)
  })

  test('GET /journal → redirect /login?next=/journal', async ({ page }) => {
    await page.goto('/journal')
    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get('next')).toBe('/journal')
  })

  test('GET /school → redirect /login?next=/school', async ({ page }) => {
    await page.goto('/school')
    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get('next')).toBe('/school')
  })

  test('GET /referral → redirect /login?next=/referral', async ({ page }) => {
    await page.goto('/referral')
    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get('next')).toBe('/referral')
  })

  test('GET /profile → redirect /login?next=/profile', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get('next')).toBe('/profile')
  })
})

// ── Public routes: δεν redirect-άρουν ─────────────────────────────

test.describe('Public routes: no redirect', () => {
  test('GET / renders landing page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/')
    // Δεν redirect-άρει στο login
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('GET /pricing renders pricing page', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page).toHaveURL(/\/pricing/)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('GET /login renders login form', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
    await expect(page).not.toHaveURL(/\/generate/)
  })

  test('GET /signup renders signup form', async ({ page }) => {
    await page.goto('/signup')
    await expect(page).toHaveURL(/\/signup/)
  })
})

// ── Login page structure ───────────────────────────────────────────

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('έχει email input με id=login-email', async ({ page }) => {
    const emailInput = page.locator('#login-email')
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toHaveAttribute('type', 'email')
    await expect(emailInput).toHaveAttribute('aria-required', 'true')
  })

  test('έχει password input με id=login-password', async ({ page }) => {
    const passInput = page.locator('#login-password')
    await expect(passInput).toBeVisible()
    await expect(passInput).toHaveAttribute('type', 'password')
    await expect(passInput).toHaveAttribute('aria-required', 'true')
  })

  test('submit button αρχικά disabled (χωρίς credentials)', async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeDisabled()
  })

  test('submit button ενεργοποιείται μόλις συμπληρωθεί email + password', async ({ page }) => {
    await page.fill('#login-email', 'daskalos@sxoleio.gr')
    await page.fill('#login-password', 'testpassword123')
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeEnabled()
  })

  test('link "Ξέχασες τον κωδικό;" πηγαίνει στο /forgot-password', async ({ page }) => {
    const link = page.getByText('Ξέχασες τον κωδικό;')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/forgot-password')
  })

  test('link "Εγγραφή δωρεάν" πηγαίνει στο /signup', async ({ page }) => {
    const link = page.getByText('Εγγραφή δωρεάν')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/signup')
  })

  test('?next= param διατηρείται στο URL', async ({ page }) => {
    await page.goto('/login?next=/pricing')
    // Το URL πρέπει να έχει το ?next= param
    const url = new URL(page.url())
    expect(url.searchParams.get('next')).toBe('/pricing')
  })

  test('wrong credentials → ελληνικό error message', async ({ page }) => {
    // Mock το Supabase signInWithPassword να επιστρέψει error
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        }),
      })
    })

    await page.fill('#login-email', 'wrong@email.gr')
    await page.fill('#login-password', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Ελληνικό error message
    const errorAlert = page.locator('[role="alert"]')
    await expect(errorAlert).toBeVisible({ timeout: 5_000 })
    await expect(errorAlert).toContainText('Λάθος email ή κωδικός')
  })

  test('κουμπί "Δείξε" toggle-άρει visibility κωδικού', async ({ page }) => {
    await page.fill('#login-password', 'mypassword')
    const passInput = page.locator('#login-password')
    await expect(passInput).toHaveAttribute('type', 'password')

    // Κλικ στο "Δείξε"
    await page.getByRole('button', { name: /δείξε/i }).click()
    await expect(passInput).toHaveAttribute('type', 'text')

    // Κλικ στο "Κρύψε"
    await page.getByRole('button', { name: /κρύψε/i }).click()
    await expect(passInput).toHaveAttribute('type', 'password')
  })
})

// ── Signup page structure ──────────────────────────────────────────

test.describe('Signup page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup')
  })

  test('έχει email input με id=signup-email', async ({ page }) => {
    const emailInput = page.locator('#signup-email')
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toHaveAttribute('type', 'email')
  })

  test('έχει password input με id=signup-password', async ({ page }) => {
    await expect(page.locator('#signup-password')).toBeVisible()
  })

  test('έχει confirm password input με id=signup-confirm', async ({ page }) => {
    await expect(page.locator('#signup-confirm')).toBeVisible()
  })

  test('έχει checkbox για αποδοχή Όρων Χρήσης', async ({ page }) => {
    const checkbox = page.locator('input[type="checkbox"]')
    await expect(checkbox).toBeVisible()
  })

  test('submit button disabled χωρίς completed form', async ({ page }) => {
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
  })

  test('link "Σύνδεση" πηγαίνει στο /login', async ({ page }) => {
    const link = page.getByText('Σύνδεση')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/login')
  })

  test('κωδικός < 8 χαρακτήρες → field error', async ({ page }) => {
    await page.fill('#signup-email', 'test@example.gr')
    await page.fill('#signup-password', '1234567') // 7 chars
    await page.fill('#signup-confirm', '1234567')

    // Κάνε checked το checkbox
    await page.locator('input[type="checkbox"]').check()

    await page.click('button[type="submit"]')

    // Πρέπει να εμφανιστεί field error για τον κωδικό
    await expect(page.getByText('Τουλάχιστον 8 χαρακτήρες')).toBeVisible({
      timeout: 3_000,
    })
  })

  test('κωδικοί δεν ταιριάζουν → confirm error', async ({ page }) => {
    await page.fill('#signup-email', 'test@example.gr')
    await page.fill('#signup-password', 'Password123!')
    await page.fill('#signup-confirm', 'DifferentPass!')
    await page.locator('input[type="checkbox"]').check()

    await page.click('button[type="submit"]')

    await expect(page.getByText('Οι κωδικοί δεν ταιριάζουν')).toBeVisible({
      timeout: 3_000,
    })
  })

  test('password strength bar εμφανίζεται μόλις πληκτρολογηθεί κωδικός', async ({ page }) => {
    await page.fill('#signup-password', 'test')
    // Strength bar εμφανίζεται (Αδύναμος label)
    await expect(page.getByText('Αδύναμος')).toBeVisible()

    await page.fill('#signup-password', 'StrongPass123!')
    await expect(page.getByText('Ισχυρός')).toBeVisible()
  })

  test('links Όρων Χρήσης και Πολιτικής Απορρήτου υπάρχουν', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Όρους Χρήσης' })).toHaveAttribute(
      'href', '/terms',
    )
    await expect(page.getByRole('link', { name: 'Πολιτική Απορρήτου' })).toHaveAttribute(
      'href', '/privacy',
    )
  })
})
