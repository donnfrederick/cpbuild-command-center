import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SubcontractorPicker, _resetSubcontractorCache, readRecentSubs, writeRecentSub } from "@/components/projects/SubcontractorPicker";
import type { ReactNode } from "react";

vi.mock("@/lib/offline/snapshot-cache", () => ({
  readSnapshotModule: vi.fn(),
}));

import { readSnapshotModule } from "@/lib/offline/snapshot-cache";

// ── i18n wrapper ──────────────────────────────────────────────────────────────

const MESSAGES = {
  units: {
    unassigned: "Unassigned",
    subcontractorLabel: "Subcontractor",
    subcontractorLoading: "Loading…",
    subcontractorError: "Failed to load",
    subcontractorSearchPlaceholder: "Search subcontractors…",
    subcontractorNoResults: "No subcontractors match",
    pickerSheetClose: "Close",
    recentSubcontractors: "Recent",
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MOCK_SUBS = [
  { id: "sub-1", name: "Acme Tile" },
  { id: "sub-2", name: "Best Electrical" },
];

function mockFetchSubs(subs = MOCK_SUBS, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok,
        json: () => Promise.resolve({ subcontractors: ok ? subs : [] }),
      } as Response)
    )
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); }),
};

describe("SubcontractorPicker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    _resetSubcontractorCache();
    localStorageMock.clear();
    vi.stubGlobal("localStorage", localStorageMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows loading state while fetch is in flight", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<SubcontractorPicker value={null} />, { wrapper: Wrapper });
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("renders a tappable pill button after subs load", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value={null} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    const pill = screen.getByRole("button", { name: /Subcontractor.*Unassigned/i });
    expect(pill).toBeDefined();
  });

  it("renders full-width field styling when fullWidth is set", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value={null} fullWidth />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    const pill = screen.getByRole("button", { name: /Subcontractor.*Unassigned/i });
    expect(pill.style.width).toBe("100%");
    expect(pill.style.borderRadius).toBe("8px");
    expect(pill.parentElement?.style.width).toBe("100%");
  });

  it("shows resolved sub name on the pill when value is set", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value="sub-1" />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    expect(screen.getByRole("button", { name: /Subcontractor.*Acme Tile/i })).toBeDefined();
  });

  it("opens list when pill is clicked", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value={null} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
    await waitFor(() => {
      expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Best Electrical").length).toBeGreaterThan(0);
    });
  });

  it("filters the list when search is typed", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value={null} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
    await waitFor(() => expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0));
    const searchInput = screen.getByPlaceholderText("Search subcontractors…");
    fireEvent.change(searchInput, { target: { value: "acme" } });
    await waitFor(() => {
      expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0);
      expect(screen.queryByText("Best Electrical")).toBeNull();
    });
  });

  it("shows no-results message when search yields nothing", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value={null} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
    await waitFor(() => expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0));
    fireEvent.change(screen.getByPlaceholderText("Search subcontractors…"), { target: { value: "zzznomatch" } });
    await waitFor(() => expect(screen.getByText("No subcontractors match")).toBeDefined());
  });

  it("calls onChange when a sub is selected from the list", async () => {
    mockFetchSubs();
    const onChange = vi.fn();
    render(<SubcontractorPicker value={null} onChange={onChange} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
    await waitFor(() => expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0));
    // Click the list row (not the pill — the list items are option buttons)
    const options = screen.getAllByRole("option");
    const acmeOption = options.find((o) => o.textContent?.includes("Acme Tile"));
    fireEvent.click(acmeOption!);
    expect(onChange).toHaveBeenCalledWith("sub-1", "Acme Tile");
  });

  it("calls onChange with null when Unassigned is clicked", async () => {
    mockFetchSubs();
    const onChange = vi.fn();
    render(<SubcontractorPicker value="sub-1" onChange={onChange} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
    await waitFor(() => expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0));
    const options = screen.getAllByRole("option");
    const unassigned = options.find((o) => o.textContent?.includes("Unassigned"));
    fireEvent.click(unassigned!);
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it("renders as read-only text when readOnly is true", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value="sub-1" readOnly />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Acme Tile")).toBeDefined();
  });

  it("renders Unassigned as read-only text when value is null and readOnly", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value={null} readOnly />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    expect(screen.getByText("Unassigned")).toBeDefined();
  });

  it("pill button is disabled when disabled prop is true", async () => {
    mockFetchSubs();
    render(<SubcontractorPicker value={null} disabled />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    const pill = screen.getByRole("button", { name: /Subcontractor/i });
    expect((pill as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Recent picks ────────────────────────────────────────────────────────────

  describe("Recent picks", () => {
    it("shows 'Recent' section header when localStorage is pre-seeded", async () => {
      writeRecentSub("user-1", "proj-1", { id: "sub-1", name: "Acme Tile" });
      mockFetchSubs();
      render(
        <SubcontractorPicker value={null} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getByText("Recent")).toBeDefined());
    });

    it("does not show 'Recent' section when no recents exist for this user+project", async () => {
      mockFetchSubs();
      render(
        <SubcontractorPicker value={null} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0));
      expect(screen.queryByText("Recent")).toBeNull();
    });

    it("hides 'Recent' section when search query is non-empty", async () => {
      writeRecentSub("user-1", "proj-1", { id: "sub-1", name: "Acme Tile" });
      mockFetchSubs();
      render(
        <SubcontractorPicker value={null} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getByText("Recent")).toBeDefined());
      fireEvent.change(screen.getByPlaceholderText("Search subcontractors…"), { target: { value: "acme" } });
      await waitFor(() => expect(screen.queryByText("Recent")).toBeNull());
    });

    it("writes to localStorage when a sub is picked", async () => {
      mockFetchSubs();
      const onChange = vi.fn();
      render(
        <SubcontractorPicker value={null} onChange={onChange} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0));
      const options = screen.getAllByRole("option");
      const acmeOption = options.find((o) => o.textContent?.includes("Acme Tile"));
      fireEvent.click(acmeOption!);
      await waitFor(() => {
        const recents = readRecentSubs("user-1", "proj-1");
        expect(recents).toHaveLength(1);
        expect(recents[0].id).toBe("sub-1");
        expect(recents[0].name).toBe("Acme Tile");
      });
    });

    it("does not write recent when onChange returns false", async () => {
      mockFetchSubs();
      const onChange = vi.fn(() => false);
      render(
        <SubcontractorPicker value={null} onChange={onChange} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0));
      const options = screen.getAllByRole("option");
      const acmeOption = options.find((o) => o.textContent?.includes("Acme Tile"));
      fireEvent.click(acmeOption!);
      await waitFor(() => expect(onChange).toHaveBeenCalledWith("sub-1", "Acme Tile"));
      expect(readRecentSubs("user-1", "proj-1")).toHaveLength(0);
    });

    it("does not write recent when onChange promise rejects", async () => {
      mockFetchSubs();
      const onChange = vi.fn(() => Promise.reject(new Error("save failed")));
      render(
        <SubcontractorPicker value={null} onChange={onChange} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0));
      const options = screen.getAllByRole("option");
      const acmeOption = options.find((o) => o.textContent?.includes("Acme Tile"));
      fireEvent.click(acmeOption!);
      await waitFor(() => expect(onChange).toHaveBeenCalledWith("sub-1", "Acme Tile"));
      await waitFor(() => expect(readRecentSubs("user-1", "proj-1")).toHaveLength(0));
    });

    it("deduplicates recents when the same sub is picked again", () => {
      writeRecentSub("user-1", "proj-1", { id: "sub-1", name: "Acme Tile" });
      writeRecentSub("user-1", "proj-1", { id: "sub-2", name: "Best Electrical" });
      writeRecentSub("user-1", "proj-1", { id: "sub-1", name: "Acme Tile" });
      const recents = readRecentSubs("user-1", "proj-1");
      // sub-1 should appear once (most recently picked), at the top
      expect(recents.filter((r) => r.id === "sub-1")).toHaveLength(1);
      expect(recents[0].id).toBe("sub-1");
    });

    it("caps recents at 5 entries", () => {
      for (let i = 1; i <= 7; i++) {
        writeRecentSub("user-1", "proj-1", { id: `sub-${i}`, name: `Sub ${i}` });
      }
      const recents = readRecentSubs("user-1", "proj-1");
      expect(recents).toHaveLength(5);
    });

    it("does not show recents from a different project", async () => {
      writeRecentSub("user-1", "proj-other", { id: "sub-1", name: "Acme Tile" });
      mockFetchSubs();
      render(
        <SubcontractorPicker value={null} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getAllByText("Acme Tile").length).toBeGreaterThan(0));
      expect(screen.queryByText("Recent")).toBeNull();
    });

    it("filters stale localStorage recents that are not in the live subs list", async () => {
      writeRecentSub("user-1", "proj-1", { id: "sub-deleted", name: "Removed Sub" });
      writeRecentSub("user-1", "proj-1", { id: "sub-1", name: "Acme Tile" });
      mockFetchSubs();
      render(
        <SubcontractorPicker value={null} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getByText("Recent")).toBeDefined());
      expect(screen.queryByText("Removed Sub")).toBeNull();
      expect(screen.getAllByText("Acme Tile")).toHaveLength(1);
    });

    it("excludes recents from the main 'all' list to avoid duplication", async () => {
      writeRecentSub("user-1", "proj-1", { id: "sub-1", name: "Acme Tile" });
      mockFetchSubs();
      render(
        <SubcontractorPicker value={null} userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper }
      );
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getByText("Recent")).toBeDefined());
      // "Acme Tile" should appear only once (in the Recent section, not again in the all-list)
      const tiles = screen.getAllByText("Acme Tile");
      expect(tiles).toHaveLength(1);
    });
  });

  describe("offline snapshot fallback", () => {
    it("populates subs from snapshot when network fetch fails", async () => {
      vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
      vi.mocked(readSnapshotModule).mockResolvedValue({
        data: [{ id: "sub-offline", name: "Cached Sub" }],
        generatedAt: "2026-06-12T12:00:00.000Z",
      });

      render(<SubcontractorPicker value={null} />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /Subcontractor/i }));
      await waitFor(() => expect(screen.getAllByText("Cached Sub").length).toBeGreaterThan(0));
    });

    it("shows recent sub name on pill while list is still loading", () => {
      vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
      writeRecentSub("user-1", "proj-1", { id: "sub-1", name: "Acme Tile" });
      render(
        <SubcontractorPicker value="sub-1" userId="user-1" projectId="proj-1" />,
        { wrapper: Wrapper },
      );
      expect(screen.getByRole("button", { name: /Subcontractor.*Acme Tile/i })).toBeDefined();
    });
  });
});
