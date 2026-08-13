import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ScopeInspectionShieldIcon,
  GRID_SCOPE_TILE_ICON_SIZE,
  COMPACT_TILE_STROKE_WIDTH,
} from "@/components/projects/ScopeInspectionShieldIcon";

describe("ScopeInspectionShieldIcon", () => {
  it("renders inspection abbrev and scope label in the grid tile SVG", () => {
    const { container } = render(
      <ScopeInspectionShieldIcon inspectionLabel="CI" scopeLabel="TOP" color="var(--color-text-inverse)" />,
    );
    expect(screen.getByText("CI")).toBeDefined();
    expect(screen.getByText("TOP")).toBeDefined();
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 40 52");
    expect(container.querySelector('path[fill-opacity="0.24"]')).toBeDefined();
  });

  it("renders compact square SVG for dropdown icons", () => {
    const { container } = render(
      <ScopeInspectionShieldIcon inspectionLabel="FV" color="var(--color-text-inverse)" compact height={17} />,
    );
    expect(screen.getByText("FV")).toBeDefined();
    expect(screen.queryByText("TOP")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("6.5 2.5 27 31");
    expect(container.querySelector("svg")?.getAttribute("height")).toBe("17");
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("17");
  });

  it("uses thin muted stroke and bold label fill on grid tiles", () => {
    const { container } = render(
      <ScopeInspectionShieldIcon
        inspectionLabel="CI"
        color="var(--scope-tile-passed-fg)"
        strokeColor="var(--scope-tile-passed-shield-stroke)"
        fillColor="var(--scope-tile-passed-shield-fill)"
        compact
        width={GRID_SCOPE_TILE_ICON_SIZE}
        height={GRID_SCOPE_TILE_ICON_SIZE}
      />,
    );
    const path = container.querySelector("path");
    const text = container.querySelector("text");
    expect(path?.getAttribute("stroke-width")).toBe(String(COMPACT_TILE_STROKE_WIDTH));
    expect(path?.getAttribute("stroke")).toBe("var(--scope-tile-passed-shield-stroke)");
    expect(path?.getAttribute("fill")).toBe("var(--scope-tile-passed-shield-fill)");
    expect(text?.getAttribute("fill")).toBe("var(--scope-tile-passed-fg)");
    expect(text?.getAttribute("font-size")).toBe("14");
    expect(text?.getAttribute("font-weight")).toBe("800");
    expect(text?.getAttribute("y")).toBe("15.6");
  });

  it("matches Lucide grid tile footprint — square at GRID_SCOPE_TILE_ICON_SIZE", () => {
    const { container } = render(
      <ScopeInspectionShieldIcon
        inspectionLabel="CI"
        color="var(--scope-tile-passed-fg)"
        strokeColor="var(--scope-tile-passed-shield-stroke)"
        fillColor="var(--scope-tile-passed-shield-fill)"
        compact
        width={GRID_SCOPE_TILE_ICON_SIZE}
        height={GRID_SCOPE_TILE_ICON_SIZE}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("height")).toBe(String(GRID_SCOPE_TILE_ICON_SIZE));
    expect(svg?.getAttribute("width")).toBe(String(GRID_SCOPE_TILE_ICON_SIZE));
    expect(svg?.getAttribute("viewBox")).toBe("6.5 2.5 27 31");
  });
});
