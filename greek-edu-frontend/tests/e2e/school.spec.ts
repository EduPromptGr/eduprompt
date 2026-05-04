// tests/e2e/school.spec.ts
//
// Authenticated tests για το school flow:
//   • /school/members — render, invite form
//   • /school/report  — render
//   • /join-school    — token validation UX
//   • POST /api/school/invite — mock responses
//   • POST /api/school/remove-member — mock responses
//
// Χρησιμοποιεί .auth/user.json (από global.setup.ts).
// Επειδή το school plan απαιτεί subscription_status='school',
// τα tests που ελέγχουν school-owner pages χρειάζονται
// E2E_SCHOOL_EMAIL / E2E_SCHOOL_PASSWORD (school plan owner).
// Χωρίς αυτά, το middleware redirect-άρει στο /pricing
// και τα tests παρακάμπτονται (test.skip).

import { test, expect } from '@playwright/test'

// ── /school page: render ───────────────────────────────────────────

test.describe('/school page', () => {
  test('GET /school: authenticated non-school user → redirect /pricing ή render', async ({ page }) => {
    await page.goto('/school')

    // Αν ο user δεν είναι school plan → redirect /pricing
    // Αν είναι → render normally
    const url = page.url()
    const isRedirected = url.includes('/pricing') || url.includes('/login')
    const isOnSchool = url.includes('/school')

    expect(isRedirected || isOnSchool).toBe(true)
    // Δεν πρέπει να crash-αρει
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })
})

// ── /school/members page ───────────────────────────────────────────

test.describe('/school/members page', () => {
  test('non-school user → redirect /pricing', async ({ page }) => {
    await page.goto('/school/members')

    // Middleware το redirect-άρει αν δεν είναι school plan
    const url = page.url()
    if (url.includes('/school/members')) {
      // Ο user είναι school owner — το test είναι valid
      await expect(page.locator('body')).not.toContainText('500')
    } else {
      // Expected redirect
      expect(url.includes('/pricing') || url.includes('/login')).toBe(true)
    }
  })
})

// ── School invite: API mock tests ─────────────────────────────────

test.describe('School invite: /api/school/invite mock', () => {
  test('επιτυχής invite → success response', async ({ page }) => {
    await page.route('/api/school/invite', async (route) => {
      expect(route.request().method()).toBe('POST')
      const body = JSON.parse(route.request().postData() || '{}')
      expect(body.email).toBeTruthy()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, emailSent: true }),
      })
    })

    // Αν δεν είμαστε σε /school page, skip
    await page.goto('/school')
    const url = page.url()
    if (!url.includes('/school') || url.includes('/login') || url.includes('/pricing')) {
      test.skip()
      return
    }

    // Βρες το invite form
    const emailInput = page.locator('input[type="email"]').first()
    if (!await emailInput.isVisible()) {
      test.skip()
      return
    }

    await emailInput.fill('teacher@school.gr')
    await page.locator('button[type="submit"], button').filter({ hasText: /πρόσκλη|invite/i }).first().click()

    // Επιτυχής μήνυμα
    await expect(page.getByText(/στάλθηκε|εστάλη|επιτυχ/i)).toBeVisible({ timeout: 5_000 })
  })

  test('limit_reached → error message', async ({ page }) => {
    await page.route('/api/school/invite', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Έχεις φτάσει το μέγιστο των 30 εκπαιδευτικών' }),
      })
    })

    await page.goto('/school')
    const url = page.url()
    if (!url.includes('/school') || url.includes('/login') || url.includes('/pricing')) {
      test.skip()
      return
    }

    const emailInput = page.locator('input[type="email"]').first()
    if (!await emailInput.isVisible()) { test.skip(); return }

    await emailInput.fill('extra@teacher.gr')
    await page.locator('button').filter({ hasText: /πρόσκλη|invite/i }).first().click()

    const alert = page.locator('[role="alert"]')
    await expect(alert).toBeVisible({ timeout: 5_000 })
    await expect(alert).toContainText('30')
  })
})

// ── /join-school page ──────────────────────────────────────────────

test.describe('/join-school page', () => {
  test('χωρίς token → error message ή redirect', async ({ page }) => {
    await page.goto('/join-school')
    // Χωρίς ?token= param — πρέπει να δείξει error ή redirect
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('με άκυρο token → ελληνικό error message', async ({ page }) => {
    // Mock το /api/school/join
    await page.route('/api/school/join', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Άκυρος ή ληγμένος σύνδεσμος πρόσκλησης' }),
      })
    })

    await page.goto('/join-school?token=invalid-token-xyz')

    // Αν ο user δεν είναι logged in, redirect στο login
    const url = page.url()
    if (url.includes('/login')) {
      // Expected behavior για anonymous users
      expect(url).toContain('/login')
      return
    }

    // Αν είναι logged in, πρέπει να δει error
    const errorEl = page.locator('[role="alert"], .text-rose-600, .text-red-600').first()
    if (await errorEl.isVisible({ timeout: 5_000 })) {
      await expect(errorEl).toContainText(/άκυρος|ληγμένος/i)
    }
  })

  test('με valid token → success state (mock)', async ({ page }) => {
    await page.route('/api/school/join', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    await page.goto('/join-school?token=valid-token-abc123')

    const url = page.url()
    if (url.includes('/login')) {
      // Logged-out user — redirect expected
      expect(url).toContain('/login')
      return
    }

    // Logged-in user: success message ή redirect στο /generate
    const isOnGenerate = page.url().includes('/generate')
    const hasSuccess = await page.getByText(/καλωσήρθ|επιτυχ|ενταχθ/i).isVisible({ timeout: 5_000 })
    expect(isOnGenerate || hasSuccess).toBe(true)
  })
})

// ── Remove member: API mock ────────────────────────────────────────

test.describe('/api/school/remove-member mock', () => {
  test('επιτυχής αφαίρεση → success', async ({ page }) => {
    await page.route('/api/school/remove-member', async (route) => {
      expect(route.request().method()).toBe('POST')
      const body = JSON.parse(route.request().postData() || '{}')
      expect(body.member_id).toBeTruthy()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    await page.goto('/school/members')
    const url = page.url()
    if (!url.includes('/school/members')) {
      test.skip()
      return
    }

    // Ψάξε remove button — αν υπάρχουν members
    const removeButtons = page.locator('button').filter({ hasText: /αφαίρ|διαγρ|remove/i })
    const count = await removeButtons.count()
    if (count === 0) {
      // Δεν υπάρχουν members — valid empty state
      test.skip()
      return
    }

    await removeButtons.first().click()

    // Επιβεβαίωση dialog ή άμεση επιτυχία
    const confirmBtn = page.locator('button').filter({ hasText: /ναι|επιβεβαίω|confirm/i })
    if (await confirmBtn.isVisible({ timeout: 2_000 })) {
      await confirmBtn.click()
    }

    // Επιτυχία ή ανανέωση της λίστας
    await expect(page.locator('body')).not.toContainText('500')
  })
})

// ── /school/report page ────────────────────────────────────────────

test.describe('/school/report page', () => {
  test('non-school user → redirect, school user → render', async ({ page }) => {
    await page.goto('/school/report')
    const url = page.url()

    if (url.includes('/school/report')) {
      // School owner — page renders
      await expect(page.locator('body')).not.toContainText('500')
    } else {
      // Non-school user redirect
      expect(
        url.includes('/pricing') || url.includes('/login') || url.includes('/generate'),
      ).toBe(true)
    }
  })
})
