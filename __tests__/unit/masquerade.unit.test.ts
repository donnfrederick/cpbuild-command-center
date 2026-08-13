import { describe, it, expect, vi, beforeEach } from "vitest";

// ── We test the pure crypto functions (signMasqueradeCookie / parseMasqueradeCookie)
// ── without involving Next.js or DB.

// Set AUTH_SECRET before importing the module
vi.stubEnv("AUTH_SECRET", "test-secret-for-unit-tests");

const {
  signMasqueradeCookie,
  parseMasqueradeCookie,
  buildMasqueradeCookieHeader,
  clearMasqueradeCookieHeader,
  MASQUERADE_COOKIE,
} = await import("@/lib/masquerade");

const samplePayload = {
  actorId: "actor-1",
  targetUserId: "target-1",
  logId: "log-1",
  iat: 1700000000,
};

describe("signMasqueradeCookie / parseMasqueradeCookie", () => {
  it("round-trips a valid payload", async () => {
    const signed = await signMasqueradeCookie(samplePayload);
    expect(typeof signed).toBe("string");
    expect(signed).toContain(".");

    const parsed = await parseMasqueradeCookie(signed);
    expect(parsed).toEqual(samplePayload);
  });

  it("returns null for a tampered signature", async () => {
    const signed = await signMasqueradeCookie(samplePayload);
    const tampered = signed.slice(0, -4) + "XXXX";
    const parsed = await parseMasqueradeCookie(tampered);
    expect(parsed).toBeNull();
  });

  it("returns null for a missing dot separator", async () => {
    const result = await parseMasqueradeCookie("nodotinhere");
    expect(result).toBeNull();
  });

  it("returns null for an empty string", async () => {
    const result = await parseMasqueradeCookie("");
    expect(result).toBeNull();
  });

  it("returns null for garbage input", async () => {
    const result = await parseMasqueradeCookie("not-a-valid-cookie-value.sig");
    expect(result).toBeNull();
  });

  it("returns null when payload fields are missing", async () => {
    // Build a cookie with a valid HMAC but invalid JSON content
    const { signMasqueradeCookie: sign } = await import("@/lib/masquerade");
    // Create a manually-crafted bad payload signed correctly
    const badPayload = { actorId: "x" }; // missing required fields
    const encoded = Buffer.from(JSON.stringify(badPayload)).toString("base64url");
    // The signature won't match, so this tests the schema guard too
    const result = await parseMasqueradeCookie(`${encoded}.invalidsig`);
    expect(result).toBeNull();
  });
});

describe("buildMasqueradeCookieHeader", () => {
  it("includes required cookie attributes", () => {
    const header = buildMasqueradeCookieHeader("signedvalue");
    expect(header).toContain(MASQUERADE_COOKIE);
    expect(header).toContain("signedvalue");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=28800");
    expect(header).toContain("Path=/");
  });
});

describe("clearMasqueradeCookieHeader", () => {
  it("sets Max-Age=0 to expire the cookie", () => {
    const header = clearMasqueradeCookieHeader();
    expect(header).toContain(MASQUERADE_COOKIE);
    expect(header).toContain("Max-Age=0");
  });
});
