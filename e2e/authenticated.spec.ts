import { test, expect } from "@playwright/test";

/**
 * Authenticated E2E tests — require a test account.
 *
 * Set BASE_URL, E2E_TEST_EMAIL, E2E_TEST_PASSWORD before running.
 *
 * Use these for post-deploy verification in dev and prod.
 * Bootstrap the test user once per environment:
 *   E2E_TEST_EMAIL=e2e-test@yourdomain.com \
 *   E2E_TEST_PASSWORD="YourSecureE2EPassword!" \
 *   DATABASE_URL="<env-connection-string>" \
 *   npm run bootstrap:e2e-user
 */

const E2E_EMAIL = process.env.E2E_TEST_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

test.describe("Authenticated flows", () => {
  test.beforeEach(async ({ page }) => {
    if (!E2E_EMAIL || !E2E_PASSWORD) {
      test.skip();
      return;
    }
    await page.goto("/en/login");
    await page.getByLabel(/email/i).fill(E2E_EMAIL);
    await page.getByRole("textbox", { name: /^password$/i }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/(en|es)$/);
  });

  test("can access dashboard after login", async ({ page }) => {
    await page.goto("/en");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can access projects page", async ({ page }) => {
    await page.goto("/en/projects");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can access team page", async ({ page }) => {
    await page.goto("/en/team");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can access settings page", async ({ page }) => {
    await page.goto("/en/settings");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can sign out", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: /account settings/i }).click();
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
