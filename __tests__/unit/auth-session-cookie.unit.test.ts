import { describe, expect, it } from "vitest";
import { hasAuthJsSessionCookie } from "@/lib/auth-session-cookie";

describe("hasAuthJsSessionCookie()", () => {
  it("returns true for unchunked HTTP dev cookie name", () => {
    expect(hasAuthJsSessionCookie([{ name: "authjs.session-token" }])).toBe(true);
  });

  it("returns true for unchunked HTTPS __Secure- cookie name", () => {
    expect(hasAuthJsSessionCookie([{ name: "__Secure-authjs.session-token" }])).toBe(true);
  });

  it("returns true for chunked session cookies", () => {
    expect(
      hasAuthJsSessionCookie([
        { name: "__Secure-authjs.session-token.0" },
        { name: "__Secure-authjs.session-token.1" },
      ])
    ).toBe(true);
  });

  it("returns false for unrelated cookies", () => {
    expect(
      hasAuthJsSessionCookie([{ name: "authjs.csrf-token" }, { name: "__Host-authjs.csrf-token" }])
    ).toBe(false);
  });
});
