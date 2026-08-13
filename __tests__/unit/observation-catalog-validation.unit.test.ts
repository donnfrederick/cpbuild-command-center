import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    observationTypeCatalog: { findFirst: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  assertActiveObservationTypeCode,
  ObservationCatalogValidationError,
} from "@/lib/observations/observation-catalog";

describe("assertActiveObservationTypeCode()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active row when code exists", async () => {
    vi.mocked(db.observationTypeCatalog.findFirst).mockResolvedValue({
      code: "QUALITY",
    } as never);
    const row = await assertActiveObservationTypeCode("QUALITY");
    expect(row.code).toBe("QUALITY");
  });

  it("throws ObservationCatalogValidationError for unknown code", async () => {
    vi.mocked(db.observationTypeCatalog.findFirst).mockResolvedValue(null as never);
    await expect(assertActiveObservationTypeCode("UNKNOWN")).rejects.toBeInstanceOf(
      ObservationCatalogValidationError,
    );
  });
});
