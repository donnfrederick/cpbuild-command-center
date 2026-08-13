import { describe, it, expect } from "vitest";
import { biProjectByIdWhere, biProjectListWhere } from "@/lib/bi-project-access";

describe("biProjectListWhere()", () => {
  it("excludes test projects when allowedProjectIds is empty", () => {
    expect(biProjectListWhere([])).toEqual({ deletedAt: null, isTestProject: false });
  });

  it("restricts to whitelisted IDs without isTestProject filter when whitelist is set", () => {
    expect(biProjectListWhere(["p1", "p2"])).toEqual({
      deletedAt: null,
      id: { in: ["p1", "p2"] },
    });
  });
});

describe("biProjectByIdWhere()", () => {
  it("excludes test projects when ID is not whitelisted", () => {
    expect(biProjectByIdWhere("clone-1", [])).toEqual({
      id: "clone-1",
      deletedAt: null,
      isTestProject: false,
    });
  });

  it("allows test clone when project ID is whitelisted on the key", () => {
    expect(biProjectByIdWhere("clone-1", ["clone-1"])).toEqual({
      id: "clone-1",
      deletedAt: null,
    });
  });
});
