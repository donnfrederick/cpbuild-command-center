import { describe, it, expect } from "vitest";
import {
  applyUnitCardFilters,
  EMPTY_ISSUE_META,
  type ActiveFilters,
  type UnitCard,
} from "@/components/projects/UnitCards";

const BASE_FILTERS: ActiveFilters = {
  stages: [],
  scopeTypeNames: [],
  scopeSubNames: [],
  unitTypes: [],
  locationKinds: [],
  buildings: [],
  levels: [],
  buildPhases: [],
  areas: [],
  issueTypes: [],
  responsibleParties: [],
  issueStatuses: [],
  issueBlocking: null,
  issueScopeTypeNames: [],
  issueSubScopeNames: [],
  inspectionStatuses: [],
  calibrationStatuses: [],
  subcontractorAssigned: null,
  subcontractorIds: [],
  unitsWithIssuesOnly: false,
};

function makeCard(
  key: string,
  hasIssues: boolean,
  opts?: { unitType?: string; commonArea?: boolean },
): UnitCard {
  return {
    key,
    building: "A",
    level: "1",
    unit: key,
    area: "",
    buildPhase: "",
    unitType: opts?.unitType ?? "Type A",
    scopes: [],
    locationType: opts?.commonArea ? { id: "lt-c", code: "C", name: "Common" } : null,
    issueMeta: hasIssues
      ? {
          ...EMPTY_ISSUE_META,
          hasIssues: true,
          hasOpenIssues: true,
          statuses: ["OPEN"],
          issueTypes: ["SUBSTRATE_CONDITION"],
          responsibleParties: ["CP_BUILD"],
        }
      : EMPTY_ISSUE_META,
  };
}

describe("applyUnitCardFilters", () => {
  it("returns only locations with issues when unitsWithIssuesOnly is true", () => {
    const cards = [makeCard("101", true), makeCard("102", false), makeCard("103", true)];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, unitsWithIssuesOnly: true },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["101", "103"]);
  });

  it("returns all locations when unitsWithIssuesOnly is false", () => {
    const cards = [makeCard("101", true), makeCard("102", false)];
    const result = applyUnitCardFilters(cards, "", BASE_FILTERS, false);
    expect(result).toHaveLength(2);
  });

  it("returns only common areas when locationKinds is common_areas", () => {
    const cards = [
      makeCard("101", false),
      makeCard("Lobby", false, { commonArea: true }),
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, locationKinds: ["common_areas"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["Lobby"]);
  });

  it("returns only regular units when locationKinds is units", () => {
    const cards = [
      makeCard("101", false),
      makeCard("Lobby", false, { commonArea: true }),
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, locationKinds: ["units"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["101"]);
  });

  it("excludes common areas when filtering by unit type", () => {
    const cards = [
      makeCard("101", false, { unitType: "1A.1" }),
      makeCard("Lobby", false, { commonArea: true, unitType: "1A.1" }),
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, unitTypes: ["1A.1"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["101"]);
  });

  it("filters by build phase when buildPhases is set", () => {
    const cards: UnitCard[] = [
      { ...makeCard("101", false), buildPhase: "2", area: "North" },
      { ...makeCard("102", false), buildPhase: "3", area: "North" },
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, buildPhases: ["2"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["101"]);
  });

  it("filters by area when areas is set", () => {
    const cards: UnitCard[] = [
      { ...makeCard("101", false), buildPhase: "2", area: "Main Building" },
      { ...makeCard("102", false), buildPhase: "2", area: "West Wing" },
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, areas: ["Main Building"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["101"]);
  });

  it("resolves build phase from scopes when filtering", () => {
    const cards: UnitCard[] = [
      {
        ...makeCard("101", false),
        buildPhase: "",
        area: "",
        scopes: [
          {
            id: "s1",
            scopeType: null,
            description: "",
            qty: null,
            uom: null,
            percentComplete: null,
            installer: null,
            unifierSubId: null,
            shipPhase: "",
            buildPhase: "Phase A",
            scopeStage: null,
            scopeStatus: null,
            inspectionStatus: null,
            subScopeInstances: [],
            clearInspection: null,
          },
        ],
      },
      makeCard("102", false),
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, buildPhases: ["Phase A"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["101"]);
  });

  it("filters by calibration PASSED outcome on scope rows", () => {
    const cards: UnitCard[] = [
      {
        ...makeCard("101", false),
        scopes: [
          {
            id: "scope-1",
            scopeType: null,
            description: "Tile",
            qty: null,
            uom: null,
            percentComplete: null,
            installer: null,
            unifierSubId: null,
            shipPhase: "",
            buildPhase: "",
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            inspectionStatus: "PASSED",
            latestCalibrationOutcome: "PASS",
            subScopeInstances: [],
            clearInspection: null,
          },
        ],
      },
      makeCard("102", false),
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, calibrationStatuses: ["PASSED"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["101"]);
  });

  it("filters by calibration FAILED outcome on scope rows", () => {
    const cards: UnitCard[] = [
      {
        ...makeCard("101", false),
        scopes: [
          {
            id: "scope-1",
            scopeType: null,
            description: "Tile",
            qty: null,
            uom: null,
            percentComplete: null,
            installer: null,
            unifierSubId: null,
            shipPhase: "",
            buildPhase: "",
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            inspectionStatus: "PASSED",
            latestCalibrationOutcome: "FAIL",
            subScopeInstances: [],
            clearInspection: null,
          },
        ],
      },
      makeCard("102", false),
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, calibrationStatuses: ["FAILED"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["101"]);
  });

  it("includes scopes awaiting calibration when calibration filter is active", () => {
    const cards: UnitCard[] = [
      {
        ...makeCard("701", false),
        scopes: [
          {
            id: "scope-awaiting",
            scopeType: null,
            description: "Cabinets",
            qty: null,
            uom: null,
            percentComplete: null,
            installer: null,
            unifierSubId: null,
            shipPhase: "",
            buildPhase: "",
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            inspectionStatus: "PASSED",
            latestInspectionCategory: "CLEAR_INSPECTION",
            latestCalibrationOutcome: null,
            subScopeInstances: [],
            clearInspection: null,
          },
        ],
      },
      makeCard("702", false),
    ];
    const result = applyUnitCardFilters(
      cards,
      "",
      { ...BASE_FILTERS, calibrationStatuses: ["PASSED"] },
      false,
    );
    expect(result.map((c) => c.key)).toEqual(["701"]);
  });
});
