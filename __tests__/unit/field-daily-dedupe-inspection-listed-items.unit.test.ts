import { describe, it, expect } from "vitest";
import type { FieldDailyReportListedItem } from "@/lib/field-daily-report/types";
import { dedupeInspectionListedItems } from "@/lib/field-daily-report/dedupe-inspection-listed-items";

function item(partial: Partial<FieldDailyReportListedItem> & Pick<FieldDailyReportListedItem, "itemKey">): FieldDailyReportListedItem {
  return {
    activityLogId: partial.itemKey,
    createdAt: "2026-07-17T18:00:00.000Z",
    headline: "Clear Inspection",
    locationLabel: "BLDG 1 · L1 · UNIT 119 · COUNTERTOPS",
    badge: "FAIL",
    ...partial,
  };
}

describe("dedupeInspectionListedItems()", () => {
  it("drops grid-only duplicate when a form submission exists for the same location", () => {
    const items = dedupeInspectionListedItems([
      item({
        itemKey: "submit-1",
        submissionId: "sub-1",
        headline: "Clear Inspection",
      }),
      item({
        itemKey: "grid-1",
        headline: "Clear Inspection",
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].itemKey).toBe("submit-1");
  });
});
