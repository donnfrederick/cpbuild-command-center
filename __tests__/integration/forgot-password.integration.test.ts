import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/forgot-password/route";
import { resetEmailOutboundRateLimitForTests } from "@/lib/email-outbound-rate-limit";

// Mock DB
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCount = vi.fn();
const mockDeleteMany = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    passwordResetToken: {
      count: (...args: unknown[]) => mockCount(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// Mock email — we don't want real emails in tests
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

const ALWAYS_OK_MESSAGE = "If that email is registered, a reset link has been sent.";

function makeRequest(body: unknown, headersInit?: HeadersInit) {
  const headers = new Headers(headersInit ?? { "Content-Type": "application/json" });
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailOutboundRateLimitForTests();
  });

  it("returns 200 with the same message for unregistered email (no enumeration)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ email: "nobody@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe(ALWAYS_OK_MESSAGE);
  });

  it("returns 200 and sends reset email for a registered user", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "admin@example.com",
      passwordHash: "hashed",
      role: { code: "MEMBER" },
    });
    mockCount.mockResolvedValueOnce(0);
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    mockCreate.mockResolvedValueOnce({ id: "tok-1" });

    const res = await POST(makeRequest({ email: "admin@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe(ALWAYS_OK_MESSAGE);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("finds user by case-insensitive email and sends to stored address", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockFindFirst.mockResolvedValueOnce({
      id: "user-1",
      email: "Admin@Example.com",
      passwordHash: "hashed",
      role: { code: "MEMBER" },
    });
    mockCount.mockResolvedValueOnce(0);
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    mockCreate.mockResolvedValueOnce({ id: "tok-1" });

    const { sendPasswordResetEmail } = await import("@/lib/email");

    const res = await POST(makeRequest({ email: "admin@example.com" }));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: "Admin@Example.com",
      token: expect.any(String),
    });
  });

  it("returns 200 (silently rate-limits) when too many recent tokens exist", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "admin@example.com",
      passwordHash: "hashed",
    });
    mockCount.mockResolvedValueOnce(3); // At the limit

    const res = await POST(makeRequest({ email: "admin@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe(ALWAYS_OK_MESSAGE);
    // Should NOT create a new token
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("logs [email_security] when per-target forgot-password token cap trips", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFindUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "admin@example.com",
      passwordHash: "hashed",
    });
    mockCount.mockResolvedValueOnce(3);

    await POST(makeRequest({ email: "admin@example.com" }));

    const line = warn.mock.calls.find((c) => c[0] === "[email_security]");
    expect(line).toBeDefined();
    const payload = JSON.parse(String(line?.[1]));
    expect(payload.event).toBe("forgot_password_target_email_throttled");
    expect(payload.emailParamHash).toMatch(/^[a-f0-9]{16}$/);
    warn.mockRestore();
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await POST(makeRequest({ email: "notanemail" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing body", async () => {
    const req = new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns same 200 and skips DB after IP exceeds forgot-password outbound window", async () => {
    mockFindUnique.mockResolvedValue(null);
    const hdr = { "x-forwarded-for": "203.0.113.50" };
    for (let i = 0; i < 20; i++) {
      const res = await POST(makeRequest({ email: `u${i}@example.com` }, hdr));
      expect(res.status).toBe(200);
    }
    const res21 = await POST(makeRequest({ email: "last@example.com" }, hdr));
    expect(res21.status).toBe(200);
    expect(mockFindUnique).toHaveBeenCalledTimes(20);
  });

  it("logs [email_security] when forgot-password IP throttle trips", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFindUnique.mockResolvedValue(null);
    const hdr = { "x-forwarded-for": "198.51.100.22" };
    for (let i = 0; i < 20; i++) {
      await POST(makeRequest({ email: `probe${i}@example.com` }, hdr));
    }
    await POST(makeRequest({ email: "probe21@example.com" }, hdr));
    const securityLine = warn.mock.calls.find((args) => args[0] === "[email_security]");
    expect(securityLine).toBeDefined();
    const payload = JSON.parse(String(securityLine?.[1]));
    expect(payload.event).toBe("forgot_password_ip_throttled");
    expect(payload.clientIpHash).toMatch(/^[a-f0-9]{16}$/);
    warn.mockRestore();
  });

  it("returns same 200 response for users without a password (OAuth-only accounts)", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "user-2",
      email: "oauthonly@example.com",
      passwordHash: null,
    });

    const res = await POST(makeRequest({ email: "oauthonly@example.com" }));
    expect(res.status).toBe(200);
    // No token should be created for OAuth-only accounts
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
