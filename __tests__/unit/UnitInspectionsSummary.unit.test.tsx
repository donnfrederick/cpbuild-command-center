/**
 * Unit tests for components/projects/inspections/UnitInspectionsSummary.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

vi.mock("@/lib/inspections/submissionsApi", () => ({
  listByScope: vi.fn(),
  listByUnit: vi.fn(),
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

import {
  UnitInspectionsSummary,
  buildFlatInspectionList,
  submissionsForScope,
} from "@/components/projects/inspections/UnitInspectionsSummary";
import { listByScope, listByUnit } from "@/lib/inspections/submissionsApi";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import type { ScopeRow } from "@/components/projects/UnitCards";

const SCOPE_ROW: ScopeRow = {
  id: "row-1",
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
  scopeStatus: "COMPLETE",
  inspectionStatus: "FAILED",
  subScopeInstances: [],
  clearInspection: null,
} as unknown as ScopeRow;

const FAILED_SUBMISSION: InspectionSubmission = {
  id: "sub-1",
  formId: "form-1",
  formNameSnapshot: "Clear Inspection — CAB",
  categorySnapshot: "CLEAR_INSPECTION",
  level: "scope",
  projectId: "proj-1",
  unitId: "unit-1",
  scopeRowId: "row-1",
  scopeTypeCode: "CAB",
  outcome: "FAIL",
  deficiencyCount: 1,
  submittedAt: new Date("2026-04-30T12:00:00Z").toISOString(),
  submittedBy: "Alice",
  payload: { q1: { choice: "fail" } },
  source: "FORM",
};

const PASSED_SUBMISSION: InspectionSubmission = {
  ...FAILED_SUBMISSION,
  id: "sub-2",
  outcome: "PASS",
  deficiencyCount: 0,
  payload: { q1: { choice: "pass" } },
};

const FV_PASSED: InspectionSubmission = {
  ...PASSED_SUBMISSION,
  id: "sub-fv",
  formNameSnapshot: "Field Verification — CAB",
  categorySnapshot: "FIELD_VERIFICATION",
  submittedAt: new Date("2026-05-01T12:00:00Z").toISOString(),
};

const FV_FAILED: InspectionSubmission = {
  ...FAILED_SUBMISSION,
  id: "sub-fv-fail",
  formNameSnapshot: "Field Verification — CAB",
  categorySnapshot: "FIELD_VERIFICATION",
  submittedAt: new Date("2026-05-03T12:00:00Z").toISOString(),
};

const TWO_AC_FAILED: InspectionSubmission = {
  ...FAILED_SUBMISSION,
  id: "sub-2ac",
  formNameSnapshot: "2 Area Clear — CAB",
  categorySnapshot: "TWO_AREA_CLEAR",
  submittedAt: new Date("2026-05-02T12:00:00Z").toISOString(),
};

const defaultProps = {
  scopes: [SCOPE_ROW],
  projectId: "proj-1",
  unitId: "unit-1",
  canManageStatus: true,
  onCountChange: vi.fn(),
};

function renderSummary(props: Partial<typeof defaultProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <UnitInspectionsSummary {...defaultProps} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("buildFlatInspectionList()", () => {
  it("merges scope and unit submissions in newest-first order", () => {
    const flat = buildFlatInspectionList(
      [{ scope: SCOPE_ROW, submissions: [FAILED_SUBMISSION, FV_PASSED] }],
      [],
    );
    expect(flat.map((i) => i.sub.id)).toEqual(["sub-fv", "sub-1"]);
  });

  it("includes unit-level submissions with null scope", () => {
    const unitGyp: InspectionSubmission = {
      ...FAILED_SUBMISSION,
      id: "sub-gyp",
      level: "unit",
      scopeRowId: undefined,
      categorySnapshot: "GYPCRETE_MOISTURE_TEST",
      formNameSnapshot: "Gypcrete Moisture Test",
      submittedAt: new Date("2026-05-04T12:00:00Z").toISOString(),
    };
    const flat = buildFlatInspectionList([], [unitGyp]);
    expect(flat).toHaveLength(1);
    expect(flat[0].scope).toBeNull();
    expect(flat[0].sub.categorySnapshot).toBe("GYPCRETE_MOISTURE_TEST");
  });

  it("shows distinct type chips for clear, FV, and 2AC rows", () => {
    const flat = buildFlatInspectionList(
      [
        {
          scope: SCOPE_ROW,
          submissions: [TWO_AC_FAILED, FV_PASSED, PASSED_SUBMISSION],
        },
      ],
      [],
    );
    expect(flat).toHaveLength(3);
    expect(flat[0].sub.categorySnapshot).toBe("TWO_AREA_CLEAR");
    expect(flat[1].sub.categorySnapshot).toBe("FIELD_VERIFICATION");
    expect(flat[2].sub.categorySnapshot).toBe("CLEAR_INSPECTION");
  });
});

describe("submissionsForScope()", () => {
  it("returns submissions for the matching scope row only", () => {
    const otherScope: ScopeRow = { ...SCOPE_ROW, id: "row-2" };
    const flat = buildFlatInspectionList(
      [
        { scope: SCOPE_ROW, submissions: [FAILED_SUBMISSION, PASSED_SUBMISSION] },
        { scope: otherScope, submissions: [FV_PASSED] },
      ],
      [],
    );

    const scopeSubs = submissionsForScope(flat, "row-1");
    expect(scopeSubs.map((s) => s.id)).toEqual(["sub-1", "sub-2"]);
  });

  it("returns empty array when scopeRowId is undefined", () => {
    const flat = buildFlatInspectionList([{ scope: SCOPE_ROW, submissions: [FAILED_SUBMISSION] }], []);
    expect(submissionsForScope(flat, undefined)).toEqual([]);
  });
});

describe("UnitInspectionsSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listByUnit).mockResolvedValue([]);
  });

  it("shows the empty-state message when there are no submissions", async () => {
    vi.mocked(listByScope).mockResolvedValue([]);

    renderSummary();

    await screen.findByText(/No inspections yet/i);
    expect(screen.getByText(/No inspections yet/i)).toBeInTheDocument();
  });

  it("renders type chip and View record for a single clear inspection", async () => {
    vi.mocked(listByScope).mockResolvedValue([FAILED_SUBMISSION]);

    renderSummary();

    await screen.findByText("Clear");
    expect(screen.getByText("Clear")).toHaveClass("inspection-history-row__type-chip--clear-fail");
    expect(screen.getByText("View record")).toBeInTheDocument();
  });

  it("lists multiple inspection types in one flat list", async () => {
    vi.mocked(listByScope).mockResolvedValue([TWO_AC_FAILED, FV_PASSED, PASSED_SUBMISSION]);

    renderSummary();

    await screen.findByText("2AC");
    expect(screen.getByText("FV")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("shows the Retry button for the latest failed clear inspection when canManageStatus=true", async () => {
    vi.mocked(listByScope).mockResolvedValue([FAILED_SUBMISSION]);

    renderSummary({ canManageStatus: true });

    await screen.findByRole("button", { name: /Retry inspection/i });
    expect(screen.getByRole("button", { name: /Retry inspection/i })).toBeInTheDocument();
  });

  it("shows the Retry button for the latest failed field verification", async () => {
    vi.mocked(listByScope).mockResolvedValue([FV_FAILED]);

    renderSummary({ canManageStatus: true });

    await screen.findByRole("button", { name: /Retry inspection/i });
    expect(screen.getByRole("button", { name: /Retry inspection/i })).toBeInTheDocument();
  });

  it("labels a passed unit-level Gypcrete submission by inspection type", async () => {
    const unitGyp: InspectionSubmission = {
      ...PASSED_SUBMISSION,
      id: "sub-gyp-pass",
      level: "unit",
      scopeRowId: undefined,
      categorySnapshot: "GYPCRETE_MOISTURE_TEST",
      formNameSnapshot: "Gypcrete Moisture Test",
    };
    vi.mocked(listByScope).mockResolvedValue([]);
    vi.mocked(listByUnit).mockResolvedValue([unitGyp]);

    renderSummary();

    await screen.findByText("Gypcrete Moisture Test");
    expect(screen.getByText("Gyp")).toBeInTheDocument();
  });

  it("shows Retry for a failed unit-level Gypcrete submission", async () => {
    const unitGyp: InspectionSubmission = {
      ...FAILED_SUBMISSION,
      id: "sub-gyp",
      level: "unit",
      scopeRowId: undefined,
      categorySnapshot: "GYPCRETE_MOISTURE_TEST",
      formNameSnapshot: "Gypcrete Moisture Test",
    };
    vi.mocked(listByScope).mockResolvedValue([]);
    vi.mocked(listByUnit).mockResolvedValue([unitGyp]);

    renderSummary({ canManageStatus: true });

    await screen.findByRole("button", { name: /Retry inspection/i });
    expect(screen.getByText("Gypcrete Moisture Test")).toBeInTheDocument();
  });

  it("hides the Retry button when canManageStatus=false", async () => {
    vi.mocked(listByScope).mockResolvedValue([FAILED_SUBMISSION]);

    renderSummary({ canManageStatus: false });

    await screen.findByText("View record");
    expect(screen.queryByRole("button", { name: /Retry inspection/i })).not.toBeInTheDocument();
  });

  it("does not show the Retry button for a passed inspection", async () => {
    vi.mocked(listByScope).mockResolvedValue([PASSED_SUBMISSION]);

    renderSummary();

    await screen.findByText("View record");
    expect(screen.queryByRole("button", { name: /Retry inspection/i })).not.toBeInTheDocument();
  });

  it("does not show the Retry button for BACKFILL submissions", async () => {
    const backfillSub: InspectionSubmission = {
      ...FAILED_SUBMISSION,
      id: "sub-backfill",
      source: "BACKFILL",
    };
    vi.mocked(listByScope).mockResolvedValue([backfillSub]);

    renderSummary();

    await screen.findByText("View record");
    expect(screen.queryByRole("button", { name: /Retry inspection/i })).not.toBeInTheDocument();
  });

  it("calls onCountChange with the total number of submissions after loading", async () => {
    const onCountChange = vi.fn();
    vi.mocked(listByScope).mockResolvedValue([FAILED_SUBMISSION, FV_PASSED]);

    renderSummary({ onCountChange });

    await screen.findByText("FV");
    expect(onCountChange).toHaveBeenCalledWith(2);
  });
});
