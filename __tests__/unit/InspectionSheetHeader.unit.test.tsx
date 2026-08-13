import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectionSheetHeader } from "@/components/projects/inspections/InspectionSheetHeader";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const map: Record<string, string | ((v: Record<string, unknown>) => string)> = {
      headerOutcomePassed: "Passed",
      headerOutcomeFailed: "Failed",
      headerMetaSub: "Sub",
      headerMetaInspector: "Inspector",
      overlayUnassigned: "Unassigned",
      retryAttemptLabel: (v) => `Attempt #${v.n}`,
      calibrationBadge: "Calibration",
    };
    const entry = map[key];
    if (typeof entry === "function") return entry(values ?? {});
    return entry ?? key;
  },
}));

describe("InspectionSheetHeader", () => {
  it("renders card hero, badges, and meta for a failed record", () => {
    render(
      <InspectionSheetHeader
        onClose={vi.fn()}
        closeLabel="Close"
        title="Clear Inspection Form"
        locationParts={{ building: "1", level: "3", unit: "303" }}
        categoryEyebrow="Clear Inspection"
        scopeTypeName="Cabinets"
        scopeCode="CABIU"
        attemptLabel="Attempt #4"
        outcome={{ passed: false }}
        installerName="Acme Cabinets Co."
        dateLabel="May 15, 2026"
        submittedBy="Jennifer Torres"
      />,
    );

    expect(screen.queryByText("Inspection Record")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unit 303" })).toBeInTheDocument();
    expect(screen.getByText("Bldg 1 · Level 3")).toBeInTheDocument();
    expect(screen.getByText("Clear Inspection · Cabinets")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("CABIU")).toBeInTheDocument();
    expect(screen.getByText("Attempt #4")).toBeInTheDocument();
    expect(screen.getByText("Acme Cabinets Co.")).toBeInTheDocument();
    expect(screen.getByText("Jennifer Torres")).toBeInTheDocument();
    expect(screen.getByText("Sub")).toBeInTheDocument();
    expect(screen.getByText("Inspector")).toBeInTheDocument();
    expect(document.querySelectorAll(".inspection-sheet-header__party").length).toBe(2);
    expect(
      document.querySelector(".inspection-sheet-header__body-aside"),
    ).toBeTruthy();
    expect(
      document.querySelector(".inspection-sheet-header__body-aside")
        ?.querySelector(".inspection-sheet-header__attempt-pill"),
    ).toBeTruthy();
    expect(
      document.querySelector(".inspection-sheet-header__body-aside")
        ?.querySelector(".inspection-sheet-header__aside-date"),
    ).toBeTruthy();
    expect(
      document.querySelectorAll(".inspection-sheet-header__meta-line").length,
    ).toBe(1);
    expect(
      document.querySelector(".inspection-sheet-header__body-trailing"),
    ).toBeNull();
  });

  it("uses the neutral pending hero tone when there is no pass/fail result yet", () => {
    const { container } = render(
      <InspectionSheetHeader
        onClose={vi.fn()}
        closeLabel="Close"
        title="Clear Inspection"
        locationParts={{ building: "1", level: "3", unit: "306" }}
        outcome={{ passed: null }}
      />,
    );

    expect(
      container.querySelector(".inspection-sheet-header__hero--pending"),
    ).toBeTruthy();
    expect(
      container.querySelector(".inspection-sheet-header__hero--fail"),
    ).toBeNull();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });

  it("shows a calibration badge on the card when calibration mode is active", () => {
    const { container } = render(
      <InspectionSheetHeader
        onClose={vi.fn()}
        closeLabel="Close"
        title="Clear Inspection"
        locationParts={{ building: "1", level: "3", unit: "306" }}
        showCalibrationBanner
      />,
    );

    expect(screen.getByText("Calibration")).toBeInTheDocument();
    expect(
      container.querySelector(".inspection-sheet-header__calibration-badge"),
    ).toBeTruthy();
    expect(
      container.querySelector(".inspection-sheet-header__calibration"),
    ).toBeNull();
  });

  it("shows project name in the hero location line when unit parts are absent", () => {
    render(
      <InspectionSheetHeader
        onClose={vi.fn()}
        closeLabel="Close"
        title="Daily Update"
        projectName="Riverside Tower"
        categoryEyebrow="Documentation"
      />,
    );

    expect(screen.getByText("Riverside Tower")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Daily Update" })).toBeInTheDocument();
  });

  it("shows project name in the hero subtitle when unit location parts are present", () => {
    render(
      <InspectionSheetHeader
        onClose={vi.fn()}
        closeLabel="Close"
        title="Clear Inspection Form"
        locationParts={{ building: "1", level: "7", unit: "703" }}
        projectName="Marina Bay Condos"
        categoryEyebrow="Clear Inspection"
        scopeTypeName="Cabinets"
      />,
    );

    expect(screen.getByText("Bldg 1 · Level 7")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unit 703" })).toBeInTheDocument();
    expect(
      screen.getByText("Clear Inspection · Cabinets · Marina Bay Condos"),
    ).toBeInTheDocument();
  });

  it("uses a custom submitted-by meta label when provided", () => {
    render(
      <InspectionSheetHeader
        onClose={vi.fn()}
        closeLabel="Close"
        title="Daily Update"
        submittedBy="Phil Salter"
        submittedByMetaLabel="Submitted by"
      />,
    );

    expect(screen.getByText("Submitted by")).toBeInTheDocument();
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();
    expect(screen.getByText("Phil Salter")).toBeInTheDocument();
  });

  it("calls onClose when the toolbar close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <InspectionSheetHeader
        onClose={onClose}
        closeLabel="Close"
        title="Inspection"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
