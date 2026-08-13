import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resendInvite } from "@/lib/invites";

describe("resendInvite()", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("calls POST /api/invites/:id/resend and returns data on success", async () => {
    const payload = { id: "inv_1", email: "team@example.com" };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: payload }),
    });

    const result = await resendInvite("inv_1");
    expect(result).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/invites/inv_1/resend", { method: "POST" });
  });

  it("throws an error with the `error` field when the response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Invite not found" }),
    });

    await expect(resendInvite("missing")).rejects.toThrow("Invite not found");
  });

  it("includes detail in the thrown error message when present", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          error: "INVITE_EMAIL_RATE_LIMITED",
          detail: "Too many invite emails from your account. Try again later.",
        }),
    });

    await expect(resendInvite("inv_2")).rejects.toThrow(
      "INVITE_EMAIL_RATE_LIMITED: Too many invite emails from your account. Try again later."
    );
  });

  it("surfaces INVITE_RECIPIENT_EMAIL_RATE_LIMITED detail from the API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: "INVITE_RECIPIENT_EMAIL_RATE_LIMITED",
        detail: "Too many invitation emails were sent to this address recently.",
      }),
    } as Response);
    await expect(resendInvite("inv_4")).rejects.toThrow(
      "INVITE_RECIPIENT_EMAIL_RATE_LIMITED: Too many invitation emails were sent to this address recently."
    );
  });

  it("falls back to 'Failed to send invite email' when error field is missing", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    await expect(resendInvite("inv_3")).rejects.toThrow("Failed to send invite email");
  });
});
