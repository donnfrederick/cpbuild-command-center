import { describe, it, expect } from "vitest";
import {
  createIssueMetaBuilder,
  EMPTY_ISSUE_META,
  serializeUnitRow,
  type ProjectRowWithRelations,
} from "@/lib/project-units-serialize";

function minimalUnitRow(overrides: Partial<ProjectRowWithRelations> = {}): ProjectRowWithRelations {
  return {
    id: "row-1",
    projectId: "proj-1",
    rowIndex: 0,
    building: "A",
    level: "1",
    unit: "101",
    area: null,
    shipPhase: null,
    buildPhase: null,
    scheme: null,
    unitType: null,
    description: null,
    csiPrimeCode: null,
    csiDetailCode: null,
    scopeStage: null,
    scopeStatus: null,
    inspectionStatus: null,
    unifierSubId: null,
    qty: null,
    unitRate: null,
    budgetedManHours: null,
    startDate: null,
    finishDate: null,
    percentComplete: null,
    actualManHours: null,
    scopeType: null,
    locationType: null,
    costType: null,
    installer: null,
    uom: null,
    subScopeInstances: [],
    clearInspections: [],
    ...overrides,
  } as ProjectRowWithRelations;
}

describe("project-units-serialize", () => {
  it("serializeUnitRow includes unifierSubId, installer, issueMeta, subScopeInstances", () => {
    const buildIssueMeta = createIssueMetaBuilder([
      {
        unitRef: "A|1|101",
        issueTypeCode: "QUALITY",
        responsiblePartyCode: "ELECTRICIAN",
        responsiblePartyTags: [{ partyCode: "ELECTRICIAN" }, { partyCode: "PLUMBER" }],
        isBlockingWork: false,
        status: "OPEN",
        scopeTags: [{ projectRowId: "row-1" }],
        subScopeTags: [],
      },
    ]);

    const row = serializeUnitRow(
      minimalUnitRow({
        unifierSubId: "sub-99",
        installer: { id: "inst-1", code: "I1", name: "Installer One" },
        subScopeInstances: [
          {
            id: "ssi-1",
            subScopeId: "ss-1",
            qty: null,
            scopeStage: null,
            scopeStatus: null,
            inspectionStatus: null,
            subScope: {
              id: "ss-1",
              name: "Kitchen",
              displayOrder: 1,
              unitType: null,
              scopeTypeId: "st-1",
            },
          },
        ],
      }),
      buildIssueMeta,
      { includeProjectId: true },
    );

    expect(row.projectId).toBe("proj-1");
    expect(row.unifierSubId).toBe("sub-99");
    expect(row.installer).toEqual({ id: "inst-1", code: "I1", name: "Installer One" });
    expect(row.subScopeInstances).toHaveLength(1);
    expect(row.issueMeta.hasOpenIssues).toBe(true);
    expect(row.issueMeta.responsibleParties).toEqual(
      expect.arrayContaining(["ELECTRICIAN", "PLUMBER"]),
    );
  });

  it("createIssueMetaBuilder returns EMPTY_ISSUE_META for unknown unit ref", () => {
    const build = createIssueMetaBuilder([]);
    expect(build("X|Y|Z")).toEqual(EMPTY_ISSUE_META);
  });

  it("createIssueMetaBuilder handles null unitRef on issues", () => {
    const build = createIssueMetaBuilder([
      {
        unitRef: null,
        issueTypeCode: "QUALITY",
        responsiblePartyCode: "SUB",
        isBlockingWork: false,
        status: "OPEN",
        scopeTags: [],
        subScopeTags: [],
      },
    ]);
    expect(build("A|1|101")).toEqual(EMPTY_ISSUE_META);
  });

  it("serializeUnitRow prefers projectScopeOverrides map over global canonical", () => {
    const row = serializeUnitRow(
      minimalUnitRow({
        scopeType: {
          id: "st1",
          code: "LVT",
          name: "LVT",
          canonicalScopeType: { id: "global", code: "LVT", displayName: "LVT Flooring" },
        },
      }),
      () => EMPTY_ISSUE_META,
      {
        projectScopeOverrides: new Map([
          ["st1", { id: "override", code: "LVT-S", displayName: "LVT Stairs" }],
        ]),
      },
    );

    expect(row.scopeType?.canonicalScopeType?.displayName).toBe("LVT Stairs");
  });
});
