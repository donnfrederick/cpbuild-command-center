import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  InspectionDeficiencyReportSkeleton,
  InspectionPassFailBarListSkeleton,
} from "@/components/reports/InspectionReportBarListSkeletons";

describe("InspectionPassFailBarListSkeleton", () => {
  it("renders busy pass/fail bar list with column headers", () => {
    render(
      <InspectionPassFailBarListSkeleton
        nameColumnLabel="Install Manager"
        ratesColumnLabel="Pass / fail rates"
        loadingLabel="Loading report"
      />
    );

    const region = screen.getByLabelText("Loading report");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Install Manager")).toBeInTheDocument();
    expect(screen.getByText("Pass / fail rates")).toBeInTheDocument();
  });
});

describe("InspectionDeficiencyReportSkeleton", () => {
  it("renders overview skeleton with section headers", () => {
    render(
      <InspectionDeficiencyReportSkeleton
        sectionColumnLabel="Section"
        deficienciesColumnLabel="Deficiencies"
        loadingLabel="Loading deficiencies"
        variant="overview"
      />
    );

    expect(screen.getByLabelText("Loading deficiencies")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Section")).toBeInTheDocument();
    expect(screen.getByText("Deficiencies")).toBeInTheDocument();
  });

  it("renders grouped accordion skeleton without section headers", () => {
    render(
      <InspectionDeficiencyReportSkeleton
        sectionColumnLabel="Section"
        deficienciesColumnLabel="Deficiencies"
        loadingLabel="Loading deficiencies"
        variant="grouped"
      />
    );

    expect(screen.getByLabelText("Loading deficiencies")).toBeInTheDocument();
    expect(screen.queryByText("Section")).not.toBeInTheDocument();
  });
});
