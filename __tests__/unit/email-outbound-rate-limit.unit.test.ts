import { describe, it, expect, beforeEach, vi } from "vitest";

describe("email-outbound-rate-limit", () => {
  beforeEach(async () => {
    const { resetEmailOutboundRateLimitForTests } = await import("@/lib/email-outbound-rate-limit");
    resetEmailOutboundRateLimitForTests();
  });

  it("tryRecordEmailOutbound allows up to max in window", async () => {
    const { tryRecordEmailOutbound, resetEmailOutboundRateLimitForTests } = await import(
      "@/lib/email-outbound-rate-limit"
    );
    const limits = { windowMs: 60_000, max: 3 };
    expect(tryRecordEmailOutbound("scope-a", limits).ok).toBe(true);
    expect(tryRecordEmailOutbound("scope-a", limits).ok).toBe(true);
    expect(tryRecordEmailOutbound("scope-a", limits).ok).toBe(true);
    expect(tryRecordEmailOutbound("scope-a", limits).ok).toBe(false);
    resetEmailOutboundRateLimitForTests();
  });

  it("tryRecordMentionEmailBatch respects per-minute and per-hour caps", async () => {
    const { tryRecordMentionEmailBatch, resetEmailOutboundRateLimitForTests } = await import(
      "@/lib/email-outbound-rate-limit"
    );
    expect(tryRecordMentionEmailBatch("user-1", 30).ok).toBe(true);
    expect(tryRecordMentionEmailBatch("user-1", 10).ok).toBe(false);
    resetEmailOutboundRateLimitForTests();
  });

  it("capMentionIdsForBroadcast truncates to 25", async () => {
    const { capMentionIdsForBroadcast, MAX_MENTION_EMAIL_RECIPIENTS_PER_REQUEST } = await import(
      "@/lib/email-outbound-rate-limit"
    );
    const ids = Array.from({ length: 30 }, (_, i) => `id-${i}`);
    const capped = capMentionIdsForBroadcast(ids);
    expect(capped).toHaveLength(MAX_MENTION_EMAIL_RECIPIENTS_PER_REQUEST);
    expect(capped[0]).toBe("id-0");
  });

  it("capMentionIdsForBroadcast emits [email_security] when truncating with log context", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { capMentionIdsForBroadcast, MAX_MENTION_EMAIL_RECIPIENTS_PER_REQUEST, resetEmailOutboundRateLimitForTests } =
      await import("@/lib/email-outbound-rate-limit");
    const ids = Array.from({ length: 30 }, (_, i) => `id-${i}`);
    capMentionIdsForBroadcast(ids, {
      source: "feedback_comment",
      actorUserId: "actor-1",
      feedbackId: "fb-1",
    });
    const line = warn.mock.calls.find((c) => c[0] === "[email_security]");
    expect(line).toBeDefined();
    const payload = JSON.parse(String(line?.[1]));
    expect(payload.event).toBe("mention_email_recipients_truncated");
    expect(payload.requestedCount).toBe(30);
    expect(payload.limit).toBe(MAX_MENTION_EMAIL_RECIPIENTS_PER_REQUEST);
    warn.mockRestore();
    resetEmailOutboundRateLimitForTests();
  });

  it("tryRecordGlobalOutboundEmailSend respects the shared global budget", async () => {
    const {
      tryRecordEmailOutboundBatch,
      tryRecordGlobalOutboundEmailSend,
      GLOBAL_OUTBOUND_EMAIL_WINDOW_MS,
      GLOBAL_OUTBOUND_EMAIL_MAX,
      resetEmailOutboundRateLimitForTests,
    } = await import("@/lib/email-outbound-rate-limit");

    expect(
      tryRecordEmailOutboundBatch("global-outbound-email:process", GLOBAL_OUTBOUND_EMAIL_MAX, {
        windowMs: GLOBAL_OUTBOUND_EMAIL_WINDOW_MS,
        max: GLOBAL_OUTBOUND_EMAIL_MAX,
      }).ok
    ).toBe(true);
    expect(tryRecordGlobalOutboundEmailSend().ok).toBe(false);
    resetEmailOutboundRateLimitForTests();
  });

  it("inviteRecipientScopeKey is case-insensitive for the same address", async () => {
    const { inviteRecipientScopeKey } = await import("@/lib/email-outbound-rate-limit");
    expect(inviteRecipientScopeKey("User@Example.COM")).toBe(inviteRecipientScopeKey("  user@example.com  "));
  });

  it("hashForEmailSecurityLog returns a stable short hex prefix", async () => {
    const { hashForEmailSecurityLog } = await import("@/lib/email-outbound-rate-limit");
    expect(hashForEmailSecurityLog("203.0.113.1")).toHaveLength(16);
    expect(hashForEmailSecurityLog("203.0.113.1")).toBe(hashForEmailSecurityLog("203.0.113.1"));
  });
});
