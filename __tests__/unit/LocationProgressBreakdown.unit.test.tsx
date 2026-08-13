import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

// ── Module mocks ────────────────────────────────────────────────────────────
vi.mock("@/components/projects/SubcontractorPicker", () => ({
  getCachedSubItems: vi.fn().mockReturnValue([
    { id: "sub-1", name: "Acme Tile" },
    { id: "sub-2", name: "Best Electric" },
  ]),
  ensureSubItemsFetched: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports after mocks ─────────────────────────────────────────────────────
import {
  groupRows,
  sortScopes,
  resolveInstallerName,
  exportToCsv,
  LocationProgressBreakdown,
  type BreakdownRow,
} from "@/components/projects/LocationProgressBreakdown";
import type { SubItem } from "@/components/projects/SubcontractorPicker";

// ── i18n wrapper ─────────────────────────────────────────────────────────────

const MESSAGES = {
  projects: {
    breakdown: {
      noRows: "No rows loaded yet.",
      noRowsMatch: "No rows match the current search.",
      groupByPhaseAria: "Group by phase",
      groupByShipPhase: "Ship Phase",
      groupByBuildPhase: "Build Phase",
      expandAll: "Expand all",
      collapseAll: "Collapse all",
      searchPlaceholder: "Filter by building, phase, unit…",
      searchAria: "Search breakdown",
      exportCsv: "Export CSV",
      exportCsvAria: "Export progress breakdown as CSV",
      colLocation: "Location / Scope",
      colPct: "% Complete",
      colStage: "Stage",
      colStatus: "Status",
      colInspection: "Inspection",
      colStart: "Start Date",
      colFinish: "Finish Date",
      levelPrefix: "Lvl",
      unitPrefix: "Unit",
      expand: "Expand",
      collapse: "Collapse",
      colInstaller: "Installer",
      installerCount: "installers",
    },
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<BreakdownRow> = {}): BreakdownRow {
  return {
    id: "row-1",
    building: "A",
    level: "1",
    unit: "101",
    area: "",
    shipPhase: "Phase 1",
    buildPhase: "Build A",
    description: "Flooring",
    scopeType: { id: "st-1", code: "FLR", name: "Flooring" },
    installer: null,
    unifierSubId: null,
    qty: 10,
    scopeStage: "INSTALL",
    scopeStatus: "COMPLETE",
    inspectionStatus: null,
    startDate: "2026-01-01",
    finishDate: "2026-03-31",
    percentComplete: null,
    subScopeInstances: [],
    ...overrides,
  };
}

const MOCK_SUBS: SubItem[] = [
  { id: "sub-1", name: "Acme Tile" },
  { id: "sub-2", name: "Best Electric" },
];

// ── Pure function tests ───────────────────────────────────────────────────────

describe("groupRows()", () => {
  it("returns empty array for empty input", () => {
    expect(groupRows([], "shipPhase")).toEqual([]);
  });

  it("creates one BuildingGroup per distinct building", () => {
    const rows = [
      makeRow({ building: "A", unit: "101" }),
      makeRow({ id: "row-2", building: "B", unit: "201" }),
    ];
    const groups = groupRows(rows, "shipPhase");
    expect(groups.map((g) => g.building).sort()).toEqual(["A", "B"]);
  });

  it("places null building under '—'", () => {
    const rows = [makeRow({ building: "" })];
    const groups = groupRows(rows, "shipPhase");
    expect(groups[0].building).toBe("—");
  });

  it("places null phase under '—'", () => {
    const rows = [makeRow({ shipPhase: "" })];
    const groups = groupRows(rows, "shipPhase");
    const phase = groups[0].phases[0];
    expect(phase.phase).toBe("—");
  });

  it("uses shipPhase when phaseField is 'shipPhase'", () => {
    const rows = [makeRow({ shipPhase: "Phase 1", buildPhase: "Build A" })];
    const groups = groupRows(rows, "shipPhase");
    expect(groups[0].phases[0].phase).toBe("Phase 1");
  });

  it("uses buildPhase when phaseField is 'buildPhase'", () => {
    const rows = [makeRow({ shipPhase: "Phase 1", buildPhase: "Build A" })];
    const groups = groupRows(rows, "buildPhase");
    expect(groups[0].phases[0].phase).toBe("Build A");
  });

  it("nests Building → Phase → Level → Unit correctly", () => {
    const rows = [
      makeRow({ building: "A", shipPhase: "P1", level: "1", unit: "101" }),
      makeRow({ id: "r2", building: "A", shipPhase: "P1", level: "1", unit: "102" }),
    ];
    const groups = groupRows(rows, "shipPhase");
    expect(groups).toHaveLength(1);
    expect(groups[0].phases).toHaveLength(1);
    expect(groups[0].phases[0].levels).toHaveLength(1);
    expect(groups[0].phases[0].levels[0].units).toHaveLength(2);
  });

  it("keeps two scopes for the same unit under one unit group", () => {
    const rows = [
      makeRow({ id: "r1", building: "A", unit: "101", description: "Flooring" }),
      makeRow({ id: "r2", building: "A", unit: "101", description: "Countertop" }),
    ];
    const groups = groupRows(rows, "shipPhase");
    const unit = groups[0].phases[0].levels[0].units[0];
    expect(unit.scopes).toHaveLength(2);
  });
});

// ── resolveScopeName via rendered output ──────────────────────────────────────

describe("scope name display — canonical vs raw", () => {
  it("shows canonicalScopeType.displayName when present (not raw scopeType.name)", async () => {
    const row = makeRow({
      scopeType: {
        id: "st-lvt",
        code: "LVT",
        name: "LVT Flooring",
        canonicalScopeType: { id: "cst-lvts", code: "LVTS", displayName: "LVT Stairs" },
      },
    });
    render(<LocationProgressBreakdown units={[row]} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await waitFor(() => {
      expect(screen.getByText("LVT Stairs")).toBeDefined();
      expect(screen.queryByText("LVT Flooring")).toBeNull();
    });
  });

  it("falls back to scopeType.name when no canonical is linked", async () => {
    const row = makeRow({
      scopeType: { id: "st-flr", code: "FLR", name: "LVT Flooring", canonicalScopeType: null },
    });
    render(<LocationProgressBreakdown units={[row]} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await waitFor(() => {
      expect(screen.getByText("LVT Flooring")).toBeDefined();
    });
  });

  it("falls back to description when scopeType is null", async () => {
    const row = makeRow({ scopeType: null, description: "Misc Scope" });
    render(<LocationProgressBreakdown units={[row]} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await waitFor(() => {
      expect(screen.getByText("Misc Scope")).toBeDefined();
    });
  });
});

// ── sortScopes ────────────────────────────────────────────────────────────────

describe("sortScopes()", () => {
  const alpha = makeRow({ id: "a", scopeType: { id: "1", code: "A", name: "Cabinets" }, description: "Cabinets", startDate: "2026-01-01", finishDate: "2026-06-30", scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: null });
  const beta  = makeRow({ id: "b", scopeType: { id: "2", code: "B", name: "Flooring"  }, description: "Flooring",  startDate: "2026-03-01", finishDate: "2026-12-31", scopeStage: "STAGING",  scopeStatus: "IN_PROGRESS", inspectionStatus: null });

  it("returns original order when sortKey is null", () => {
    const sorted = sortScopes([beta, alpha], null, "asc");
    expect(sorted[0].id).toBe("b");
  });

  it("sorts by scopeName ascending", () => {
    const sorted = sortScopes([beta, alpha], "scopeName", "asc");
    expect(sorted[0].id).toBe("a");
  });

  it("sorts by scopeName descending", () => {
    const sorted = sortScopes([alpha, beta], "scopeName", "desc");
    expect(sorted[0].id).toBe("b");
  });

  it("sorts by canonical displayName when present (not raw scopeType.name)", () => {
    // raw names: "Cabinets" (alpha) and "Flooring" (beta)
    // canonical names override: "ZZZ Cabinets" (alpha) and "AAA Flooring" (beta)
    const withCanonical = [
      makeRow({ ...alpha, scopeType: { id: "1", code: "A", name: "Cabinets", canonicalScopeType: { id: "c1", code: "ZZZ", displayName: "ZZZ Cabinets" } } }),
      makeRow({ ...beta,  scopeType: { id: "2", code: "B", name: "Flooring",  canonicalScopeType: { id: "c2", code: "AAA", displayName: "AAA Flooring" } } }),
    ];
    const sorted = sortScopes(withCanonical, "scopeName", "asc");
    // AAA Flooring < ZZZ Cabinets alphabetically
    expect(sorted[0].scopeType?.canonicalScopeType?.displayName).toBe("AAA Flooring");
  });

  it("sorts by pct ascending (COMPLETE > IN_PROGRESS)", () => {
    const sorted = sortScopes([alpha, beta], "pct", "asc");
    // alpha is INSTALL+COMPLETE → 100%; beta is STAGING+IN_PROGRESS → 0%
    expect(sorted[0].id).toBe("b");
  });

  it("sorts by stage alphabetically ascending", () => {
    const sorted = sortScopes([alpha, beta], "stage", "asc");
    // INSTALL < STAGING
    expect(sorted[0].id).toBe("a");
  });

  it("sorts by status ascending", () => {
    const sorted = sortScopes([beta, alpha], "status", "asc");
    // "COMPLETE" < "IN_PROGRESS" alphabetically, so alpha (COMPLETE) comes first
    expect(sorted[0].id).toBe("a");
  });

  it("sorts by startDate ascending", () => {
    const sorted = sortScopes([beta, alpha], "startDate", "asc");
    expect(sorted[0].id).toBe("a");
  });

  it("sorts by finishDate descending", () => {
    const sorted = sortScopes([alpha, beta], "finishDate", "desc");
    expect(sorted[0].id).toBe("b");
  });

  it("sorts by installer using resolveSubName callback", () => {
    const rowA = makeRow({ id: "a", unifierSubId: "sub-2", installer: null }); // Best Electric
    const rowB = makeRow({ id: "b", unifierSubId: "sub-1", installer: null }); // Acme Tile

    const resolve = (r: BreakdownRow) =>
      MOCK_SUBS.find((s) => s.id === r.unifierSubId)?.name ?? null;

    const sorted = sortScopes([rowA, rowB], "installer", "asc", resolve);
    // Acme Tile before Best Electric
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
  });

  it("falls back to installer.name when no resolveSubName and no unifierSubId", () => {
    const rowA = makeRow({ id: "a", unifierSubId: null, installer: { id: "i1", code: "B", name: "Zara Inc" } });
    const rowB = makeRow({ id: "b", unifierSubId: null, installer: { id: "i2", code: "A", name: "Alpha LLC" } });

    const sorted = sortScopes([rowA, rowB], "installer", "asc");
    expect(sorted[0].id).toBe("b");
  });
});

// ── resolveInstallerName ──────────────────────────────────────────────────────

describe("resolveInstallerName()", () => {
  it("returns empty string when both unifierSubId and installer are null", () => {
    const row = makeRow({ unifierSubId: null, installer: null });
    expect(resolveInstallerName(row, MOCK_SUBS)).toBe("");
  });

  it("returns installer.name when unifierSubId is null", () => {
    const row = makeRow({ unifierSubId: null, installer: { id: "i1", code: "A", name: "Old Crew" } });
    expect(resolveInstallerName(row, MOCK_SUBS)).toBe("Old Crew");
  });

  it("returns matched sub name when unifierSubId is set", () => {
    const row = makeRow({ unifierSubId: "sub-1", installer: { id: "i1", code: "A", name: "Ignored" } });
    expect(resolveInstallerName(row, MOCK_SUBS)).toBe("Acme Tile");
  });

  it("returns empty string when unifierSubId is not found in subs list", () => {
    const row = makeRow({ unifierSubId: "sub-999", installer: null });
    expect(resolveInstallerName(row, MOCK_SUBS)).toBe("");
  });
});

// ── exportToCsv ──────────────────────────────────────────────────────────────

describe("exportToCsv()", () => {
  function buildGroups(phaseField: "shipPhase" | "buildPhase" = "shipPhase") {
    const rows = [
      makeRow({ id: "r1", building: "A", shipPhase: "Phase 1", buildPhase: "Build A", level: "1", unit: "101", unifierSubId: "sub-1" }),
    ];
    return groupRows(rows, phaseField);
  }

  it("includes a header row as the first line", () => {
    const csv = exportToCsv(buildGroups(), "shipPhase", MOCK_SUBS);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines[0]).toContain("Depth");
    expect(lines[0]).toContain("Building");
    expect(lines[0]).toContain("% Complete");
    expect(lines[0]).toContain("Installer");
  });

  it("depth=0 for building row, depth=4 for scope row", () => {
    const csv = exportToCsv(buildGroups(), "shipPhase", MOCK_SUBS);
    const lines = csv.split("\n").filter(Boolean).slice(1); // skip header
    const depths = lines.map((l) => Number(l.split(",")[0]));
    // depths should include 0 (building), 1 (phase), 2 (level), 3 (unit), 4 (scope)
    expect(depths).toContain(0);
    expect(depths).toContain(4);
  });

  it("includes resolved installer name from unifierSubId in scope rows", () => {
    const csv = exportToCsv(buildGroups(), "shipPhase", MOCK_SUBS);
    expect(csv).toContain("Acme Tile");
  });

  it("has correct column count on every row", () => {
    // Count fields correctly — naive comma-split breaks when cells contain
    // quoted commas (which exportToCsv explicitly supports).
    function countCsvFields(line: string): number {
      let count = 1;
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === "," && !inQuotes) count++;
      }
      return count;
    }
    const csv = exportToCsv(buildGroups(), "shipPhase", MOCK_SUBS);
    const lines = csv.split("\n").filter(Boolean);
    const headerCount = countCsvFields(lines[0]);
    for (const line of lines.slice(1)) {
      expect(countCsvFields(line)).toBe(headerCount);
    }
  });
});

// ── Component tests ───────────────────────────────────────────────────────────

describe("LocationProgressBreakdown (component)", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:test"),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the empty state when units is empty", () => {
    render(<LocationProgressBreakdown units={[]} />, { wrapper: Wrapper });
    expect(screen.getByText("No rows loaded yet.")).toBeDefined();
  });

  it("renders building header row for a row with data", async () => {
    render(
      <LocationProgressBreakdown units={[makeRow({ building: "Tower A" })]} />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Tower A")).toBeDefined();
  });

  it("shows Ship Phase button as active by default", () => {
    render(<LocationProgressBreakdown units={[makeRow()]} />, { wrapper: Wrapper });
    const shipBtn = screen.getByRole("button", { name: "Ship Phase" });
    expect(shipBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches to Build Phase when Build Phase button is clicked", async () => {
    const row = makeRow({ buildPhase: "Build X" });
    render(<LocationProgressBreakdown units={[row]} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Build Phase" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Build Phase" }).getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("shows 'no rows match' message when search yields no results", async () => {
    render(
      <LocationProgressBreakdown units={[makeRow({ building: "Alpha" })]} />,
      { wrapper: Wrapper }
    );
    const searchInput = screen.getByPlaceholderText("Filter by building, phase, unit…");
    fireEvent.change(searchInput, { target: { value: "zzznomatch" } });
    await waitFor(() => {
      expect(screen.getByText("No rows match the current search.")).toBeDefined();
    });
  });

  it("expand all makes sub-rows visible", async () => {
    const rows = [makeRow({ building: "A", level: "1", unit: "101" })];
    render(<LocationProgressBreakdown units={rows} />, { wrapper: Wrapper });

    const expandAllBtn = screen.getByRole("button", { name: "Expand all" });
    fireEvent.click(expandAllBtn);

    await waitFor(() => {
      // After expanding, scope rows (unit 101) should be visible
      expect(screen.getByText("101")).toBeDefined();
    });
  });

  it("collapse all hides sub-rows after expand all", async () => {
    const rows = [makeRow({ building: "A" })];
    render(<LocationProgressBreakdown units={rows} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await waitFor(() => expect(screen.getByText("101")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    await waitFor(() => {
      expect(screen.queryByText("101")).toBeNull();
    });
  });

  it("CSV Export button is present", () => {
    render(
      <LocationProgressBreakdown units={[makeRow()]} />,
      { wrapper: Wrapper }
    );
    const exportBtn = screen.getByRole("button", { name: /Export progress breakdown as CSV/i });
    expect(exportBtn).toBeDefined();
  });
});
