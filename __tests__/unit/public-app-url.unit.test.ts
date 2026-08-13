import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolvePublicAppUrl,
  isMisconfiguredPublicAppUrl,
  warnIfPublicAppUrlMisconfigured,
} from "@/lib/public-app-url";

describe("resolvePublicAppUrl()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers AUTH_URL over NEXTAUTH_URL", () => {
    vi.stubEnv("AUTH_URL", "https://prod.example.com/");
    vi.stubEnv("NEXTAUTH_URL", "https://legacy.example.com");
    expect(resolvePublicAppUrl()).toBe("https://prod.example.com");
  });

  it("falls back to NEXTAUTH_URL when AUTH_URL is unset", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "https://prod.example.com");
    expect(resolvePublicAppUrl()).toBe("https://prod.example.com");
  });

  it("falls back to localhost when no env is set", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(resolvePublicAppUrl()).toBe("http://localhost:3002");
  });
});

describe("isMisconfiguredPublicAppUrl()", () => {
  it("flags localhost and internal https ports", () => {
    expect(isMisconfiguredPublicAppUrl("http://localhost:3002")).toBe(true);
    expect(isMisconfiguredPublicAppUrl("https://app.example.com:8080")).toBe(true);
    expect(isMisconfiguredPublicAppUrl("https://command-center-reboot-production.up.railway.app")).toBe(false);
  });
});

describe("warnIfPublicAppUrlMisconfigured()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs in production when URL is localhost", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("AUTH_URL", "http://localhost:3002");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    warnIfPublicAppUrlMisconfigured("test");
    expect(err).toHaveBeenCalledWith(expect.stringContaining("[public-app-url]"));
  });

  it("does not log in Railway dev", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "dev");
    vi.stubEnv("AUTH_URL", "http://localhost:3002");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    warnIfPublicAppUrlMisconfigured("test");
    expect(err).not.toHaveBeenCalled();
  });
});
