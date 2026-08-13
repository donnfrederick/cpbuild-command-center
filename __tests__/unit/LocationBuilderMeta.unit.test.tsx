import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LocationBuilderMeta } from "@/components/projects/LocationBuilderMeta";

const MESSAGES = {
  units: {
    locationMetaBuildPhase: "Build phase {phase}",
    locationMetaBuildPhaseShort: "Phase {phase}",
    locationMetaPhaseLabel: "Phase: {phase}",
    locationMetaArea: "Area {area}",
    locationMetaAreaLabel: "Area: {area}",
  },
};

function renderMeta(
  card: { area: string; buildPhase?: string; scopes?: { buildPhase: string }[] },
  props?: {
    variant?: "inline" | "compact";
    muted?: boolean;
    onDark?: boolean;
    includePhase?: boolean;
    includeArea?: boolean;
  },
) {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <LocationBuilderMeta card={card} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("LocationBuilderMeta", () => {
  it("renders nothing when build phase and area are blank or zero", () => {
    const { container } = renderMeta({ area: "", buildPhase: "0" });
    expect(container.querySelector('[data-testid="location-builder-meta"]')).toBeNull();
  });

  it("renders labeled phase and area chips when both are defined", () => {
    renderMeta({ area: "850 SF", buildPhase: "2" });
    expect(screen.getByText("Phase: 2")).toBeDefined();
    expect(screen.getByText("Area: 850 SF")).toBeDefined();
  });

  it("shows full area and phase text in compact grid cards (wraps, no ellipsis)", () => {
    renderMeta(
      { area: "Main Building", buildPhase: "Dumb Dumb Phase" },
      { variant: "compact" },
    );
    const meta = screen.getByTestId("location-builder-meta");
    expect(meta.style.alignItems).toBe("stretch");
    const areaEl = screen.getByText("Area: Main Building");
    expect(areaEl.style.whiteSpace).toBe("normal");
    expect(areaEl.style.width).toBe("100%");
    expect(areaEl.style.textOverflow).not.toBe("ellipsis");
    expect(screen.getByText("Phase: Dumb Dumb Phase")).toBeDefined();
  });

  it("resolves build phase from scopes when card-level value is empty", () => {
    renderMeta({
      area: "900 SF",
      buildPhase: "",
      scopes: [{ buildPhase: "3" }],
    });
    expect(screen.getByText("Phase: 3")).toBeDefined();
    expect(screen.getByText("Area: 900 SF")).toBeDefined();
  });

  it("can render area only when includePhase is false", () => {
    renderMeta({ area: "850 SF", buildPhase: "2" }, { includePhase: false });
    expect(screen.queryByText("Phase: 2")).toBeNull();
    expect(screen.getByText("Area: 850 SF")).toBeDefined();
  });

  it("can render phase only when includeArea is false", () => {
    renderMeta({ area: "850 SF", buildPhase: "2" }, { includeArea: false });
    expect(screen.getByText("Phase: 2")).toBeDefined();
    expect(screen.queryByText("Area: 850 SF")).toBeNull();
  });
});
