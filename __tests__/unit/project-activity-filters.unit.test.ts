import { describe, expect, it } from "vitest";
import {
  filterProjectActivityRows,
  projectActivitySubtitle,
  sortActivityCountRows,
} from "@/lib/reports/project-activity-filters";
import type { ProjectActivityRow } from "@/lib/reports/project-activity-types";

const ROWS: ProjectActivityRow[] = [
  {
    id: "p1",
    name: "Alpha Tower",
    projectManagerName: "Jane PM",
    installManagerName: "Bob IM",
    count: 50,
  },
  {
    id: "p2",
    name: "Beta Site",
    projectManagerName: "Jane PM",
    installManagerName: "",
    count: 0,
  },
];

describe("filterProjectActivityRows()", () => {
  it("filters by project name search", () => {
    const result = filterProjectActivityRows(ROWS, {
      search: "beta",
      pmFilter: [],
      imFilter: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p2");
  });

  it("filters by project manager", () => {
    const result = filterProjectActivityRows(ROWS, {
      search: "",
      pmFilter: ["Jane PM"],
      imFilter: [],
    });
    expect(result).toHaveLength(2);
  });
});

describe("projectActivitySubtitle()", () => {
  it("joins PM and IM with a separator", () => {
    expect(projectActivitySubtitle(ROWS[0]!)).toBe("Jane PM · Bob IM");
  });

  it("returns PM only when IM is missing", () => {
    expect(projectActivitySubtitle(ROWS[1]!)).toBe("Jane PM");
  });
});

describe("sortActivityCountRows()", () => {
  it("sorts projects by activity count", () => {
    const sorted = sortActivityCountRows(ROWS, "most");
    expect(sorted.map((row) => row.id)).toEqual(["p1", "p2"]);
  });
});
