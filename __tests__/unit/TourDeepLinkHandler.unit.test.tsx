/**
 * Unit tests for TourDeepLinkHandler.
 *
 * Key behaviours:
 * - Reads ?tour=<releaseId> from the URL
 * - Writes { releaseId } to sessionStorage("pendingTour")
 * - Strips the ?tour= param from the URL via router.replace
 * - Does nothing when the param is absent
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { TourDeepLinkHandler } from "@/components/tour/TourDeepLinkHandler";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: vi.fn(() => "/en/projects"),
}));

import { useSearchParams } from "next/navigation";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSearchParams(params: Record<string, string>) {
  const sp = new URLSearchParams(params);
  return {
    get: (key: string) => sp.get(key),
    toString: () => sp.toString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TourDeepLinkHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("writes pendingTour to sessionStorage when ?tour= is present", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      makeSearchParams({ tour: "release-abc123" }) as ReturnType<typeof useSearchParams>
    );

    render(<TourDeepLinkHandler />);

    const stored = sessionStorage.getItem("pendingTour");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual({ releaseId: "release-abc123" });
  });

  it("strips the ?tour= param from the URL", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      makeSearchParams({ tour: "release-abc123" }) as ReturnType<typeof useSearchParams>
    );

    render(<TourDeepLinkHandler />);

    expect(mockReplace).toHaveBeenCalledWith("/en/projects");
  });

  it("preserves other query params after stripping ?tour=", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      makeSearchParams({ tour: "release-abc123", tab: "units" }) as ReturnType<typeof useSearchParams>
    );

    render(<TourDeepLinkHandler />);

    const call = mockReplace.mock.calls[0][0] as string;
    expect(call).toContain("tab=units");
    expect(call).not.toContain("tour=");
  });

  it("does nothing when ?tour= is absent", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      makeSearchParams({}) as ReturnType<typeof useSearchParams>
    );

    render(<TourDeepLinkHandler />);

    expect(sessionStorage.getItem("pendingTour")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
