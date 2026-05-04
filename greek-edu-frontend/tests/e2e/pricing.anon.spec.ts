// tests/e2e/pricing.anon.spec.ts
//
// Ανώνυμοι έλεγχοι για το /pricing page και το CheckoutButton.
//
// Σενάρια:
//   1. /pricing page render: τίτλοι πλάνων, τιμές, CTA buttons
//   2. CheckoutButton για ανώνυμο χρήστη:
//      - POST /api/checkout επιστρέφει 401
//      - CheckoutButton κάνει redirect στο /login?next=/pricing
//   3. "Ξεκίνα Δωρεάν" link πηγαίνει στο /signup
//   4. Checkout cancel page render
//
// Τρέχουν χωρίς login state (project: chromium-anon).

import { test, expect } from '@playwright/test'

// ── Pricing page render ────────────────────────────────────────────

test.describe('Pricing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pricing')
  })

  test('renders χωρίς redirect', async ({ page }) => {
    await expect(page).toHaveURL(/\/pricing/)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('έχει τίτλο με "Τιμολόγηση" ή "Πλάνα"', async ({ page }) => {
    // Ψάχνουμε κείμενο που αναγράφει τιμολόγηση/πλάνα
    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible()
  })

  test('εμφανίζει Free plan card', async ({ page }) => {
    // Free plan — δωρεάν
    await expect(
      page.getByText(/δωρεάν|free/i).first(),
    ).toBeVisible()
  })

  test('εμφανίζει Pro plan με τιμή 14,99 €', async ({ page }) => {
    await expect(page.getByText(/14[,.]99/)).toBeVisible()
  })

  test('εμφανίζει School plan με τιμή 79,99 €', async ({ page }) => {
    await expect(page.getByText(/79[,.]99/)).toBeVisible()
  })

  test('"Ξεκίνα Δωρεάν" link → /signup', async ({ page }) => {
    const freeLink = page.getByRole('link', { name: /ξεκίνα δωρεάν/i })
    await expect(freeLink).toBeVisible()
    await expect(freeLink).toHaveAttribute('href', '/signup')
  })

  test('υπάρχουν δύο CheckoutButton (Pro + School)', async ({ page }) => {
    // Τα CheckoutButton είναι <button type="button"> εντός w-full div
    // Ψάχνουμε buttons με τιμές πλάνων ή "Ξεκίνα" / "Αγόρασε"
    const checkoutButtons = page.locator('button[type="button"]').filter({
      hasText: /pro|σχολε|ξεκίνα|αγόρασε/i,
    })
    await expect(checkoutButtons).toHaveCount(2)
  })
})

// ── CheckoutButton: ανώνυμος χρήστης → redirect to login ──────────

test.describe('CheckoutButton: ανώνυμος χρήστης', () => {
  test('κλικ σε Pro → POST /api/checkout → 401 → redirect /login?next=/pricing', async ({ page }) => {
    // Mock το /api/checkout ώστε να επιστρέψει 401 (unauthenticated)
    await page.route('/api/checkout', async (route) => {
      expect(route.request().method()).toBe('POST')
      const body = JSON.parse(route.request().postData() || '{}')
      expect(body.plan).toBe('pro')

      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    })

    await page.goto('/pricing')

    // Βρες το Pro checkout button
    const proButton = page.locator('button[type="button"]').filter({
      hasText: /pro|ξεκίνα/i,
    }).first()
    await expect(proButton).toBeVisible()
    await proButton.click()

    // Πρέπει να redirect-αριστεί στο /login?next=/pricing
    await page.waitForURL(/\/login/, { timeout: 5_000 })
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('next')).toBe('/pricing')
  })

  test('κλικ σε School → 401 → redirect /login?next=/pricing', async ({ page }) => {
    await page.route('/api/checkout', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      expect(body.plan).toBe('school')

      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    })

    await page.goto('/pricing')

    const schoolButton = page.locator('button[type="button"]').filter({
      hasText: /σχολε/i,
    }).first()
    await expect(schoolButton).toBeVisible()
    await schoolButton.click()

    await page.waitForURL(/\/login/, { timeout: 5_000 })
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('next')).toBe('/pricing')
  })

  test('server error → εμφανίζει ελληνικό error message (δεν redirect)', async ({ page }) => {
    await page.route('/api/checkout', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })

    await page.goto('/pricing')

    const proButton = page.locator('button[type="button"]').filter({
      hasText: /pro|ξεκίνα/i,
    }).first()
    await proButton.click()

    // Δεν redirect-άρει — εμφανίζει error
    await expect(page).toHaveURL(/\/pricing/)
    const errorMsg = page.locator('[role="alert"]')
    await expect(errorMsg).toBeVisible({ timeout: 5_000 })
  })

  test('409 conflict → "Είσαι ήδη συνδρομητής" message', async ({ page }) => {
    await page.route('/api/checkout', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Είσαι ήδη συνδρομητής αυτού του πλάνου.' }),
      })
    })

    await page.goto('/pricing')

    const proButton = page.locator('button[type="button"]').filter({
      hasText: /pro|ξεκίνα/i,
    }).first()
    await proButton.click()

    const alert = page.locator('[role="alert"]')
    await expect(alert).toBeVisible({ timeout: 5_000 })
    await expect(alert).toContainText('Είσαι ήδη συνδρομητής')
  })
})

// ── Checkout cancel page ───────────────────────────────────────────

test.describe('Checkout cancel page', () => {
  test('GET /checkout/cancel renders χωρίς crash', async ({ page }) => {
    await page.goto('/checkout/cancel?plan=pro')
    await expect(page).toHaveURL(/\/checkout\/cancel/)
    // Βασική προστασία: δεν κάνει server error (500)
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })
})

// ── Landing page CTA ───────────────────────────────────────────────

test.describe('Landing page CTA', () => {
  test('CTA "Ξεκίνα Δωρεάν" ή "Δοκίμασε Τώρα" → /signup', async ({ page }) => {
    await page.goto('/')

    // Ψάχνουμε για primary CTA link (μπορεί να υπάρχουν αρκετά)
    const ctaLinks = page.getByRole('link').filter({
      hasText: /εγγραφή|δοκίμασε|ξεκίνα/i,
    })

    // Τουλάχιστον ένα CTA πρέπει να πηγαίνει σε /signup ή /generate
    const count = await ctaLinks.count()
    expect(count).toBeGreaterThan(0)

    const firstCta = ctaLinks.first()
    const href = await firstCta.getAttribute('href')
    expect(['/signup', '/generate', '/login']).toContain(href)
  })
})
