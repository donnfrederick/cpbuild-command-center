import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { RouteAnnouncer } from "@/components/shared/RouteAnnouncer";

const mockFocus = vi.fn();
const mockQuerySelector = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

describe("RouteAnnouncer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.querySelector = mockQuerySelector;
  });

  it("renders nothing", () => {
    mockQuerySelector.mockReturnValue(null);
    const { container } = render(<RouteAnnouncer />);
    expect(container.firstChild).toBeNull();
  });

  it("focuses h1 when present", () => {
    const heading = document.createElement("h1");
    heading.focus = mockFocus;
    const setAttributeSpy = vi.spyOn(heading, "setAttribute");
    const removeAttributeSpy = vi.spyOn(heading, "removeAttribute");
    const classListAddSpy = vi.spyOn(heading.classList, "add");
    const classListRemoveSpy = vi.spyOn(heading.classList, "remove");
    mockQuerySelector.mockReturnValue(heading);

    render(<RouteAnnouncer />);
    expect(mockFocus).toHaveBeenCalled();
    // tabindex and no-focus-ring are set only for programmatic focus, then removed.
    expect(setAttributeSpy).toHaveBeenCalledWith("tabindex", "-1");
    expect(removeAttributeSpy).toHaveBeenCalledWith("tabindex");
    expect(heading.getAttribute("tabindex")).toBeNull();
    expect(classListAddSpy).toHaveBeenCalledWith("no-focus-ring");
    expect(classListRemoveSpy).toHaveBeenCalledWith("no-focus-ring");
    expect(heading.classList.contains("no-focus-ring")).toBe(false);
  });
});
