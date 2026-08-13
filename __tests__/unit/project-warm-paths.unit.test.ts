import { describe, expect, it } from "vitest";
import {
  PROJECT_WARM_SUB_PAGES,
  albumWarmApiUrls,
  projectWarmApiUrls,
  resolveWarmHtmlSubPages,
  unitRefsFromSnapshotUnits,
  warmHtmlLocales,
} from "@/lib/offline/project-warm-paths";

describe("project-warm-paths", () => {
  it("includes inspections log routes but not reports", () => {
    expect(PROJECT_WARM_SUB_PAGES).toContain("/log/inspections");
    expect(PROJECT_WARM_SUB_PAGES).toContain("/log/issues");
    expect(PROJECT_WARM_SUB_PAGES.some((p) => p.includes("reports"))).toBe(false);
  });

  it("minimal auto-warm uses fewer pages and English only", () => {
    expect(resolveWarmHtmlSubPages("minimal").length).toBeLessThan(
      resolveWarmHtmlSubPages(true).length,
    );
    expect(warmHtmlLocales("minimal")).toEqual(["en"]);
  });

  it("warms inspection APIs for each project", () => {
    const urls = projectWarmApiUrls("proj-1");
    expect(urls).toContain("/api/projects/proj-1/inspections-report");
    expect(urls).toContain("/api/inspection-submissions?projectId=proj-1");
    expect(urls).toContain("/api/projects/proj-1/activity");
    expect(urls).toContain("/api/projects/proj-1/sub-scopes");
    expect(urls).toContain("/api/projects/proj-1/custom-site-locations");
  });

  it("builds album warm URLs from snapshot units", () => {
    const refs = unitRefsFromSnapshotUnits([
      { projectId: "p1", building: "A", level: "1", unit: "101" },
      { projectId: "p2", building: "B", level: "2", unit: "202" },
    ], "p1");
    expect(refs).toEqual(["A|1|101"]);
    expect(albumWarmApiUrls("p1", refs)[0]).toContain("unitRef=A%7C1%7C101");
  });
});
