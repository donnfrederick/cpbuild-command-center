import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { MasqueradeBanner } from "@/components/shared/MasqueradeBanner";
import type { MasqueradeContext } from "@/lib/masquerade";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const messages = {
  masquerade: {
    bannerLabel: "Masquerade active",
    viewingAs: "Viewing as",
    exitButton: "Exit Masquerade",
    exitingLabel: "Exiting…",
  },
};

const masqCtx: MasqueradeContext = {
  targetUserId: "user-2",
  targetUserName: "Bob Target",
  targetUserEmail: "bob@example.com",
  targetUserRole: "MEMBER",
  adminId: "admin-1",
  adminEmail: "admin@example.com",
};

function renderBanner(ctx: MasqueradeContext = masqCtx) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MasqueradeBanner masquerade={ctx} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("MasqueradeBanner", () => {
  it("renders the target user name and email", () => {
    renderBanner();
    expect(screen.getByText("Bob Target")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("falls back to email when targetUserName is null", () => {
    renderBanner({ ...masqCtx, targetUserName: null });
    expect(screen.getAllByText("bob@example.com").length).toBeGreaterThan(0);
  });

  it("renders with role=alert for accessibility", () => {
    renderBanner();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders the Exit Masquerade button", () => {
    renderBanner();
    expect(screen.getByRole("button", { name: /exit masquerade/i })).toBeInTheDocument();
  });

  it("calls DELETE /api/admin/masquerade and refreshes on exit", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => "" });
    renderBanner();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /exit masquerade/i }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/masquerade",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("still refreshes even when DELETE returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, text: async () => "error" });
    renderBanner();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /exit masquerade/i }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("still refreshes when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    renderBanner();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /exit masquerade/i }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("disables button and shows exiting label while loading", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderBanner();
    const user = userEvent.setup();
    const btn = screen.getByRole("button", { name: /exit masquerade/i });
    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveTextContent("Exiting…");
  });
});
