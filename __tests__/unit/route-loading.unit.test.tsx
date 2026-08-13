import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import UsersLoading from "@/app/[locale]/(dashboard)/users/loading";
import ProjectsLoading from "@/app/[locale]/(dashboard)/projects/loading";
import MorningBriefingLoading from "@/app/[locale]/(dashboard)/admin/morning-briefing/loading";
import FeedbackLoading from "@/app/[locale]/(dashboard)/feedback/loading";
import StatusLoading from "@/app/[locale]/(dashboard)/admin/status/loading";
import UnitsLoading from "@/app/[locale]/(project)/projects/[id]/units/loading";
import DashboardGroupLoading from "@/app/[locale]/(dashboard)/loading";
import { ProjectOverviewSkeleton } from "@/components/projects/ProjectOverviewSkeleton";

/** Skeleton root uses Tailwind `animate-pulse`. */
function countPulseSkeletons(container: HTMLElement): number {
  return container.querySelectorAll(".animate-pulse").length;
}

describe("UsersLoading", () => {
  it("renders page header skeletons and two member cards", () => {
    const { container } = render(<UsersLoading />);
    // Two CardSkeleton blocks (members + pending invites), each with header + rows
    expect(countPulseSkeletons(container)).toBeGreaterThan(20);
  });
});

describe("ProjectsLoading", () => {
  it("shows projects title, disabled controls, and table column headers", () => {
    render(<ProjectsLoading />);

    expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument();
    expect(
      screen.getByText("All active and historical construction projects."),
    ).toBeInTheDocument();

    const addBtn = screen.getByRole("button", { name: "Add project" });
    expect(addBtn).toBeDisabled();

    const search = screen.getByPlaceholderText("Search by name, location, Unifier #...");
    expect(search).toBeDisabled();

    expect(screen.getByRole("button", { name: "Filters" })).toBeDisabled();

    expect(screen.getByText("Project Name")).toBeInTheDocument();
    expect(screen.getByText("Site Location")).toBeInTheDocument();
    expect(screen.getByText("Install Manager")).toBeInTheDocument();
  });

  it("renders skeleton rows in the table body", () => {
    const { container } = render(<ProjectsLoading />);
    expect(countPulseSkeletons(container)).toBeGreaterThan(30);
  });
});

describe("MorningBriefingLoading", () => {
  it("renders tab bar and section skeleton blocks", () => {
    const { container } = render(<MorningBriefingLoading />);
    expect(countPulseSkeletons(container)).toBeGreaterThan(25);
  });
});

describe("FeedbackLoading", () => {
  it("renders filter chip row and five feedback card skeletons", () => {
    const { container } = render(<FeedbackLoading />);
    // 5 cards × ~6 skeletons + header + filter chips
    expect(countPulseSkeletons(container)).toBeGreaterThanOrEqual(30);
  });
});

describe("StatusLoading", () => {
  it("renders header row and four status card skeletons", () => {
    const { container } = render(<StatusLoading />);
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid).toBeTruthy();
    expect(grid?.children.length).toBe(4);
    expect(countPulseSkeletons(container)).toBeGreaterThan(30);
  });
});

describe("UnitsLoading", () => {
  it("renders toolbar skeletons and five level card rows", () => {
    const { container } = render(<UnitsLoading />);

    expect(container.querySelector(".units-loading-toolbar")).toBeTruthy();
    const levelCards = container.querySelectorAll('[style*="--level-card-collapsed-bg"]');
    expect(levelCards.length).toBe(5);

    expect(countPulseSkeletons(container)).toBeGreaterThan(20);
  });
});

describe("DashboardGroupLoading", () => {
  it("renders generic page skeleton pulses", () => {
    const { container } = render(<DashboardGroupLoading />);
    expect(countPulseSkeletons(container)).toBeGreaterThan(10);
  });
});

describe("ProjectOverviewSkeleton route loading", () => {
  it("renders overview-specific skeleton pulses and scroll root", () => {
    const { container } = render(<ProjectOverviewSkeleton loadingLabel="Loading project overview…" />);
    expect(container.querySelector("[data-project-scroll-root]")).toBeTruthy();
    expect(countPulseSkeletons(container)).toBeGreaterThan(25);
  });
});
