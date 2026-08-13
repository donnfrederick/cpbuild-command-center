import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CustomSiteAreaDetailModal } from "@/components/projects/CustomSiteAreaDetailModal";
import { useDesktopDetailPanel } from "@/hooks/use-desktop-detail-panel";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";

vi.mock("@/hooks/use-is-browser", () => ({ useIsBrowser: () => true }));

vi.mock("@/hooks/use-desktop-detail-panel", () => ({
  useDesktopDetailPanel: vi.fn(() => false),
}));

vi.mock("@/components/projects/UnitCards", () => ({
  EMPTY_ISSUE_META: {},
  UnitExpandedContent: () => <div data-testid="unit-expanded-content" />,
}));

const BASE: CustomSiteLocation = {
  id: "loc-1",
  projectId: "proj-1",
  name: "Test location",
  building: "1",
  level: "2",
  placement: "building_level",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: { id: "user-1", name: "Hannah" },
  unitRef: "@custom|loc-1|Test location",
  observationCount: 0,
  issueCount: 0,
};

function renderModal(location: CustomSiteLocation) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ units: { unitDetailModalClose: "Close" } }}>
      <CustomSiteAreaDetailModal
        projectId="proj-1"
        location={location}
        onClose={() => {}}
        onRefresh={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("CustomSiteAreaDetailModal", () => {
  it("shows building and level chips for building_level placement", () => {
    renderModal(BASE);
    const meta = screen.getByTestId("custom-site-detail-location");
    expect(meta).toHaveAttribute("aria-label", "1, 2");
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows building chip only for building placement", () => {
    renderModal({ ...BASE, placement: "building", level: "" });
    const meta = screen.getByTestId("custom-site-detail-location");
    expect(meta).toHaveAttribute("aria-label", "1");
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("hides location chips for standalone placement", () => {
    renderModal({ ...BASE, placement: "standalone", building: "", level: "" });
    expect(screen.queryByTestId("custom-site-detail-location")).not.toBeInTheDocument();
  });

  it("hides location chips for standalone even when stale building field exists", () => {
    renderModal({ ...BASE, placement: "standalone", building: "1", level: "2" });
    expect(screen.queryByTestId("custom-site-detail-location")).not.toBeInTheDocument();
  });

  it("uses slide-in panel layout on desktop", () => {
    vi.mocked(useDesktopDetailPanel).mockReturnValueOnce(true);
    render(
      <NextIntlClientProvider locale="en" messages={{ units: { unitDetailModalClose: "Close" } }}>
        <CustomSiteAreaDetailModal
          projectId="proj-1"
          location={BASE}
          desktopPanel
          onClose={() => {}}
          onRefresh={() => {}}
        />
      </NextIntlClientProvider>,
    );
    const dialog = document.querySelector('[data-desktop-panel="true"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.style.right).toBe("0px");
    expect(dialog.style.animation).toContain("csdm-slide-in-right");
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(dialog.style.zIndex).toBe("181");
  });

  it("stacks below add observation/issue sheets (z-index 181, not above them)", () => {
    renderModal(BASE);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.style.zIndex).toBe("181");
  });
});
