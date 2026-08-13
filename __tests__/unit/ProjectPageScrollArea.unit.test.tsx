import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectPageScrollArea } from "@/components/projects/ProjectPageScrollArea";

describe("ProjectPageScrollArea", () => {
  it("renders a nested scroll root so project pages can scroll inside overflow-hidden main", () => {
    render(
      <ProjectPageScrollArea>
        <p>Overview content</p>
      </ProjectPageScrollArea>
    );

    expect(screen.getByText("Overview content")).toBeInTheDocument();

    const scrollRoot = document.querySelector("[data-project-scroll-root]");
    expect(scrollRoot).not.toBeNull();
    expect(scrollRoot).toHaveStyle({ overflowY: "auto", flex: "1", minHeight: "0px" });
  });
});
