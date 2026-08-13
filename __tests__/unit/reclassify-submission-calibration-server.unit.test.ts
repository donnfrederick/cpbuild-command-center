import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ReclassifyCalibrationError,
  reclassifyClearSubmissionToCalibration,
} from "@/lib/inspections/reclassify-submission-calibration";

vi.mock("@/lib/inspections/calibration-target", () => ({
  resolveCalibratedAgainstClearInspectionId: vi.fn().mockResolvedValue("clear-target-id"),
}));

vi.mock("@/lib/inspections/inspection-type", () => ({
  getInspectionTypeIdByCode: vi.fn().mockResolvedValue("insp_type_calibration"),
}));

vi.mock("@/lib/inspections/reporting-normalization", () => ({
  buildInspectionCategoryStub: vi.fn(() => ({ category: "CALIBRATION_INSPECTION" })),
}));

const baseSubmission = {
  id: "wrong-clear",
  scopeRowId: "scope-1",
  outcome: "FAIL",
  source: "FORM",
  templateSnapshot: { category: "CLEAR_INSPECTION" },
  form: { category: "CLEAR_INSPECTION", name: "Countertops" },
  clearInspection: {
    id: "ci-wrong",
    rowId: "scope-1",
    deletedAt: null,
    inspectionType: { code: "CLEAR_INSPECTION" },
  },
};

function makeClient(overrides: {
  submission?: typeof baseSubmission | null;
  existingCalibration?: { id: string } | null;
} = {}) {
  return {
    inspectionSubmission: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.submission === undefined ? baseSubmission : overrides.submission,
      ),
      update: vi.fn().mockResolvedValue({ id: "wrong-clear" }),
    },
    clearInspection: {
      findFirst: vi.fn().mockResolvedValue(overrides.existingCalibration ?? null),
      update: vi.fn().mockResolvedValue({ id: "ci-wrong" }),
      create: vi.fn().mockResolvedValue({ id: "ci-new" }),
    },
    inspectionType: {},
  };
}

describe("reclassifyClearSubmissionToCalibration()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates submission stub and clearInspection type for an existing clear row", async () => {
    const client = makeClient();

    const result = await reclassifyClearSubmissionToCalibration(client as never, {
      submissionId: "wrong-clear",
      calibratedAgainstSubmissionId: "clear-other",
      inspectedById: "user-1",
    });

    expect(result).toEqual({
      submissionId: "wrong-clear",
      calibratedAgainstSubmissionId: "clear-other",
    });
    expect(client.inspectionSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wrong-clear" },
        data: { templateSnapshot: { category: "CALIBRATION_INSPECTION" } },
      }),
    );
    expect(client.clearInspection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ci-wrong" },
        data: expect.objectContaining({
          inspectionTypeId: "insp_type_calibration",
          calibratedAgainstClearInspectionId: "clear-target-id",
          inspectedById: "user-1",
        }),
      }),
    );
  });

  it("throws 404 when submission is missing", async () => {
    const client = makeClient({ submission: null });

    await expect(
      reclassifyClearSubmissionToCalibration(client as never, {
        submissionId: "missing",
        calibratedAgainstSubmissionId: "clear-other",
        inspectedById: "user-1",
      }),
    ).rejects.toMatchObject({ status: 404, message: "Submission not found" });
  });

  it("throws 409 when scope already has a calibration", async () => {
    const client = makeClient({ existingCalibration: { id: "cal-existing" } });

    await expect(
      reclassifyClearSubmissionToCalibration(client as never, {
        submissionId: "wrong-clear",
        calibratedAgainstSubmissionId: "clear-other",
        inspectedById: "user-1",
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "This scope already has a calibration inspection",
    });
  });

  it("throws 422 when submission is already calibration", async () => {
    const client = makeClient({
      submission: {
        ...baseSubmission,
        templateSnapshot: { category: "CALIBRATION_INSPECTION" },
      },
    });

    await expect(
      reclassifyClearSubmissionToCalibration(client as never, {
        submissionId: "wrong-clear",
        calibratedAgainstSubmissionId: "clear-other",
        inspectedById: "user-1",
      }),
    ).rejects.toBeInstanceOf(ReclassifyCalibrationError);
  });

  it("creates clearInspection when submission has no history row yet", async () => {
    const client = makeClient({
      submission: {
        ...baseSubmission,
        clearInspection: null,
      },
    });

    await reclassifyClearSubmissionToCalibration(client as never, {
      submissionId: "wrong-clear",
      calibratedAgainstSubmissionId: "clear-other",
      inspectedById: "user-1",
    });

    expect(client.clearInspection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rowId: "scope-1",
          status: "FAILED",
          inspectionSubmissionId: "wrong-clear",
        }),
      }),
    );
  });
});
