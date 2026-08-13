import { describe, it, expect } from "vitest";
import {
  compareProjectsByField,
  compareProjectsByName,
  sortProjectsWithFavorites,
  type FavoriteProjectMeta,
} from "@/lib/project-favorites-shared";
import type { Project } from "@/lib/projects";

function makeProject(id: string, name: string): Project {
  return {
    id,
    projectName: name,
    siteLocation: "",
    status: "",
    lifecycleStatus: "Active",
    startDate: null,
    installManagerId: null,
    installManagerName: null,
    projectManagerId: null,
    projectManagerName: "",
    unifierPid: null,
    unifierProjectNumber: null,
    scopeTypes: [],
    isTestProject: false,
    clonedFromProjectId: null,
    clonedFromProjectName: null,
    clonedAt: null,
    isFavorite: false,
  };
}

describe("sortProjectsWithFavorites", () => {
  const projects = [
    makeProject("a", "Alpha"),
    makeProject("b", "Beta"),
    makeProject("c", "Charlie"),
  ];

  it("pins favorites before non-favorites", () => {
    const meta: FavoriteProjectMeta = {
      favoriteIds: new Set(["c"]),
      favoriteOrder: new Map([["c", 0]]),
    };

    const sorted = sortProjectsWithFavorites(projects, meta, compareProjectsByName);
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("preserves favorite order among favorites", () => {
    const meta: FavoriteProjectMeta = {
      favoriteIds: new Set(["b", "c"]),
      favoriteOrder: new Map([
        ["c", 0],
        ["b", 1],
      ]),
    };

    const sorted = sortProjectsWithFavorites(projects, meta, compareProjectsByName);
    expect(sorted.map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("applies column sort within each group", () => {
    const meta: FavoriteProjectMeta = {
      favoriteIds: new Set(["c", "a"]),
      favoriteOrder: new Map([
        ["c", 0],
        ["a", 1],
      ]),
    };

    const sorted = sortProjectsWithFavorites(
      projects,
      meta,
      compareProjectsByField("projectName", "desc")
    );
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
});
