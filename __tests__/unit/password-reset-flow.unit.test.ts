import { describe, it, expect } from "vitest";
import { shouldSignOutBeforeResetForm } from "@/lib/password-reset";

describe("shouldSignOutBeforeResetForm()", () => {
  it("returns true when there is a session and the token is still valid", () => {
    expect(shouldSignOutBeforeResetForm(true, false)).toBe(true);
  });

  it("returns false when there is no session", () => {
    expect(shouldSignOutBeforeResetForm(false, false)).toBe(false);
  });

  it("returns false when the token is expired or used (do not sign out)", () => {
    expect(shouldSignOutBeforeResetForm(true, true)).toBe(false);
  });
});
