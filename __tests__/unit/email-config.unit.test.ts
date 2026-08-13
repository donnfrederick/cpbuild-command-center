import { describe, it, expect, vi, afterEach } from "vitest";
import { computeEmailConfig, resolveRecipient, maskEmail, isNonProd, buildInviteUrl, buildInviteEmailContent, buildPasswordResetUrl } from "@/lib/email";

describe("computeEmailConfig", () => {
  it("uses smtp transport when SMTP_HOST is set", () => {
    const config = computeEmailConfig({ SMTP_HOST: "localhost" });
    expect(config.transport).toBe("smtp");
    expect(config.smtpHostSet).toBe(true);
  });

  it("uses smtp transport when no valid Resend key is set", () => {
    const config = computeEmailConfig({});
    expect(config.transport).toBe("smtp");
    expect(config.resendKeySet).toBe(false);
    expect(config.resendKeyValid).toBe(false);
  });

  it("uses smtp transport when RESEND_API_KEY is a placeholder", () => {
    const config = computeEmailConfig({ RESEND_API_KEY: "re_YOUR_KEY_HERE" });
    expect(config.transport).toBe("smtp");
    expect(config.resendKeySet).toBe(true);
    expect(config.resendKeyValid).toBe(false);
  });

  it("uses resend transport when a real RESEND_API_KEY is set (no SMTP_HOST)", () => {
    const config = computeEmailConfig({ RESEND_API_KEY: "re_abc123" });
    expect(config.transport).toBe("resend");
    expect(config.resendKeySet).toBe(true);
    expect(config.resendKeyValid).toBe(true);
  });

  it("prefers smtp transport when both SMTP_HOST and a valid Resend key are set", () => {
    const config = computeEmailConfig({ SMTP_HOST: "localhost", RESEND_API_KEY: "re_abc123" });
    expect(config.transport).toBe("smtp");
  });

  it("reports emailFromSet as true when EMAIL_FROM is set", () => {
    const config = computeEmailConfig({ EMAIL_FROM: "noreply@example.com" });
    expect(config.emailFromSet).toBe(true);
  });

  it("reports emailFromSet as false when EMAIL_FROM is not set", () => {
    const config = computeEmailConfig({});
    expect(config.emailFromSet).toBe(false);
  });

  it("reports emailFromSet as false when EMAIL_FROM is an empty string", () => {
    const config = computeEmailConfig({ EMAIL_FROM: "" });
    expect(config.emailFromSet).toBe(false);
  });
});

describe("maskEmail()", () => {
  it("masks the local part leaving only the first character", () => {
    expect(maskEmail("psalter@cpbuild.com")).toBe("p***@cpbuild.com");
  });

  it("returns *** for very short local parts", () => {
    expect(maskEmail("a@b.com")).toBe("***");
  });

  it("returns *** when no @ symbol present", () => {
    expect(maskEmail("notanemail")).toBe("***");
  });
});

describe("isNonProd()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when NODE_ENV is development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isNonProd()).toBe(true);
  });

  it("returns false when NODE_ENV is production and APP_ENV is not dev", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    expect(isNonProd()).toBe(false);
  });

  it("returns true when NODE_ENV is production but APP_ENV is dev (Railway dev)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "dev");
    expect(isNonProd()).toBe(true);
  });
});

describe("buildInviteUrl()", () => {
  it("builds a URL with the default locale prefix", () => {
    expect(buildInviteUrl("https://example.com", "abc123")).toBe(
      "https://example.com/en/invite/abc123"
    );
  });

  it("strips a trailing slash from appUrl before building", () => {
    expect(buildInviteUrl("https://example.com/", "abc123")).toBe(
      "https://example.com/en/invite/abc123"
    );
  });

  it("works with localhost for local development", () => {
    expect(buildInviteUrl("http://localhost:3001", "tok-xyz")).toBe(
      "http://localhost:3001/en/invite/tok-xyz"
    );
  });
});

describe("buildPasswordResetUrl()", () => {
  it("builds reset URL with default locale prefix", () => {
    const token = "a".repeat(64);
    expect(buildPasswordResetUrl("https://example.com", token)).toBe(
      `https://example.com/en/reset-password/${token}`
    );
  });
});

describe("resolveRecipient()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns original address when DEV_EMAIL_OVERRIDE is not set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EMAIL_OVERRIDE", "");
    expect(resolveRecipient("user@example.com")).toBe("user@example.com");
  });

  it("redirects to override address in non-prod when DEV_EMAIL_OVERRIDE is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EMAIL_OVERRIDE", "dev@cpbuild.com");
    expect(resolveRecipient("user@example.com")).toBe("dev@cpbuild.com");
  });

  it("does NOT redirect in production even when DEV_EMAIL_OVERRIDE is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("DEV_EMAIL_OVERRIDE", "dev@cpbuild.com");
    expect(resolveRecipient("user@example.com")).toBe("user@example.com");
  });

  it("redirects in Railway dev (NODE_ENV=production, APP_ENV=dev)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "dev");
    vi.stubEnv("DEV_EMAIL_OVERRIDE", "dev@cpbuild.com");
    expect(resolveRecipient("user@example.com")).toBe("dev@cpbuild.com");
  });
});

describe("buildInviteEmailContent()", () => {
  it("adds [DEV] prefix to subject in non-prod", () => {
    const { subject } = buildInviteEmailContent(
      { to: "user@example.com", inviterName: "Phil", inviteUrl: "https://example.com/invite/tok" },
      { nonProd: true, isRedirected: false }
    );
    expect(subject).toMatch(/^\[DEV\]/);
  });

  it("does not add [DEV] prefix to subject in prod", () => {
    const { subject } = buildInviteEmailContent(
      { to: "user@example.com", inviterName: "Phil", inviteUrl: "https://example.com/invite/tok" },
      { nonProd: false, isRedirected: false }
    );
    expect(subject).not.toMatch(/^\[DEV\]/);
  });

  it("uses explicit inviteeName for greeting", () => {
    const { html } = buildInviteEmailContent(
      { to: "donn.frederick@cp.build", inviterName: "Phil", inviteeName: "Donn" },
      { nonProd: false, isRedirected: false }
    );
    expect(html).toContain("Hi Donn,");
  });

  it("falls back to email local-part for greeting when inviteeName is omitted", () => {
    const { html } = buildInviteEmailContent(
      { to: "donn.frederick@cp.build", inviterName: "Phil" },
      { nonProd: false, isRedirected: false }
    );
    expect(html).toContain("Hi Donn,");
  });

  it("includes role line when roleName is provided", () => {
    const { html } = buildInviteEmailContent(
      { to: "user@cp.build", inviterName: "Phil", roleName: "Member" },
      { nonProd: false, isRedirected: false }
    );
    expect(html).toContain("You'll join as a");
    expect(html).toContain("Member");
  });

  it("shows dev redirect banner when isRedirected is true and nonProd is true", () => {
    const { html } = buildInviteEmailContent(
      { to: "user@cp.build", inviterName: "Phil" },
      { nonProd: true, isRedirected: true }
    );
    expect(html).toContain("DEV environment");
    expect(html).toContain("user@cp.build");
  });

  it("does not show dev banner when nonProd is false even with forceDevBanner", () => {
    const { html } = buildInviteEmailContent(
      { to: "user@cp.build", inviterName: "Phil", forceDevBanner: true },
      { nonProd: false, isRedirected: false }
    );
    expect(html).not.toContain("DEV environment");
  });

  it("sanitizes CR/LF from inviterName in subject to prevent header injection", () => {
    const { subject } = buildInviteEmailContent(
      { to: "user@cp.build", inviterName: "Phil\r\nBcc: evil@hack.com" },
      { nonProd: false, isRedirected: false }
    );
    expect(subject).not.toContain("\r");
    expect(subject).not.toContain("\n");
    expect(subject).toContain("Phil");
  });
});
