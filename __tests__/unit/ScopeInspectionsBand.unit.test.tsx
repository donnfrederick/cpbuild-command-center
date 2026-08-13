/**
 * ScopeInspectionsBand must not auto-write scopeRow.inspectionStatus from
 * legacy pre-install submissions when the unit detail panel opens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

vi.mock("@/lib/inspections/submissionsApi", () => ({
  listByScope: vi.fn(),
  backfill: vi.fn(),
  resetInspectionCategory: vi.fn(),
}));

vi.mock("@/components/projects/inspections/InspectionFillOverlay", () => ({
  InspectionFillOverlay: () => null,
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

import { ScopeInspectionsBand } from "@/components/projects/inspections/ScopeInspectionsBand";
import { ScopeInspectionProvider } from "@/components/projects/inspections/ScopeInspectionProvider";
import { listByScope } from "@/lib/inspections/submissionsApi";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import type { ScopeRow } from "@/components/projects/UnitCards";

const scope: ScopeRow = {
  id: "row-cab",
  scopeType: { id: "st-1", code: "CAB", name: "Cabinets" },
  description: "",
  qty: null,
  uom: null,
  percentComplete: null,
  installer: null,
  unifierSubId: null,
  shipPhase: "",
  buildPhase: "",
  scopeStage: "INSTALL",
  scopeStatus: "IN_PROGRESS",
  inspectionStatus: null,
  subScopeInstances: [],
  clearInspection: null,
} as unknown as ScopeRow;

const preInstallPass: InspectionSubmission = {
  id: "sub-pre",
  formId: "form-pre",
  formNameSnapshot: "Pre-install CAB",
  categorySnapshot: "PRE_INSTALL" as InspectionSubmission["categorySnapshot"],
  level: "scope",
  projectId: "proj-1",
  unitId: "unit-1",
  scopeRowId: "row-cab",
  submittedAt: "2026-05-27T12:00:00Z",
  submittedBy: "Alice",
  outcome: "PASS",
  deficiencyCount: 0,
  payload: {},
  source: "FORM",
};

const clearPass: InspectionSubmission = {
  ...preInstallPass,
  id: "sub-clear",
  formNameSnapshot: "Clear Inspection — CAB",
  categorySnapshot: "CLEAR_INSPECTION",
};

const calibrationPass: InspectionSubmission = {
  ...clearPass,
  id: "sub-cal-pass",
  formNameSnapshot: "Clear Inspection — CAB (Calibration)",
  categorySnapshot: "CALIBRATION_INSPECTION",
};

const calibrationFail: InspectionSubmission = {
  ...calibrationPass,
  id: "sub-cal-fail",
  outcome: "FAIL",
  deficiencyCount: 1,
};

function renderBand(
  patchScopeRow: ReturnType<typeof vi.fn>,
  scopeRow: ScopeRow = scope,
  applyLocalScopeUpdates?: ReturnType<typeof vi.fn>,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ScopeInspectionProvider
        scope={scopeRow}
        projectId="proj-1"
        unitId="unit-1"
        canManageStatus
        applyLocalScopeUpdates={applyLocalScopeUpdates}
        patchScopeRow={patchScopeRow}
      >
        <ScopeInspectionsBand />
      </ScopeInspectionProvider>
    </NextIntlClientProvider>,
  );
}

describe("ScopeInspectionsBand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not patch inspectionStatus for install-complete scopes when only pre-install exists", async () => {
    vi.mocked(listByScope).mockResolvedValue([preInstallPass]);
    const patchScopeRow = vi.fn().mockResolvedValue(true);
    const installCompleteScope = {
      ...scope,
      scopeStage: "INSTALL" as const,
      scopeStatus: "COMPLETE" as const,
    };

    renderBand(patchScopeRow, installCompleteScope);

    await waitFor(() => {
      expect(listByScope).toHaveBeenCalledWith("row-cab");
    });

    expect(patchScopeRow).not.toHaveBeenCalled();
  });

  it("reconciles inspectionStatus from the latest clear inspection submission", async () => {
    vi.mocked(listByScope).mockResolvedValue([preInstallPass, clearPass]);
    const patchScopeRow = vi.fn().mockResolvedValue(true);
    const installCompleteScope = {
      ...scope,
      scopeStage: "INSTALL" as const,
      scopeStatus: "COMPLETE" as const,
    };

    renderBand(patchScopeRow, installCompleteScope);

    await waitFor(() => {
      expect(patchScopeRow).toHaveBeenCalledWith({ inspectionStatus: "PASSED" });
    });
  });

  it("updates grid fields locally for 2AC pass without PATCH when not install-complete", async () => {
    const twoAreaPass = {
      ...clearPass,
      id: "sub-2ac",
      categorySnapshot: "TWO_AREA_CLEAR" as InspectionSubmission["categorySnapshot"],
    };
    vi.mocked(listByScope).mockResolvedValue([twoAreaPass]);
    const patchScopeRow = vi.fn().mockResolvedValue(true);
    const applyLocal = vi.fn();

    renderBand(patchScopeRow, scope, applyLocal);

    await waitFor(() => {
      expect(applyLocal).toHaveBeenCalledWith({
        gridInspectionStatus: "PASSED",
        latestInspectionCategory: "TWO_AREA_CLEAR",
      });
    });

    expect(patchScopeRow).not.toHaveBeenCalled();
  });

  it("shows a calibrated pass badge when a calibration submission exists", async () => {
    vi.mocked(listByScope).mockResolvedValue([calibrationPass, clearPass]);
    renderBand(vi.fn().mockResolvedValue(true));

    await screen.findByRole("button", { name: /View calibration inspection record/i });
    expect(screen.getByText(/Calibration · Pass/i)).toBeInTheDocument();
  });

  it("shows a calibrated fail badge when the latest calibration failed", async () => {
    vi.mocked(listByScope).mockResolvedValue([calibrationFail, clearPass]);
    renderBand(vi.fn().mockResolvedValue(true));

    await screen.findByRole("button", { name: /View calibration inspection record/i });
    expect(screen.getByText(/Calibration · Fail/i)).toBeInTheDocument();
  });
});
