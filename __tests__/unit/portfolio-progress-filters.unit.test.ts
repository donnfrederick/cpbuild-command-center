import { describe, expect, it } from "vitest";
import {
  PORTFOLIO_IM_UNASSIGNED,
  projectMatchesPeopleFilters,
  toggleFilterValue,
  uniqueInstallManagers,
  uniqueProjectManagers,
} from "@/lib/reports/portfolio-progress-filters";
import type { PortfolioProjectListItem } from "@/lib/reports/portfolio-progress-types";

const SAMPLE: PortfolioProjectListItem[] = [
  {
    id: "a",
    name: "Alpha",
    unifierPid: null,
    projectManagerName: "Jon Hiller",
    installManagerName: "Mike Hansen",
    hasChangesInPeriod: true,
    scopeSummaries: [],
  },
  {
    id: "b",
    name: "Beta",
    unifierPid: null,
    projectManagerName: "Ed Perkins",
    installManagerName: null,
    hasChangesInPeriod: false,
    scopeSummaries: [],
  },
  {
    id: "c",
    name: "Gamma",
    unifierPid: null,
    projectManagerName: "Jon Hiller",
    installManagerName: "Wes Hamilton",
    hasChangesInPeriod: true,
    scopeSummaries: [],
  },
];

describe("portfolio-progress-filters", () => {
  it("collects unique PM and IM names with unassigned last", () => {
    expect(uniqueProjectManagers(SAMPLE)).toEqual(["Ed Perkins", "Jon Hiller"]);
    expect(uniqueInstallManagers(SAMPLE)).toEqual([
      "Mike Hansen",
      "Wes Hamilton",
      PORTFOLIO_IM_UNASSIGNED,
    ]);
  });

  it("matches PM filter", () => {
    expect(projectMatchesPeopleFilters(SAMPLE[0]!, ["Jon Hiller"], [])).toBe(true);
    expect(projectMatchesPeopleFilters(SAMPLE[1]!, ["Jon Hiller"], [])).toBe(false);
  });

  it("matches IM filter including unassigned", () => {
    expect(projectMatchesPeopleFilters(SAMPLE[1]!, [], [PORTFOLIO_IM_UNASSIGNED])).toBe(true);
    expect(projectMatchesPeopleFilters(SAMPLE[0]!, [], [PORTFOLIO_IM_UNASSIGNED])).toBe(false);
  });

  it("toggleFilterValue adds and removes values", () => {
    expect(toggleFilterValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFilterValue(["a", "b"], "a")).toEqual(["b"]);
  });
});
