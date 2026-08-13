import { describe, it, expect, beforeEach } from "vitest";
import {
  getTouchedUnitRefs,
  hasSessionFullAlbumWarm,
  markSessionFullAlbumWarm,
  markUnitAlbumTouched,
  planBackgroundAlbumWarm,
  resetAlbumWarmSessionForProject,
} from "@/lib/offline/album-warm-session";

describe("album-warm-session", () => {
  const projectId = "proj-a";

  beforeEach(() => {
    resetAlbumWarmSessionForProject(projectId);
  });

  it("plans full album warm on first background resync for a project", () => {
    const plan = planBackgroundAlbumWarm(
      [projectId],
      { [projectId]: ["B|1|101", "B|1|102"] },
    );
    expect(plan.urls).toHaveLength(2);
    expect(plan.urls[0]).toContain("/album?unitRef=");
    expect(plan.markFullWarmProjectIds).toEqual([projectId]);
    expect(hasSessionFullAlbumWarm(projectId)).toBe(false);
  });

  it("plans no album warm after full session warm with no touched units", () => {
    markSessionFullAlbumWarm(projectId);
    const plan = planBackgroundAlbumWarm(
      [projectId],
      { [projectId]: ["B|1|101"] },
    );
    expect(plan.urls).toHaveLength(0);
    expect(plan.markFullWarmProjectIds).toHaveLength(0);
  });

  it("plans touched units only on later resyncs after session full warm", () => {
    markSessionFullAlbumWarm(projectId);
    markUnitAlbumTouched(projectId, "B|1|102");
    const plan = planBackgroundAlbumWarm(
      [projectId],
      { [projectId]: ["B|1|101", "B|1|102", "B|1|103"] },
    );
    expect(plan.urls).toHaveLength(1);
    expect(plan.urls[0]).toContain(encodeURIComponent("B|1|102"));
    expect(getTouchedUnitRefs(projectId)).toEqual(["B|1|102"]);
  });

  it("dedupes touched unit refs in session storage", () => {
    markUnitAlbumTouched(projectId, "B|1|101");
    markUnitAlbumTouched(projectId, "B|1|101");
    expect(getTouchedUnitRefs(projectId)).toEqual(["B|1|101"]);
  });
});
