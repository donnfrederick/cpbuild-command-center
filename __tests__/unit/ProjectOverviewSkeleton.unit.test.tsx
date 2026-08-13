import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProjectOverviewSkeleton } from "@/components/projects/ProjectOverviewSkeleton";

function countPulseSkeletons(container: HTMLElement): number {
  return container.querySelectorAll(".animate-pulse").length;
}

describe("ProjectOverviewSkeleton", () => {
  it("renders summary, hub cards, and stats skeleton blocks", () => {
    const { container } = render(
      <ProjectOverviewSkeleton loadingLabel="Loading project overview…" />,
    );

    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(container.querySelector("[role='status']")).toBeTruthy();
    expect(container.querySelector("[data-project-scroll-root]")).toBeTruthy();
    expect(countPulseSkeletons(container)).toBeGreaterThan(25);
  });

  it("includes assignment grid using project summary tokens", () => {
    const { container } = render(<ProjectOverviewSkeleton />);
    const assignmentGrid = container.querySelector(
      '[style*="--project-summary-assignment-bg"]',
    );
    expect(assignmentGrid).toBeTruthy();
  });

  it("renders three clear-inspection stat placeholders", () => {
    const { container } = render(<ProjectOverviewSkeleton />);
    const grid = container.querySelector('[style*="grid-template-columns: repeat(3"]');
    expect(grid?.children.length).toBe(3);
  });
});
