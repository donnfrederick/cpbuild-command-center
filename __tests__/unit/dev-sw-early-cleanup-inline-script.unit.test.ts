import { describe, it, expect, afterEach } from "vitest";
import {
  DEV_SW_EARLY_CLEANUP_INLINE_SCRIPT,
  shouldInjectDevSwEarlyCleanup,
} from "@/lib/dev-sw-early-cleanup-inline-script";

describe("dev-sw-early-cleanup-inline-script", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("exports a self-invoking unregister script", () => {
    expect(DEV_SW_EARLY_CLEANUP_INLINE_SCRIPT).toContain("serviceWorker");
    expect(DEV_SW_EARLY_CLEANUP_INLINE_SCRIPT).toContain("unregister");
  });

  it("injects in development when PWA dev mode is off", () => {
    process.env.NODE_ENV = "development";
    process.env.PWA_DEV_ENABLED = "false";
    expect(shouldInjectDevSwEarlyCleanup()).toBe(true);
  });

  it("skips when PWA dev offline QA is enabled", () => {
    process.env.NODE_ENV = "development";
    process.env.PWA_DEV_ENABLED = "true";
    expect(shouldInjectDevSwEarlyCleanup()).toBe(false);
  });

  it("skips in production", () => {
    process.env.NODE_ENV = "production";
    process.env.PWA_DEV_ENABLED = "false";
    expect(shouldInjectDevSwEarlyCleanup()).toBe(false);
  });
});
