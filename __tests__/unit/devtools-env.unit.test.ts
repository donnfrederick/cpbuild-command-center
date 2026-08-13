import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * isDevToolsAllowed() — unit tests for every branch of the guard.
 * Isolated: no DB, no network. Only env var manipulation.
 */
describe("isDevToolsAllowed()", () => {
  const saved: Record<string, string | undefined> = {};
  const VARS = [
    "NODE_ENV",
    "APP_ENV",
    "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_GIT_BRANCH",
    "DEVTOOLS_ENABLED",
  ];

  beforeEach(() => {
    VARS.forEach((k) => { saved[k] = process.env[k]; });
    // Default: simulate Railway production (all guards should block)
    process.env.NODE_ENV = "production";
    delete process.env.APP_ENV;
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    delete process.env.RAILWAY_GIT_BRANCH;
    delete process.env.DEVTOOLS_ENABLED;
  });

  afterEach(() => {
    VARS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  async function allowed(): Promise<boolean> {
    // Re-import each time so env changes are picked up (no module cache issue
    // because vitest isolates module state per test by default in unit pool).
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    return isDevToolsAllowed();
  }

  it("allows when NODE_ENV !== production (local dev)", async () => {
    process.env.NODE_ENV = "test";
    expect(await allowed()).toBe(true);
  });

  it("blocks when NODE_ENV=production with no overrides", async () => {
    expect(await allowed()).toBe(false);
  });

  describe("APP_ENV override", () => {
    it("allows when APP_ENV=dev", async () => {
      process.env.APP_ENV = "dev";
      expect(await allowed()).toBe(true);
    });

    it("allows when APP_ENV=development", async () => {
      process.env.APP_ENV = "development";
      expect(await allowed()).toBe(true);
    });

    it("allows when APP_ENV=staging", async () => {
      process.env.APP_ENV = "staging";
      expect(await allowed()).toBe(true);
    });

    it("blocks when APP_ENV=production", async () => {
      process.env.APP_ENV = "production";
      expect(await allowed()).toBe(false);
    });
  });

  describe("RAILWAY_ENVIRONMENT_NAME override", () => {
    it("allows when RAILWAY_ENVIRONMENT_NAME=development", async () => {
      process.env.RAILWAY_ENVIRONMENT_NAME = "development";
      expect(await allowed()).toBe(true);
    });

    it("allows when RAILWAY_ENVIRONMENT_NAME=dev", async () => {
      process.env.RAILWAY_ENVIRONMENT_NAME = "dev";
      expect(await allowed()).toBe(true);
    });

    it("allows when RAILWAY_ENVIRONMENT_NAME=staging", async () => {
      process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
      expect(await allowed()).toBe(true);
    });

    it("blocks when RAILWAY_ENVIRONMENT_NAME=production", async () => {
      process.env.RAILWAY_ENVIRONMENT_NAME = "production";
      expect(await allowed()).toBe(false);
    });
  });

  describe("RAILWAY_GIT_BRANCH override", () => {
    it("allows when RAILWAY_GIT_BRANCH=dev", async () => {
      process.env.RAILWAY_GIT_BRANCH = "dev";
      expect(await allowed()).toBe(true);
    });

    it("blocks when RAILWAY_GIT_BRANCH=main", async () => {
      process.env.RAILWAY_GIT_BRANCH = "main";
      expect(await allowed()).toBe(false);
    });
  });

  describe("DEVTOOLS_ENABLED override (production admin use)", () => {
    it("allows when DEVTOOLS_ENABLED=true in production", async () => {
      process.env.DEVTOOLS_ENABLED = "true";
      expect(await allowed()).toBe(true);
    });

    it("blocks when DEVTOOLS_ENABLED=false", async () => {
      process.env.DEVTOOLS_ENABLED = "false";
      expect(await allowed()).toBe(false);
    });

    it("blocks when DEVTOOLS_ENABLED=1 (only exact 'true' is accepted)", async () => {
      process.env.DEVTOOLS_ENABLED = "1";
      expect(await allowed()).toBe(false);
    });

    it("blocks when DEVTOOLS_ENABLED=True (case-sensitive)", async () => {
      process.env.DEVTOOLS_ENABLED = "True";
      expect(await allowed()).toBe(false);
    });
  });
});
