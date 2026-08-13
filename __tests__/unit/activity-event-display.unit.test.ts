import { describe, expect, it } from "vitest";
import {
  isLegacySubcontractorUpmEvent,
  isSubcontractorActivityEvent,
  subcontractorActivityBadgeForEvent,
  upmChangedFieldsWithoutSubcontractor,
} from "@/lib/activity-event-display";

describe("activity-event-display", () => {
  it("detects legacy subcontractor-only UPM rows", () => {
    expect(
      isLegacySubcontractorUpmEvent("UPM_ROW_UPDATED", {
        changedFields: ["unifierSubId"],
      }),
    ).toBe(true);
  });

  it("detects legacy subcontractor UPM when unifierSubId is among other changed fields", () => {
    expect(
      isLegacySubcontractorUpmEvent("UPM_ROW_UPDATED", {
        changedFields: ["unifierSubId", "qty"],
      }),
    ).toBe(true);
  });

  it("maps legacy subcontractor rows to subcontractor display", () => {
    expect(
      isSubcontractorActivityEvent("UPM_ROW_UPDATED", {
        changedFields: ["unifierSubId"],
      }),
    ).toBe(true);
    expect(
      subcontractorActivityBadgeForEvent("UPM_ROW_UPDATED", {
        changedFields: ["unifierSubId"],
      }),
    ).toBe("updated");
  });

  it("strips unifierSubId from Location Builder changed-field suffixes", () => {
    expect(
      upmChangedFieldsWithoutSubcontractor({ changedFields: ["unifierSubId", "qty"] }),
    ).toEqual(["qty"]);
  });
});
