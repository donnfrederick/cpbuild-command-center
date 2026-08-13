import { describe, expect, it, vi, afterEach } from "vitest";
import { parseGlobalProgressQuery } from "@/lib/reports/portfolio-progress-query";

describe("parseGlobalProgressQuery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults preset to 1w when omitted", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));
    const result = parseGlobalProgressQuery({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preset).toBe("1w");
      expect(result.value.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.value.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("rejects custom preset without from and to", () => {
    const result = parseGlobalProgressQuery({ preset: "custom" });
    expect(result.ok).toBe(false);
  });

  it("rejects custom preset when to is before from", () => {
    const result = parseGlobalProgressQuery({
      preset: "custom",
      from: "2025-06-10",
      to: "2025-06-01",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts valid custom range", () => {
    const result = parseGlobalProgressQuery({
      preset: "custom",
      from: "2025-05-01",
      to: "2025-06-01",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.from).toBe("2025-05-01");
      expect(result.value.to).toBe("2025-06-01");
      expect(result.value.fromDate.getUTCHours()).toBe(0);
      expect(result.value.toDate.getUTCHours()).toBe(23);
    }
  });

  it("rejects invalid date format", () => {
    const result = parseGlobalProgressQuery({
      preset: "custom",
      from: "05/01/2025",
      to: "2025-06-01",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects custom dates that pass regex but are not valid calendar dates", () => {
    const result = parseGlobalProgressQuery({
      preset: "custom",
      from: "2026-99-99",
      to: "2026-06-01",
    });
    expect(result.ok).toBe(false);
  });
});
