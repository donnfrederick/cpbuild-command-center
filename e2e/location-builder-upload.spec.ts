import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * Location Builder upload — requires auth + a project with EDIT_UPM.
 *
 * Set E2E_TEST_EMAIL, E2E_TEST_PASSWORD, and E2E_UPM_PROJECT_URL
 * (full URL to /en/projects/:id/upm) before running.
 */
const E2E_EMAIL = process.env.E2E_TEST_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";
const UPM_URL = process.env.E2E_UPM_PROJECT_URL ?? "";

test.describe("Location Builder upload", () => {
  test.beforeEach(async ({ page }) => {
    if (!E2E_EMAIL || !E2E_PASSWORD || !UPM_URL) {
      test.skip();
      return;
    }
    await page.goto("/en/login");
    await page.getByLabel(/email/i).fill(E2E_EMAIL);
    await page.getByRole("textbox", { name: /^password$/i }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/(en|es)(\/|$)/);
    await page.goto(UPM_URL);
    await expect(page.getByRole("heading", { name: /location builder/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("upload shows preview before append POST", async ({ page }) => {
    const postPromise = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/api\/projects\/[^/]+\/units$/.test(new URL(req.url()).pathname),
    );

    await page.getByRole("button", { name: /upload spreadsheet/i }).click();

    const fixture = path.join(
      process.cwd(),
      "docs/fixtures/location-builder-upload-valid.xlsx",
    );
    await page.locator('input[type="file"]').first().setInputFiles(fixture);

    const preview = page.getByRole("dialog", { name: /review rows to append/i });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("tab", { name: /new rows/i })).toBeVisible();
    await expect(preview.getByRole("tab", { name: /existing rows/i })).toBeVisible();

    await preview.getByRole("button", { name: /confirm & append rows/i }).click();

    const post = await postPromise;
    const body = post.postDataJSON() as { mode?: string };
    expect(body.mode).toBe("add");

    await expect(preview).toHaveCount(0);
  });
});
