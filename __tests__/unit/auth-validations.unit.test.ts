import { describe, it, expect } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "@/lib/validations/auth";

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "user@cpbuild.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "notanemail" }).success).toBe(false);
  });

  it("rejects empty email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const VALID = {
    token: "a".repeat(64),
    password: "SecurePass1!",
    confirmPassword: "SecurePass1!",
  };

  it("accepts a valid reset payload", () => {
    expect(resetPasswordSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = resetPasswordSchema.safeParse({ ...VALID, confirmPassword: "Different1!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });

  it("rejects password without uppercase", () => {
    const result = resetPasswordSchema.safeParse({
      ...VALID,
      password: "alllower1!",
      confirmPassword: "alllower1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without a number", () => {
    const result = resetPasswordSchema.safeParse({
      ...VALID,
      password: "NoNumbers!",
      confirmPassword: "NoNumbers!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without a special character", () => {
    const result = resetPasswordSchema.safeParse({
      ...VALID,
      password: "NoSpecial1A",
      confirmPassword: "NoSpecial1A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = resetPasswordSchema.safeParse({
      ...VALID,
      password: "Ab1!",
      confirmPassword: "Ab1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing token", () => {
    const result = resetPasswordSchema.safeParse({ ...VALID, token: "" });
    expect(result.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const VALID = {
    currentPassword: "OldPass1!",
    newPassword: "NewPass1!",
    confirmPassword: "NewPass1!",
  };

  it("accepts a valid change payload", () => {
    expect(changePasswordSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects when new password equals current password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "SamePass1!",
      newPassword: "SamePass1!",
      confirmPassword: "SamePass1!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("newPassword"))).toBe(true);
    }
  });

  it("rejects mismatched confirmPassword", () => {
    const result = changePasswordSchema.safeParse({ ...VALID, confirmPassword: "WrongPass1!" });
    expect(result.success).toBe(false);
  });

  it("rejects empty currentPassword", () => {
    const result = changePasswordSchema.safeParse({ ...VALID, currentPassword: "" });
    expect(result.success).toBe(false);
  });
});
