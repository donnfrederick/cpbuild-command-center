import { describe, expect, it } from "vitest";
import {
  buildProjectLocationsHref,
  projectIdByUnifierPidFromList,
} from "@/lib/reports/portfolio-progress-project-links";

describe("buildProjectLocationsHref()", () => {
  it("builds a locale-prefixed units page href", () => {
    expect(buildProjectLocationsHref("en", "proj-abc-123")).toBe(
      "/en/projects/proj-abc-123/units",
    );
  });

  it("encodes unsafe project ids", () => {
    expect(buildProjectLocationsHref("es", "proj/with space")).toBe(
      "/es/projects/proj%2Fwith%20space/units",
    );
  });
});

describe("projectIdByUnifierPidFromList()", () => {
  it("maps unifierPid to project id and skips rows without pid", () => {
    const map = projectIdByUnifierPidFromList([
      { id: "db-1", unifierPid: "UNI-10145" },
      { id: "db-2", unifierPid: null },
      { id: "db-3" },
    ]);
    expect(map.get("UNI-10145")).toBe("db-1");
    expect(map.size).toBe(1);
  });
});
