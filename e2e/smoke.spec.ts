import { test, expect } from "@playwright/test";

/**
 * Smoke tests — run against any deployed environment.
 * Set BASE_URL env var before running: BASE_URL=https://... npm run test:smoke
 *
 * These tests never require a real user account — they validate the shell of the
 * app is working (routing, auth redirect, API health) without touching the database.
 */

test.describe("Health & availability", () => {
  test("health endpoint returns 200 with status ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);

    const body = await res.json() as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });
});

test.describe("Auth routing", () => {
  test("unauthenticated root redirects to /login", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated /team redirects to /login", async ({ page }) => {
    await page.goto("/team", { waitUntil: "networkidle" });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated /settings redirects to /login", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated /users redirects to /login", async ({ page }) => {
    await page.goto("/users", { waitUntil: "networkidle" });
    expect(page.url()).toContain("/login");
  });

  test("/login page renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^password$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("/login has a skip link for accessibility", async ({ page }) => {
    await page.goto("/login");
    const skipLink = page.getByRole("link", { name: /skip to main content/i });
    await expect(skipLink).toBeAttached();
  });
});

test.describe("Auth API", () => {
  test("/api/auth/session returns 200 for unauthenticated request", async ({ request }) => {
    const res = await request.get("/api/auth/session");
    // NextAuth returns 200 with empty/null session for unauthenticated requests
    expect([200, 204]).toContain(res.status());
  });
});

test.describe("Invite flow (public routes)", () => {
  test("/invite/invalid-token shows not found page", async ({ page }) => {
    const res = await page.goto("/invite/this-token-does-not-exist-smoke-test");
    // Token doesn't exist in DB → notFound() → 404 with custom not-found UI
    expect(res?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: /no longer valid/i })
    ).toBeVisible();
  });
});

test.describe("PWA", () => {
  test("manifest.json is served correctly", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);

    const body = await res.json() as { name: string; display: string };
    expect(body.name).toBe("CP Build Field Tracker");
    expect(body.display).toBe("standalone");
  });
});
