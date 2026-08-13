import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertScopeReadyForClearInspection } from "@/lib/inspections/assert-scope-ready-for-clear-inspection";

vi.mock("@/lib/db", () => ({
  db: {
    projectRow: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";

describe("assertScopeReadyForClearInspection()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts parent INSTALL+COMPLETE with subcontractor", async () => {
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      unifierSubId: "sub-1",
    } as never);

    await expect(assertScopeReadyForClearInspection("row-1")).resolves.toEqual({ ok: true });
  });

  it("accepts parent INSTALL+COMPLETE regardless of sub-scope instance state", async () => {
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      unifierSubId: "sub-1",
    } as never);

    await expect(assertScopeReadyForClearInspection("row-1")).resolves.toEqual({ ok: true });
  });

  it("rejects when parent is not Install Complete-Verified", async () => {
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({
      scopeStage: "INSTALL",
      scopeStatus: "IN_PROGRESS",
      unifierSubId: "sub-1",
    } as never);

    const result = await assertScopeReadyForClearInspection("row-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Install · Complete/i);
    }
  });

  it("rejects when subcontractor is missing", async () => {
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      unifierSubId: null,
    } as never);

    const result = await assertScopeReadyForClearInspection("row-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/subcontractor/i);
    }
  });
});
