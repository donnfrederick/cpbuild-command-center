import { describe, expect, it } from "vitest";
import {
  fieldDailyReportLockInput,
} from "@/lib/field-daily-report/report-lock";

describe("fieldDailyReportLockInput", () => {
  it("combines install manager id and report date without NUL bytes", () => {
    const key = fieldDailyReportLockInput("im-1", "2026-07-14");
    expect(key).toBe("field-daily:im-1:2026-07-14");
    expect(key.includes("\0")).toBe(false);
  });

  it("produces distinct keys for different dates on the same IM", () => {
    const a = fieldDailyReportLockInput("im-1", "2026-07-14");
    const b = fieldDailyReportLockInput("im-1", "2026-07-15");
    expect(a).not.toBe(b);
  });
});
