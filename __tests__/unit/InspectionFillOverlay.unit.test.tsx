/**
 * InspectionFillOverlay — leave-guard routing (Escape / backdrop → requestClose).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { InspectionFillOverlay } from "@/components/projects/inspections/InspectionFillOverlay";
import {
  INSPECTION_FILL_OVERLAY_Z_INDEX,
  INSPECTION_OVERLAY_DIALOG_Z_INDEX,
} from "@/components/projects/inspections/inspectionSheetPrimitive";
import type { StoredForm } from "@/lib/forms/formsApi";

const mockRequestClose = vi.fn();
const mockOnClose = vi.fn();

const overlayDraftMock = {
  draftReady: true,
  formDraftRef: { current: null },
  retryDraftRef: { current: null },
  requestClose: mockRequestClose,
  leaveGuard: {
    guardOpen: false,
    closeGuardKeepEditing: vi.fn(),
    closeGuardSaveAndClose: vi.fn().mockResolvedValue(undefined),
    closeGuardDiscard: vi.fn().mockResolvedValue(undefined),
  },
  resumeSheetOpen: false,
  resumePromptDraft: null as { updatedAt: string } | null,
  resumeAnsweredCount: 0,
  totalQuestions: 1,
  handleResumeChoice: vi.fn(),
  formInitialAnswers: {},
  formInitialAnswersRevision: undefined as string | undefined,
  formDirtyBaseline: {},
  retryInitialState: undefined,
  scheduleAutosave: vi.fn(),
  clearDraftOnSubmit: vi.fn().mockResolvedValue(undefined),
  prepareForSubmit: vi.fn().mockResolvedValue(undefined),
  pendingMediaNotice: false,
};

vi.mock("@/components/projects/inspections/useInspectionOverlayDraft", () => ({
  useInspectionOverlayDraft: () => overlayDraftMock,
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => {
    if (ns === "common") return key === "close" ? "Close" : key;
    if (ns === "inspections.draftResume") {
      if (key === "title") return "Resume saved inspection?";
      return key;
    }
    if (ns === "inspections.draftGuard") {
      if (key === "title") return "Save draft?";
      return key;
    }
    if (key === "shareOnlyFailedItems") return "shareOnlyFailedItems";
    if (key === "loadingRecord") return "Loading";
    return key;
  },
}));

vi.mock("@/components/forms/FormFillClient", () => ({
  FormFillClient: () => <div data-testid="form-fill-client" />,
}));

vi.mock("@/components/projects/inspections/InspectionRecordClient", () => ({
  InspectionRecordClient: () => <div data-testid="inspection-record-client" />,
}));

vi.mock("@/lib/inspections/submissionsApi", () => ({
  get: vi.fn().mockResolvedValue(null),
  insert: vi.fn(),
  update: vi.fn(),
  InspectionSyncRejectedError: class extends Error {},
}));

const FORM: StoredForm = {
  id: "form-1",
  template: {
    id: "form-1",
    name: "Clear",
    description: "",
    status: "published",
    level: "scope",
    scopeTypeCodes: ["CAB"],
    category: "CLEAR_INSPECTION",
    sections: [
      {
        id: "s1",
        title: "Section",
        questions: [
          {
            id: "q1",
            title: "Item",
            description: "",
            responseType: "PASS_FAIL",
            required: false,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            options: [],
          },
        ],
      },
    ],
  },
};

const SCOPE = {
  id: "scope-1",
  scopeType: { code: "CAB", name: "Cabinetry" },
  installer: null,
} as import("@/components/projects/UnitCards").ScopeRow;

describe("InspectionFillOverlay leave guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overlayDraftMock.draftReady = true;
    overlayDraftMock.resumeSheetOpen = false;
    overlayDraftMock.resumePromptDraft = null;
    overlayDraftMock.leaveGuard.guardOpen = false;
  });

  it("routes Escape to requestClose in live mode", () => {
    render(
      <InspectionFillOverlay
        mode="live"
        form={FORM}
        scope={SCOPE}
        projectId="p1"
        unitId="u1"
        onClose={mockOnClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockRequestClose).toHaveBeenCalledTimes(1);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("routes backdrop click to requestClose in live mode", () => {
    render(
      <InspectionFillOverlay
        mode="live"
        form={FORM}
        scope={SCOPE}
        projectId="p1"
        unitId="u1"
        onClose={mockOnClose}
      />,
    );

    const backdrop = document.querySelector(".ifo-fill-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(mockRequestClose).toHaveBeenCalledTimes(1);
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});

describe("InspectionFillOverlay draft resume stacking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overlayDraftMock.draftReady = false;
    overlayDraftMock.resumeSheetOpen = true;
    overlayDraftMock.resumePromptDraft = { updatedAt: "2026-06-18T12:00:00.000Z" };
    overlayDraftMock.leaveGuard.guardOpen = false;
  });

  it("hides fill modal and loading spinner while resume prompt is open", () => {
    render(
      <InspectionFillOverlay
        mode="live"
        form={FORM}
        scope={SCOPE}
        projectId="p1"
        unitId="u1"
        onClose={mockOnClose}
      />,
    );

    expect(document.querySelector(".ifo-fill-modal")).toBeNull();
    expect(screen.queryByLabelText("Loading")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Resume saved inspection?" })).toBeInTheDocument();
  });

  it("does not close on Escape while resume prompt is open", () => {
    render(
      <InspectionFillOverlay
        mode="live"
        form={FORM}
        scope={SCOPE}
        projectId="p1"
        unitId="u1"
        onClose={mockOnClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockRequestClose).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("stacks leave-guard dialog above the fill overlay", () => {
    overlayDraftMock.draftReady = true;
    overlayDraftMock.resumeSheetOpen = false;
    overlayDraftMock.leaveGuard.guardOpen = true;

    render(
      <InspectionFillOverlay
        mode="live"
        form={FORM}
        scope={SCOPE}
        projectId="p1"
        unitId="u1"
        onClose={mockOnClose}
      />,
    );

    const fillBackdrop = document.querySelector(".ifo-fill-backdrop");
    expect(fillBackdrop).toBeTruthy();

    const guardDialog = screen.getByRole("dialog", { name: "Save draft?" });
    const guardBackdrop = guardDialog.closest(".ibs-backdrop") as HTMLElement;
    expect(guardBackdrop).toBeTruthy();
    expect(Number(guardBackdrop.style.zIndex)).toBeGreaterThan(INSPECTION_FILL_OVERLAY_Z_INDEX);
  });
});

describe("inspection overlay z-index constants", () => {
  it("places dialog layer above fill overlay", () => {
    expect(INSPECTION_OVERLAY_DIALOG_Z_INDEX).toBeGreaterThan(INSPECTION_FILL_OVERLAY_Z_INDEX);
  });
});

const READONLY_SUBMISSION = {
  id: "sub-1",
  formId: "form-1",
  formNameSnapshot: "Daily Update",
  categorySnapshot: "OTHER" as const,
  level: "project" as const,
  projectId: "p1",
  unitId: "||",
  submittedAt: "2026-06-18T12:00:00.000Z",
  submittedBy: "Phil Salter",
  outcome: "COMPLETE" as const,
  deficiencyCount: 0,
  payload: {},
  source: "FORM" as const,
  templateSnapshot: FORM.template,
};

describe("InspectionFillOverlay readonly panelMode", () => {
  it("renders slide-in panel shell instead of centered fill modal", () => {
    const { getByText } = render(
      <InspectionFillOverlay
        mode="readonly"
        panelMode
        submission={READONLY_SUBMISSION}
        projectId="p1"
        unitId="||"
        projectName="Marina Bay Condos"
        locationParts={{ building: "1", level: "7", unit: "703" }}
        onClose={mockOnClose}
      />,
    );

    expect(document.querySelector(".ifo-sheet")).toBeTruthy();
    expect(document.querySelector(".ifo-fill-modal")).toBeNull();
    expect(getByText(/Marina Bay Condos/)).toBeInTheDocument();
  });

  it("shows share-only-failed toggle for pass/fail inspection records", () => {
    render(
      <InspectionFillOverlay
        mode="readonly"
        panelMode
        submission={READONLY_SUBMISSION}
        projectId="p1"
        unitId="u1"
        projectName="Marina Bay Condos"
        locationParts={{ building: "1", level: "7", unit: "703" }}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "shareOnlyFailedItems" })).toBeInTheDocument();
  });

  it("hides share-only-failed toggle for documentation project forms", () => {
    render(
      <InspectionFillOverlay
        mode="readonly"
        panelMode
        submission={{
          ...READONLY_SUBMISSION,
          outcome: "COMPLETE",
          templateSnapshot: {
            ...READONLY_SUBMISSION.templateSnapshot,
            formPurpose: "documentation",
            category: "OTHER",
          },
        }}
        projectId="p1"
        unitId="||"
        projectName="Marina Bay Condos"
        onClose={mockOnClose}
      />,
    );

    expect(screen.queryByRole("checkbox", { name: "shareOnlyFailedItems" })).toBeNull();
  });
});

const EDIT_SUBMISSION = {
  id: "sub-edit",
  formId: "form-1",
  formNameSnapshot: "Countertops",
  categorySnapshot: "CLEAR_INSPECTION" as const,
  level: "scope" as const,
  projectId: "p1",
  unitId: "u1",
  scopeRowId: "scope-1",
  submittedAt: "2026-07-13T12:00:00.000Z",
  submittedBy: "Phil",
  submittedById: "user-1",
  outcome: "FAIL" as const,
  deficiencyCount: 1,
  payload: { q1: { choice: "pass" } },
  source: "FORM" as const,
  templateSnapshot: FORM.template,
  _pendingSync: true,
};

describe("InspectionFillOverlay edit mode", () => {
  it("shows convert-to-calibration banner when reclassify handler is provided", () => {
    render(
      <InspectionFillOverlay
        mode="edit"
        submission={EDIT_SUBMISSION}
        projectId="p1"
        unitId="u1"
        onClose={mockOnClose}
        onReclassifyToCalibration={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "reclassifyToCalibrationEditBanner" }),
    ).toBeInTheDocument();
  });

  it("does not show convert banner in readonly toolbar", () => {
    render(
      <InspectionFillOverlay
        mode="readonly"
        submission={READONLY_SUBMISSION}
        projectId="p1"
        unitId="u1"
        onClose={mockOnClose}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "reclassifyToCalibrationEditBanner" }),
    ).toBeNull();
  });

  it("calls reclassify handler from edit banner click", () => {
    const onReclassify = vi.fn();
    render(
      <InspectionFillOverlay
        mode="edit"
        submission={EDIT_SUBMISSION}
        projectId="p1"
        unitId="u1"
        onClose={mockOnClose}
        onReclassifyToCalibration={onReclassify}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "reclassifyToCalibrationEditBanner" }),
    );
    expect(onReclassify).toHaveBeenCalledTimes(1);
  });
});
