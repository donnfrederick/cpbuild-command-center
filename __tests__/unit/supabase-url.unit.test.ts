import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseUrl } from "@/lib/supabase-url";

/** Minimal JWT payload `{ ref: "abc123" }` encoded as base64url (no padding). */
function jwtWithRef(ref: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify({ ref })).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("getSupabaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns SUPABASE_URL when set", () => {
    vi.stubEnv("SUPABASE_URL", "https://my-project.supabase.co/");
    expect(getSupabaseUrl()).toBe("https://my-project.supabase.co");
  });

  it("trims whitespace from SUPABASE_URL", () => {
    vi.stubEnv("SUPABASE_URL", "  https://my-project.supabase.co/  ");
    expect(getSupabaseUrl()).toBe("https://my-project.supabase.co");
  });

  it("derives URL from DATABASE_URL postgres host", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres.abc123xyz:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres");
    expect(getSupabaseUrl()).toBe("https://abc123xyz.supabase.co");
  });

  it("decodes base64url JWT payload from SUPABASE_SERVICE_ROLE_KEY", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", jwtWithRef("sooaoevojqxgcqplflhj"));
    expect(getSupabaseUrl()).toBe("https://sooaoevojqxgcqplflhj.supabase.co");
  });

  it("falls through to DATABASE_URL when SUPABASE_URL is whitespace-only", () => {
    vi.stubEnv("SUPABASE_URL", "   ");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres.abc123xyz:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres");
    expect(getSupabaseUrl()).toBe("https://abc123xyz.supabase.co");
  });

  it("returns empty string when no env source is available", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(getSupabaseUrl()).toBe("");
  });
});
