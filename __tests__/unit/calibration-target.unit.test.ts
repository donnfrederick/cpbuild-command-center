import { describe, it, expect, vi } from "vitest";
import {
  CalibrationTargetError,
  findLatestClearInspectionIdForScope,
  resolveCalibratedAgainstClearInspectionId,
} from "@/lib/inspections/calibration-target";

describe("resolveCalibratedAgainstClearInspectionId()", () => {
  it("returns null for non-calibration submissions", async () => {
    const client = { clearInspection: { findFirst: vi.fn() } };
    await expect(
      resolveCalibratedAgainstClearInspectionId(client, {
        isCalibration: false,
        scopeRowId: "row-1",
        calibratedAgainstSubmissionId: "sub-1",
      }),
    ).resolves.toBeNull();
    expect(client.clearInspection.findFirst).not.toHaveBeenCalled();
  });

  it("throws 400 when calibration omits calibratedAgainstSubmissionId", async () => {
    const client = { clearInspection: { findFirst: vi.fn() } };
    await expect(
      resolveCalibratedAgainstClearInspectionId(client, {
        isCalibration: true,
        scopeRowId: "row-1",
        calibratedAgainstSubmissionId: undefined,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 422 when referenced clear row is missing", async () => {
    const client = {
      clearInspection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    await expect(
      resolveCalibratedAgainstClearInspectionId(client, {
        isCalibration: true,
        scopeRowId: "row-1",
        calibratedAgainstSubmissionId: "sub-clear",
      }),
    ).rejects.toBeInstanceOf(CalibrationTargetError);
  });

  it("returns clear_inspection id for a valid reference", async () => {
    const client = {
      clearInspection: {
        findFirst: vi.fn().mockResolvedValue({ id: "clear-original" }),
      },
    };
    await expect(
      resolveCalibratedAgainstClearInspectionId(client, {
        isCalibration: true,
        scopeRowId: "row-1",
        calibratedAgainstSubmissionId: "sub-clear",
      }),
    ).resolves.toBe("clear-original");
    expect(client.clearInspection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inspectionSubmissionId: "sub-clear",
          rowId: "row-1",
        }),
      }),
    );
  });
});

describe("findLatestClearInspectionIdForScope()", () => {
  it("returns the latest clear inspection id on a scope", async () => {
    const client = {
      clearInspection: {
        findFirst: vi.fn().mockResolvedValue({ id: "clear-latest" }),
      },
    };
    await expect(findLatestClearInspectionIdForScope(client, "row-1")).resolves.toBe("clear-latest");
  });

  it("returns null when no clear inspection exists", async () => {
    const client = {
      clearInspection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    await expect(findLatestClearInspectionIdForScope(client, "row-1")).resolves.toBeNull();
  });
});
