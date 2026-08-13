import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    issueTypeCatalog: { findFirst: vi.fn() },
    responsiblePartyCatalog: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  assertActiveIssueTypeCode,
  assertActivePartyCodes,
  IssueCatalogValidationError,
} from "@/lib/issues/issue-catalog";

describe("assertActiveIssueTypeCode()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active row when code exists", async () => {
    vi.mocked(db.issueTypeCatalog.findFirst).mockResolvedValue({
      code: "OTHER",
      requiresVisual: false,
    } as never);
    const row = await assertActiveIssueTypeCode("OTHER");
    expect(row.code).toBe("OTHER");
    expect(row.requiresVisual).toBe(false);
  });

  it("throws IssueCatalogValidationError for unknown code", async () => {
    vi.mocked(db.issueTypeCatalog.findFirst).mockResolvedValue(null as never);
    await expect(assertActiveIssueTypeCode("UNKNOWN")).rejects.toBeInstanceOf(
      IssueCatalogValidationError,
    );
  });
});

describe("assertActivePartyCodes()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns deduped active party codes", async () => {
    vi.mocked(db.responsiblePartyCatalog.findMany).mockResolvedValue([
      { code: "CP_BUILD" },
      { code: "PLUMBER" },
    ] as never);
    const codes = await assertActivePartyCodes(["CP_BUILD", "PLUMBER", "CP_BUILD"]);
    expect(codes).toEqual(["CP_BUILD", "PLUMBER"]);
  });

  it("throws when a party code is inactive or missing", async () => {
    vi.mocked(db.responsiblePartyCatalog.findMany).mockResolvedValue([{ code: "CP_BUILD" }] as never);
    await expect(assertActivePartyCodes(["CP_BUILD", "RETIRED"])).rejects.toBeInstanceOf(
      IssueCatalogValidationError,
    );
  });
});
