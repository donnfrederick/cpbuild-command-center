import { describe, it, expect } from "vitest";
import { shouldStartNavigation, isSameRoutePathname } from "@/components/navigation/should-start-navigation";

function clickEvent(overrides: Partial<MouseEvent> & { defaultPrevented?: boolean } = {}) {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as unknown as React.MouseEvent<HTMLAnchorElement>;
}

describe("shouldStartNavigation", () => {
  it("returns true for a plain left click", () => {
    expect(shouldStartNavigation(clickEvent())).toBe(true);
  });

  it("returns false when defaultPrevented", () => {
    expect(shouldStartNavigation(clickEvent({ defaultPrevented: true }))).toBe(false);
  });

  it("returns false for non-primary button", () => {
    expect(shouldStartNavigation(clickEvent({ button: 1 }))).toBe(false);
  });

  it("returns false when modifier keys are pressed", () => {
    expect(shouldStartNavigation(clickEvent({ metaKey: true }))).toBe(false);
    expect(shouldStartNavigation(clickEvent({ ctrlKey: true }))).toBe(false);
    expect(shouldStartNavigation(clickEvent({ shiftKey: true }))).toBe(false);
    expect(shouldStartNavigation(clickEvent({ altKey: true }))).toBe(false);
  });
});

describe("isSameRoutePathname", () => {
  it("matches identical pathnames", () => {
    expect(isSameRoutePathname("/projects", "/projects")).toBe(true);
  });

  it("strips query strings from href", () => {
    expect(isSameRoutePathname("/feedback", "/feedback?open=abc")).toBe(true);
  });

  it("returns false for different routes", () => {
    expect(isSameRoutePathname("/projects", "/feedback")).toBe(false);
  });
});
