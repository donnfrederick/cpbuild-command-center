import { describe, expect, it } from "vitest";
import { filterFieldDailyReportProjects } from "@/lib/field-daily-report/filter-report-projects";
import { emptyProjectSnapshot } from "@/lib/field-daily-report/snapshot-activity";
import type { FieldDailyReportProjectDto } from "@/lib/field-daily-report/types";

function project(
  id: string,
  name: string,
  withActivity: boolean,
): FieldDailyReportProjectDto {
  const snapshot = emptyProjectSnapshot();
  if (withActivity) {
    snapshot.progress.statusChangeCount = 1;
  }
  return {
    projectId: id,
    projectName: name,
    snapshot,
    sectionNotes: [],
    comments: [],
  };
}

describe("filterFieldDailyReportProjects", () => {
  const projects = [
    project("p1", "Hotel Indigo", true),
    project("p2", "Menchaca", false),
    project("p3", "348 South Temple", true),
  ];

  it("returns all projects by default", () => {
    expect(filterFieldDailyReportProjects(projects)).toHaveLength(3);
  });

  it("filters by case-insensitive name search", () => {
    const result = filterFieldDailyReportProjects(projects, { searchQuery: "hotel" });
    expect(result.map((p) => p.projectId)).toEqual(["p1"]);
  });

  it("filters to projects with field activity only", () => {
    const result = filterFieldDailyReportProjects(projects, { activityFilter: "withChanges" });
    expect(result.map((p) => p.projectId)).toEqual(["p1", "p3"]);
  });

  it("combines search and activity filters", () => {
    const result = filterFieldDailyReportProjects(projects, {
      searchQuery: "south",
      activityFilter: "withChanges",
    });
    expect(result.map((p) => p.projectId)).toEqual(["p3"]);
  });

  it("sorts projects with activity before those without", () => {
    const mixed = [
      project("p1", "Alpha", false),
      project("p2", "Bravo", true),
      project("p3", "Charlie", false),
      project("p4", "Delta", true),
    ];
    expect(filterFieldDailyReportProjects(mixed).map((p) => p.projectId)).toEqual([
      "p2",
      "p4",
      "p1",
      "p3",
    ]);
  });
});
