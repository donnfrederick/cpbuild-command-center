import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetEmailOutboundRateLimitForTests, DEVTOOLS_TEST_EMAIL_MAX } from "@/lib/email-outbound-rate-limit";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/email", () => ({
  sendTestEmail: vi.fn(),
  getEmailConfig: vi.fn(),
}));
vi.mock("@/lib/devtools-env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/devtools-env")>();
  return { ...actual, isDevToolsAllowed: vi.fn() };
});

describe("GET /api/devtools/test-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 403 when DevTools are not allowed", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    vi.mocked(isDevToolsAllowed).mockReturnValue(false);

    const { GET } = await import("@/app/api/devtools/test-email/route");
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toContain("DevTools are only available");
  });

  it("returns 401 when unauthenticated", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/devtools/test-email/route");
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not an admin", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "User", email: "u@test.com", role: "MEMBER" },
    } as never);

    const { GET } = await import("@/app/api/devtools/test-email/route");
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns email config for admin user", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    const { getEmailConfig } = await import("@/lib/email");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(getEmailConfig).mockReturnValue({
      transport: "smtp",
      resendKeySet: false,
      resendKeyValid: false,
      emailFromSet: false,
      smtpHostSet: false,
    });

    const { GET } = await import("@/app/api/devtools/test-email/route");
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data.transport).toBe("smtp");
    expect(data.hint).toContain("SMTP");
  });

  it("returns email config for ADMIN user", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    const { getEmailConfig } = await import("@/lib/email");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u2", name: "Super", email: "s@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(getEmailConfig).mockReturnValue({
      transport: "resend",
      resendKeySet: true,
      resendKeyValid: true,
      emailFromSet: true,
      smtpHostSet: false,
    });

    const { GET } = await import("@/app/api/devtools/test-email/route");
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data.transport).toBe("resend");
    expect(data.hint).toContain("Resend");
  });
});

describe("POST /api/devtools/test-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailOutboundRateLimitForTests();
    process.env.DEV_BYPASS_AUTH = "false";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 403 when DevTools are not allowed", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    vi.mocked(isDevToolsAllowed).mockReturnValue(false);

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const res = await POST(
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "test@example.com" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toContain("DevTools are only available");
  });

  it("returns 401 when unauthenticated", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const res = await POST(
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "test@example.com" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not an admin", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "User", email: "u@test.com", role: "TEAM_LEAD" },
    } as never);

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const res = await POST(
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "test@example.com" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 422 for invalid email (no @)", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const res = await POST(
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "notanemail" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(422);
    expect(data.error).toBe("Valid email address required");
  });

  it("returns 422 for edge-case emails that pass @ check but are invalid", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const res = await POST(
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "@" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(422);
  });

  it("sends test email via SMTP and returns result", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    const { sendTestEmail } = await import("@/lib/email");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(sendTestEmail).mockResolvedValueOnce({ transport: "smtp", messageId: "msg-001" });

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const res = await POST(
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "test@example.com" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data.to).toBe("test@example.com");
    expect(data.data.transport).toBe("smtp");
    expect(data.data.messageId).toBe("msg-001");
    expect(data.data.message).toContain("SMTP");
  });

  it("sends test email via Resend and returns result", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    const { sendTestEmail } = await import("@/lib/email");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(sendTestEmail).mockResolvedValueOnce({ transport: "resend", messageId: "resend-msg-002" });

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const res = await POST(
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "test@example.com" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data.transport).toBe("resend");
    expect(data.data.message).toContain("Resend");
  });

  it("returns 429 when admin exceeds test-email hourly cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    const { sendTestEmail } = await import("@/lib/email");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u-rate-cap-test", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(sendTestEmail).mockResolvedValue({ transport: "smtp", messageId: "x" });

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const req = () =>
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "test@example.com" }),
      });

    for (let i = 0; i < DEVTOOLS_TEST_EMAIL_MAX; i++) {
      const r = await POST(req());
      expect(r.status).toBe(200);
    }
    const res = await POST(req());
    const data = await res.json();
    expect(res.status).toBe(429);
    expect(data.error).toBe("TEST_EMAIL_RATE_LIMITED");
    expect(sendTestEmail).toHaveBeenCalledTimes(DEVTOOLS_TEST_EMAIL_MAX);
    const sec = warn.mock.calls.find((c) => c[0] === "[email_security]");
    expect(JSON.parse(String(sec?.[1])).event).toBe("devtools_test_email_throttled");
    warn.mockRestore();
  });

  it("returns 500 when sendTestEmail throws", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const { auth } = await import("@/lib/auth");
    const { sendTestEmail } = await import("@/lib/email");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(sendTestEmail).mockRejectedValueOnce(new Error("SMTP connection refused"));

    const { POST } = await import("@/app/api/devtools/test-email/route");
    const res = await POST(
      new Request("http://localhost/api/devtools/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "test@example.com" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe("Failed to send test email");
    expect(data.detail).toBe("SMTP connection refused");
  });
});
