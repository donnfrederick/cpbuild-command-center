import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectHubSection } from "@/components/projects/ProjectHubSection";

describe("ProjectHubSection", () => {
  it("renders a section heading and child cards", () => {
    render(
      <ProjectHubSection title="Progress & Inspections">
        <div>Card one</div>
      </ProjectHubSection>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Progress & Inspections" })).toBeInTheDocument();
    expect(screen.getByText("Card one")).toBeInTheDocument();
  });
});
