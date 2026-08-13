import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildActivityXlsx } from "@/lib/export/activity-xlsx";
import type { ActivityEventForPdf } from "@/lib/export/activity-export-format";

function makeEvent(
  overrides: Partial<ActivityEventForPdf> = {},
): ActivityEventForPdf {
  return {
    id: "evt-1",
    eventType: "SCOPE_STATUS_UPDATED",
    userName: "Alice",
    metadata: {
      scopeName: "Drywall",
      fromStage: "Rough",
      fromStatus: "Open",
      toStage: "Rough",
      toStatus: "Complete",
      building: "North",
      level: "2",
      unit: "N0201",
    },
    createdAt: new Date("2025-06-15T14:30:00.000Z"),
    ...overrides,
  };
}

describe("buildActivityXlsx()", () => {
  it("writes a parseable workbook with expected headers for a single project", () => {
    const buffer = buildActivityXlsx({ events: [makeEvent()] });
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets["Activity Log"];
    expect(sheet).toBeTruthy();

    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(rows[0]).toEqual([
      "Date",
      "Time",
      "Event Type",
      "Summary",
      "Location",
      "Building",
      "Level",
      "Unit",
      "Queued At (offline)",
      "Cache Duration",
      "User",
    ]);
    expect(rows[1]?.[2]).toBe("Status Updated");
    expect(rows[1]?.[3]).toContain("Updated from");
    expect(rows[1]?.[5]).toBe("North");
    expect(rows[1]?.[10]).toBe("Alice");
  });

  it("adds a Project column when projectLabelById is provided", () => {
    const buffer = buildActivityXlsx({
      events: [makeEvent({ projectId: "proj-1" })],
      projectLabelById: new Map([["proj-1", "Harbor Plaza"]]),
    });
    const wb = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Activity Log"], { header: 1 });
    expect(rows[0]).toContain("Project");
    expect(rows[1]?.[10]).toBe("Harbor Plaza");
    expect(rows[1]?.[11]).toBe("Alice");
  });

  it("formats date and time columns consistently in UTC", () => {
    const buffer = buildActivityXlsx({
      events: [makeEvent({ createdAt: new Date("2025-06-15T14:30:00.000Z") })],
    });
    const wb = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Activity Log"], { header: 1 });
    expect(rows[1]?.[0]).toBe("2025-06-15");
    expect(rows[1]?.[1]).toBe("14:30");
  });

  it("includes offline cache columns when replay metadata is present", () => {
    const buffer = buildActivityXlsx({
      events: [
        makeEvent({
          metadata: {
            scopeName: "Drywall",
            building: "North",
            level: "2",
            unit: "N0201",
            replayedFromOfflineQueue: true,
            clientQueuedAt: "2025-06-15T14:00:00.000Z",
            offlineCacheDurationMs: 30 * 60_000,
          },
        }),
      ],
    });
    const wb = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Activity Log"], { header: 1 });
    expect(rows[1]?.[8]).toContain("2025-06-15");
    expect(rows[1]?.[9]).toBe("30 min");
  });

  it("returns an empty sheet with headers when events array is empty", () => {
    const buffer = buildActivityXlsx({ events: [] });
    const wb = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Activity Log"], { header: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[0]).toBe("Date");
  });
});
