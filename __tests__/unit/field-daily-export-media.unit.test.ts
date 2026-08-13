import { describe, it, expect } from "vitest";
import {
  statusImagesForPdfEntry,
  statusPhotoMatchesEntry,
  statusPhotosForUnitEntry,
  issueImagesFromSnapshotItem,
} from "@/lib/field-daily-report/pdf-export-media";
import type { FieldDailyReportStatusUnitEntry } from "@/lib/field-daily-report/types";

describe("field daily PDF export media helpers", () => {
  const entry: FieldDailyReportStatusUnitEntry = {
    locationLabel: "Bldg A · L2 · Unit 203",
    building: "A",
    level: "2",
    unit: "203",
    scopeName: "Cabinetry",
    activityLogIds: ["log-1"],
  };

  const assemblyContext = { statusLabel: "In Assembly" };
  const verifiedContext = { statusLabel: "Install Complete-Verified" };

  it("matches status photos by unit ref, scope label, and status label", () => {
    const rows = [
      {
        storageUrl: "https://example.com/a.jpg",
        storageKey: "k1",
        mimeType: "image/jpeg",
        caption: null,
        unitPhotoUnitRef: "A|2|203",
        unitPhotoSourceLabel: "Cabinetry · In Assembly",
      },
      {
        storageUrl: "https://example.com/b.jpg",
        storageKey: "k2",
        mimeType: "image/jpeg",
        caption: null,
        unitPhotoUnitRef: "A|2|203",
        unitPhotoSourceLabel: "Cabinetry · Install Complete-Verified",
      },
      {
        storageUrl: "https://example.com/c.jpg",
        storageKey: "k3",
        mimeType: "image/jpeg",
        caption: null,
        unitPhotoUnitRef: "A|2|204",
        unitPhotoSourceLabel: "Cabinetry · In Assembly",
      },
    ];

    expect(statusPhotoMatchesEntry(rows[0], entry, assemblyContext)).toBe(true);
    expect(statusPhotoMatchesEntry(rows[1], entry, assemblyContext)).toBe(false);
    expect(statusPhotoMatchesEntry(rows[1], entry, verifiedContext)).toBe(true);
    expect(statusPhotoMatchesEntry(rows[2], entry, assemblyContext)).toBe(false);
    expect(statusPhotosForUnitEntry(rows, entry, assemblyContext)).toHaveLength(1);
    expect(statusPhotosForUnitEntry(rows, entry, assemblyContext)[0].storageKey).toBe("k1");
    expect(statusPhotosForUnitEntry(rows, entry, verifiedContext)).toHaveLength(1);
    expect(statusPhotosForUnitEntry(rows, entry, verifiedContext)[0].storageKey).toBe("k2");
  });

  it("does not match photos without a status context (teams on site rollup)", () => {
    const rows = [
      {
        storageUrl: "https://example.com/a.jpg",
        storageKey: "k1",
        mimeType: "image/jpeg",
        caption: null,
        unitPhotoUnitRef: "A|2|203",
        unitPhotoSourceLabel: "Cabinetry · In Assembly",
      },
    ];
    expect(statusPhotosForUnitEntry(rows, entry)).toHaveLength(0);
  });

  it("does not match photos missing source label or status segment", () => {
    const rows = [
      {
        storageUrl: "https://example.com/general.jpg",
        storageKey: "g1",
        mimeType: "image/jpeg",
        caption: "Site photo",
        unitPhotoUnitRef: "A|2|203",
        unitPhotoSourceLabel: null,
      },
    ];
    expect(statusPhotosForUnitEntry(rows, entry, assemblyContext)).toHaveLength(0);
  });

  it("matches status photos when unit coords are parsed from locationLabel only", () => {
    const labelOnlyEntry: FieldDailyReportStatusUnitEntry = {
      locationLabel: "Bldg 1 · L1 · Unit 118",
      scopeName: "Cabinetry",
      activityLogIds: ["log-1"],
    };
    const rows = [
      {
        storageUrl: "https://example.com/status.jpg",
        storageKey: "status-118",
        mimeType: "image/jpeg",
        caption: null,
        unitPhotoUnitRef: "1|1|118",
        unitPhotoSourceLabel: "Cabinetry · In Assembly",
      },
    ];
    expect(statusPhotoMatchesEntry(rows[0], labelOnlyEntry, assemblyContext)).toBe(true);
    expect(statusPhotosForUnitEntry(rows, labelOnlyEntry, assemblyContext)).toHaveLength(1);
  });

  it("prefers hydrated statusUpdateAttachments over row matching", () => {
    const hydratedEntry: FieldDailyReportStatusUnitEntry = {
      ...entry,
      statusUpdateAttachments: [
        {
          id: "att-1",
          storageUrl: "https://example.com/hydrated.jpg",
          storageKey: "hydrated",
          mimeType: "image/jpeg",
          caption: "From snapshot",
        },
      ],
    };
    const images = statusImagesForPdfEntry([], hydratedEntry, assemblyContext);
    expect(images).toHaveLength(1);
    expect(images[0].storageKey).toBe("hydrated");
  });

  it("extracts image attachments from hydrated issue records", () => {
    const images = issueImagesFromSnapshotItem({
      issueRecord: {
        attachments: [
          {
            storageUrl: "https://example.com/issue.jpg",
            storageKey: "issue-1",
            mimeType: "image/jpeg",
            caption: "Damage",
          },
          {
            storageUrl: "https://example.com/note.mp4",
            storageKey: "vid-1",
            mimeType: "video/mp4",
            caption: null,
          },
        ],
      },
    });
    expect(images).toHaveLength(1);
    expect(images[0].caption).toBe("Damage");
  });
});
