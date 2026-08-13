import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GypcreteGridDropletIcon } from "@/components/projects/GypcreteGridDropletIcon";

describe("GypcreteGridDropletIcon", () => {
  it("renders with accessible label for not-performed state", () => {
    render(
      <GypcreteGridDropletIcon
        status={null}
        ariaLabel="Gypcrete moisture test not performed"
      />,
    );
    expect(screen.getByLabelText("Gypcrete moisture test not performed")).toBeInTheDocument();
  });
});
