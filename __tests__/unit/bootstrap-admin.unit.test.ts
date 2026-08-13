import { describe, it, expect } from "vitest";
import { isPlaceholderCredential } from "@/scripts/bootstrap-utils";

describe("isPlaceholderCredential()", () => {
  it("returns true for the exact placeholder email from .env.example", () => {
    expect(isPlaceholderCredential("admin@yourdomain.com", "StrongP@ssw0rd!")).toBe(true);
  });

  it("returns true for the exact placeholder password from .env.example", () => {
    expect(isPlaceholderCredential("admin@example.com", "replace-with-a-strong-password")).toBe(true);
  });

  it("returns true when both email and password are placeholders", () => {
    expect(isPlaceholderCredential("admin@yourdomain.com", "replace-with-a-strong-password")).toBe(true);
  });

  it("returns false for real credentials", () => {
    expect(isPlaceholderCredential("admin@cpbuild.com", "StrongP@ssw0rd!")).toBe(false);
  });

  it("returns false when email contains 'yourdomain.com' but is not the exact placeholder", () => {
    expect(isPlaceholderCredential("user@yourdomain.com", "StrongP@ssw0rd!")).toBe(false);
  });

  it("returns false when password contains 'replace' but is not the exact placeholder", () => {
    expect(isPlaceholderCredential("admin@cpbuild.com", "IreplaceablePass123!")).toBe(false);
  });

  it("returns false when password contains 'REPLACE' but is not the exact placeholder", () => {
    expect(isPlaceholderCredential("admin@cpbuild.com", "MyREPLACEMENT-secret1!")).toBe(false);
  });

  it("returns false for undefined email", () => {
    expect(isPlaceholderCredential(undefined, "StrongP@ssw0rd!")).toBe(false);
  });

  it("returns false for undefined password", () => {
    expect(isPlaceholderCredential("admin@cpbuild.com", undefined)).toBe(false);
  });

  it("returns false when both are undefined", () => {
    expect(isPlaceholderCredential(undefined, undefined)).toBe(false);
  });
});
