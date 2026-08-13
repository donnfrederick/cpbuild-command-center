import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { MasqueradeButton } from "@/components/users/MasqueradeButton";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const messages = {
  masquerade: {
    maskAsTitle: "Masquerade as {name}",
    maskAsButton: "Masquerade",
  },
};

function renderBtn(props: { userId?: string; userName?: string | null; userEmail?: string } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MasqueradeButton
        userId={props.userId ?? "user-1"}
        userName={"userName" in props ? (props.userName as string | null) : "Alice"}
        userEmail={props.userEmail ?? "alice@example.com"}
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("MasqueradeButton", () => {
  it("renders a button with the user display name", () => {
    renderBtn({ userName: "Alice" });
    expect(screen.getByRole("button", { name: /masquerade as alice/i })).toBeInTheDocument();
  });

  it("falls back to email when userName is null", () => {
    renderBtn({ userName: null, userEmail: "bob@example.com" });
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", expect.stringContaining("bob@example.com"));
  });

  it("calls POST /api/admin/masquerade with userId and refreshes on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    renderBtn();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /masquerade as alice/i }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/masquerade",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.targetUserId).toBe("user-1");
  });

  it("does not refresh when API returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Forbidden" }),
    });
    renderBtn();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /masquerade as alice/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("does not refresh when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    renderBtn();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /masquerade as alice/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("is disabled and shows … while loading", async () => {
    // Never resolves
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderBtn();
    const user = userEvent.setup();
    const btn = screen.getByRole("button", { name: /masquerade as alice/i });
    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveTextContent("…");
  });
});
