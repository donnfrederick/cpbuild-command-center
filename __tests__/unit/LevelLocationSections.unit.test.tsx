import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { UnitCard } from "@/components/projects/UnitCards";
import {
  LevelCustomSiteLocationsStrip,
  LevelLocationSections,
  LevelScopeBreakdownPanel,
} from "@/components/projects/LevelLocationSections";

const openAddSheetForLevel = vi.fn();

vi.mock("@/components/projects/CustomSiteLocationsProvider", () => ({
  useCustomSiteLocations: vi.fn(),
}));

vi.mock("@/components/projects/CustomSiteLocationTile", () => ({
  CustomSiteLocationTile: ({ location }: { location: { name: string } }) => (
    <div data-testid="custom-site-tile">{location.name}</div>
  ),
}));

vi.mock("@/components/projects/CustomSiteLocationAddTile", () => ({
  CustomSiteLocationAddTile: ({ ariaLabel, onClick }: { ariaLabel: string; onClick: () => void }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      Add custom location
    </button>
  ),
}));

import { useCustomSiteLocations } from "@/components/projects/CustomSiteLocationsProvider";

const UNIT_CARD = { key: "u1", unit: "101" } as UnitCard;
const COMMON_CARD = { key: "c1", unit: "Lobby", locationType: "COMMON_AREA" } as UnitCard;

function mockCustomSiteContext(
  overrides: Partial<ReturnType<typeof useCustomSiteLocations>> = {},
) {
  vi.mocked(useCustomSiteLocations).mockReturnValue({
    locations: [],
    loading: false,
    refresh: vi.fn(),
    locationsFilterVisible: true,
    locationsForLevel: () => [],
    locationsForBuilding: () => [],
    openAddSheet: vi.fn(),
    openAddSheetForLevel,
    openAddSheetForBuilding: vi.fn(),
    openLocation: vi.fn(),
    openEdit: vi.fn(),
    requestDelete: vi.fn(),
    ...overrides,
  });
}

function renderWithIntl(ui: ReactNode) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{
        units: {
          sectionCommonAreas: "Common areas",
          sectionCustomLocations: "Custom locations",
          sectionUnits: "Units",
          scopeCompleteByScope: "% Complete by Scope",
          customSite: {
            addForLevelAria: "Add custom location for {building} {level}",
          },
        },
      }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("LevelCustomSiteLocationsStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomSiteContext();
  });

  it("shows add tile on every real level even when no custom locations exist", () => {
    renderWithIntl(
      <LevelCustomSiteLocationsStrip buildingKey="NORTH" levelKey="2" />,
    );
    expect(screen.getByRole("separator", { name: "Custom locations" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add custom location for NORTH 2" }),
    ).toBeInTheDocument();
  });

  it("hides on synthetic __all level bucket", () => {
    const { container } = renderWithIntl(
      <LevelCustomSiteLocationsStrip buildingKey="NORTH" levelKey="__all" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LevelScopeBreakdownPanel", () => {
  it("renders scope rows when at least two scopes exist", () => {
    renderWithIntl(
      <LevelScopeBreakdownPanel
        scopeStats={[
          { name: "Cabinets", pct: 40, subPct: 10 },
          { name: "Countertops", pct: 0, subPct: 0 },
        ]}
      />,
    );
    expect(screen.getByText("% Complete by Scope")).toBeInTheDocument();
    expect(screen.getByText("Cabinets")).toBeInTheDocument();
    expect(screen.getByText("Countertops")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("+10%")).toBeInTheDocument();
  });

  it("renders nothing when fewer than two scopes", () => {
    const { container } = renderWithIntl(
      <LevelScopeBreakdownPanel scopeStats={[{ name: "Cabinets", pct: 50, subPct: 0 }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LevelLocationSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomSiteContext();
  });

  it("renders scope breakdown above custom locations in grid view", () => {
    const { container } = renderWithIntl(
      <LevelLocationSections
        buildingKey="NORTH"
        levelKey="2"
        commonAreaCards={[COMMON_CARD]}
        unitCards={[UNIT_CARD]}
        allCards={[COMMON_CARD, UNIT_CARD]}
        scopeStats={[
          { name: "Cabinets", pct: 25, subPct: 0 },
          { name: "Countertops", pct: 0, subPct: 0 },
        ]}
        renderCardGrid={(cards) => (
          <div data-testid="card-grid">{cards.map((c) => c.key).join(",")}</div>
        )}
      />,
    );

    const text = container.textContent ?? "";
    const scopeIdx = text.indexOf("% Complete by Scope");
    const customIdx = text.indexOf("Custom locations");
    expect(scopeIdx).toBeGreaterThanOrEqual(0);
    expect(customIdx).toBeGreaterThan(scopeIdx);
  });

  it("renders custom locations above common areas in grid view", () => {
    const { container } = renderWithIntl(
      <LevelLocationSections
        buildingKey="NORTH"
        levelKey="2"
        commonAreaCards={[COMMON_CARD]}
        unitCards={[UNIT_CARD]}
        allCards={[COMMON_CARD, UNIT_CARD]}
        renderCardGrid={(cards) => (
          <div data-testid="card-grid">{cards.map((c) => c.key).join(",")}</div>
        )}
      />,
    );

    const text = container.textContent ?? "";
    const customIdx = text.indexOf("Custom locations");
    const commonIdx = text.indexOf("Common areas");
    const unitsIdx = text.indexOf("Units");
    expect(customIdx).toBeGreaterThanOrEqual(0);
    expect(commonIdx).toBeGreaterThan(customIdx);
    expect(unitsIdx).toBeGreaterThan(commonIdx);
    expect(
      screen.getByRole("button", { name: "Add custom location for NORTH 2" }),
    ).toBeInTheDocument();
  });

  it("shows only custom section when a level has no units or common areas yet", () => {
    renderWithIntl(
      <LevelLocationSections
        buildingKey="NORTH"
        levelKey="9"
        commonAreaCards={[]}
        unitCards={[]}
        allCards={[]}
        renderCardGrid={() => <div data-testid="card-grid" />}
      />,
    );
    expect(screen.getByRole("separator", { name: "Custom locations" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add custom location for NORTH 9" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Common areas")).not.toBeInTheDocument();
    expect(screen.queryByText("Units")).not.toBeInTheDocument();
  });
});
