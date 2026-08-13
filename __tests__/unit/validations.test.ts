import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema, acceptInviteSchema } from "@/lib/validations/auth";
import { createInviteSchema } from "@/lib/validations/invite";

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const validPayload = {
    name: "Alice Smith",
    email: "alice@example.com",
    password: "Secure123",
    confirmPassword: "Secure123",
  };

  it("accepts valid registration data", () => {
    expect(registerSchema.safeParse(validPayload).success).toBe(true);
  });

  it("rejects password without uppercase letter", () => {
    const result = registerSchema.safeParse({ ...validPayload, password: "secure123", confirmPassword: "secure123" });
    expect(result.success).toBe(false);
  });

  it("rejects password without number", () => {
    const result = registerSchema.safeParse({ ...validPayload, password: "SecurePassword", confirmPassword: "SecurePassword" });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({ ...validPayload, confirmPassword: "Different123" });
    expect(result.success).toBe(false);
  });
});

describe("createInviteSchema", () => {
  it("accepts valid invite with roleId", () => {
    const result = createInviteSchema.safeParse({
      email: "new@example.com",
      roleId: "role-member-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("new@example.com");
      expect(result.data.roleId).toBe("role-member-123");
    }
  });

  it("rejects invite without roleId", () => {
    const result = createInviteSchema.safeParse({ email: "new@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects invite with empty roleId", () => {
    const result = createInviteSchema.safeParse({
      email: "new@example.com",
      roleId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createInviteSchema.safeParse({
      email: "not-valid",
      roleId: "role-123",
    });
    expect(result.success).toBe(false);
  });
});

describe("acceptInviteSchema", () => {
  const validPayload = {
    token: "some-token",
    name: "Bob Jones",
    password: "Secure123",
    confirmPassword: "Secure123",
  };

  it("accepts valid accept-invite data", () => {
    expect(acceptInviteSchema.safeParse(validPayload).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = acceptInviteSchema.safeParse({ ...validPayload, confirmPassword: "Different123" });
    expect(result.success).toBe(false);
  });
});
