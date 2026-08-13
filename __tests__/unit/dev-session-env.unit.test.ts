import { describe, it, expect, afterEach, vi } from "vitest";
import { readDevBypassUserEmailEnv } from "@/lib/dev-session";

describe("readDevBypassUserEmailEnv()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when unset", () => {
    vi.stubEnv("DEV_BYPASS_USER_EMAIL", undefined);
    expect(readDevBypassUserEmailEnv()).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    vi.stubEnv("DEV_BYPASS_USER_EMAIL", "   ");
    expect(readDevBypassUserEmailEnv()).toBeNull();
  });

  it("returns trimmed email", () => {
    vi.stubEnv("DEV_BYPASS_USER_EMAIL", "  psalter@cpbuild.com  ");
    expect(readDevBypassUserEmailEnv()).toBe("psalter@cpbuild.com");
  });

  it("strips surrounding quotes", () => {
    vi.stubEnv("DEV_BYPASS_USER_EMAIL", '"psalter@cpbuild.com"');
    expect(readDevBypassUserEmailEnv()).toBe("psalter@cpbuild.com");
  });
});
