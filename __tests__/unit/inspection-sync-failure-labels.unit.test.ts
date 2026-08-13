import { describe, expect, it } from "vitest";
import {
  INSPECTION_SYNC_FAILED_DEFAULT_MESSAGE,
  UNKNOWN_INSPECTION_FORM_NAME,
} from "@/lib/activity/inspection-sync-failure-labels";

describe("inspection-sync-failure-labels", () => {
  it("exports non-empty canonical fallbacks", () => {
    expect(UNKNOWN_INSPECTION_FORM_NAME.length).toBeGreaterThan(0);
    expect(INSPECTION_SYNC_FAILED_DEFAULT_MESSAGE.length).toBeGreaterThan(0);
  });
});
