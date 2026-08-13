import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { InspectionBadgeIcon } from "@/components/projects/inspections/InspectionBadgeIcon";

describe("InspectionBadgeIcon", () => {
  it("renders check and x badge variants", () => {
    const { container, rerender } = render(<InspectionBadgeIcon kind="check" />);
    expect(container.querySelector("circle")).not.toBeNull();

    rerender(<InspectionBadgeIcon kind="x" />);
    expect(container.querySelector("circle")).not.toBeNull();

    rerender(<InspectionBadgeIcon kind="neutral" />);
    expect(container.querySelector("circle")).toBeNull();
  });
});
