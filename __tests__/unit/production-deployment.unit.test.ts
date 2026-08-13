import { describe, it, expect, vi, afterEach } from "vitest";
import { isStrictProductionDeployment } from "@/lib/production-deployment";

describe("isStrictProductionDeployment()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when NODE_ENV is not production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_ENV", "");
    expect(isStrictProductionDeployment()).toBe(false);
  });

  it("returns false on production when APP_ENV is staging-like", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "staging");
    expect(isStrictProductionDeployment()).toBe(false);
  });

  it("returns true on production with no dev-like APP_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "");
    vi.stubEnv("RAILWAY_GIT_BRANCH", "");
    expect(isStrictProductionDeployment()).toBe(true);
  });
});
