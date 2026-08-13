import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3002";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Never follow redirects automatically — we want to assert them explicitly
    extraHTTPHeaders: {
      Accept: "text/html,application/json",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Do NOT start a local dev server. Run `npm run dev` first, then `npm run test:e2e`.
  // Default port 3002 matches `npm run dev`. Set BASE_URL for deployed environments.
});
