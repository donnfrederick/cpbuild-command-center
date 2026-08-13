import { describe, it, expect } from "vitest";
import {
  generateResetToken,
  hashToken,
  PASSWORD_RESET_EXPIRY_MS,
  RESET_TOKEN_EXPIRY_MS,
  MAX_RESETS_PER_HOUR,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from "@/lib/password-reset";

describe("generateResetToken()", () => {
  it("returns a 64-character hex string", () => {
    const token = generateResetToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("returns different values on consecutive calls", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).not.toBe(b);
  });
});

describe("hashToken()", () => {
  it("returns a 64-character hex SHA-256 hash", () => {
    const hash = hashToken("abc");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("abc")).not.toBe(hashToken("ABC"));
  });

  it("hashes a real generated token to a different value", () => {
    const token = generateResetToken();
    const hash = hashToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
  });
});

describe("constants", () => {
  it("PASSWORD_RESET_EXPIRY_MS is 72 hours (matches admin reset links)", () => {
    expect(PASSWORD_RESET_EXPIRY_MS).toBe(72 * 60 * 60 * 1000);
    expect(RESET_TOKEN_EXPIRY_MS).toBe(PASSWORD_RESET_EXPIRY_MS);
  });

  it("MAX_RESETS_PER_HOUR is 3", () => {
    expect(MAX_RESETS_PER_HOUR).toBe(3);
  });

  it("MAX_LOGIN_ATTEMPTS is 5", () => {
    expect(MAX_LOGIN_ATTEMPTS).toBe(5);
  });

  it("LOCKOUT_DURATION_MS is 30 minutes", () => {
    expect(LOCKOUT_DURATION_MS).toBe(30 * 60 * 1000);
  });
});
