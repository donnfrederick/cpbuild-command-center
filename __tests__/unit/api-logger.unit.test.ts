import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logApi, apiTimer } from "@/lib/api-logger";

describe("apiTimer", () => {
  it("returns elapsed milliseconds", () => {
    const t = apiTimer();
    const elapsed = t();
    expect(typeof elapsed).toBe("number");
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe("logApi", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSilent = process.env.VITEST_SILENT_API;

  beforeEach(() => {
    process.env.VITEST_SILENT_API = "false"; // allow logging in this unit test
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.VITEST_SILENT_API = originalSilent;
    vi.restoreAllMocks();
  });

  it("logs 2xx as info in development", () => {
    process.env.NODE_ENV = "development";
    logApi("GET", "/api/health", 200, "OK", 10);
    expect(console.info).toHaveBeenCalled();
  });

  it("logs 4xx as warn in development", () => {
    process.env.NODE_ENV = "development";
    logApi("GET", "/api/team", 401, "Unauthorized");
    expect(console.warn).toHaveBeenCalled();
  });

  it("logs 5xx as error in development", () => {
    process.env.NODE_ENV = "development";
    logApi("POST", "/api/projects", 500, "Server error");
    expect(console.error).toHaveBeenCalled();
  });

  it("does not log in production", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { logApi: logApiProd } = await import("@/lib/api-logger");
    logApiProd("GET", "/api/health", 200, "OK");
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    process.env.NODE_ENV = orig;
    vi.resetModules();
  });

  it("includes response body when provided", () => {
    process.env.NODE_ENV = "development";
    logApi("GET", "/api/health", 200, "OK", 5, { status: "ok" });
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("Response:")
    );
  });

  it("truncates long response body", () => {
    process.env.NODE_ENV = "development";
    const longBody = "x".repeat(3000);
    logApi("GET", "/api/health", 200, "OK", undefined, { data: longBody });
    const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toContain("(truncated)");
  });

  it("handles string response body", () => {
    process.env.NODE_ENV = "development";
    logApi("GET", "/api/health", 200, "OK", 1, "plain text");
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("plain text")
    );
  });

  it("omits duration when not provided", () => {
    process.env.NODE_ENV = "development";
    logApi("GET", "/api/health", 200, "OK");
    const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).not.toMatch(/\(\d+ms\)/);
  });

  it("handles body that cannot be JSON stringified", () => {
    process.env.NODE_ENV = "development";
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logApi("GET", "/api/health", 200, "OK", 1, circular);
    expect(console.info).toHaveBeenCalled();
  });
});
