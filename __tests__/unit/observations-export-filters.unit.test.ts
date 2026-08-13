import { describe, expect, it } from "vitest";
import {
  buildObservationsBuildingWhere,
  buildObservationsDateWhere,
  buildObservationsExportWhere,
} from "@/lib/pdf/observations-export-filters";

describe("buildObservationsExportWhere", () => {
  it("AND-combines observationIds with obsTypes and authors", () => {
    const where = buildObservationsExportWhere({
      projectId: "proj-1",
      observationIds: ["obs-a", "obs-b"],
      obsTypes: ["SAFETY"],
      authors: ["user-1"],
    });

    expect(where).toEqual({
      AND: [
        { projectId: "proj-1" },
        { id: { in: ["obs-a", "obs-b"] } },
        { observationTypeCode: { in: ["SAFETY"] } },
        { authorId: { in: ["user-1"] } },
      ],
    });
  });

  it("applies building filter for a named building", () => {
    const where = buildObservationsBuildingWhere(["North"]);
    expect(where).toEqual({
      OR: [{ unitRef: { startsWith: "North|" } }, { unitRef: "North" }],
    });
  });

  it("applies 7d date preset", () => {
    const before = Date.now();
    const where = buildObservationsDateWhere("7d");
    const after = Date.now();
    expect(where?.createdAt).toBeDefined();
    const gte = (where!.createdAt as { gte: Date }).gte.getTime();
    expect(gte).toBeGreaterThanOrEqual(before - 7 * 86_400_000 - 1);
    expect(gte).toBeLessThanOrEqual(after - 7 * 86_400_000 + 1);
  });

  it("exports only project-scoped rows when building filter is project", () => {
    const where = buildObservationsExportWhere({
      projectId: "proj-1",
      buildings: ["project"],
    });

    expect(where).toEqual({
      AND: [
        { projectId: "proj-1" },
        {
          OR: [
            {
              OR: [{ unitRef: null }, { unitRef: "" }, { unitRef: "||" }],
            },
          ],
        },
      ],
    });
  });

  it("applies level filter for export where clause", () => {
    const where = buildObservationsExportWhere({
      projectId: "proj-1",
      levels: ["North::2"],
    });

    expect(where).toEqual({
      AND: [
        { projectId: "proj-1" },
        {
          OR: [
            { unitRef: "North|2" },
            { unitRef: "North|2|" },
            { unitRef: { startsWith: "North|2|" } },
          ],
        },
      ],
    });
  });
});
