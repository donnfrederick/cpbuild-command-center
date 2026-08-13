import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MobileBottomNavSpacer } from "@/components/layout/MobileBottomNavSpacer";

describe("MobileBottomNavSpacer", () => {
  it("reserves in-flow clearance for the fixed mobile bottom nav", () => {
    const { container } = render(<MobileBottomNavSpacer />);
    const spacer = container.querySelector("[data-mobile-bottom-nav-spacer]");
    expect(spacer).toBeTruthy();
    expect(spacer).toHaveClass("mobile-only");
    expect((spacer as HTMLElement).style.height).toContain("--mobile-bottom-nav-clearance");
  });
});
