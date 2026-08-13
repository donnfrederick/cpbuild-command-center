import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InspectionReportTableSkeleton } from "@/components/reports/InspectionReportTableSkeleton";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("InspectionReportTableSkeleton", () => {
  it("renders a busy table skeleton with translated column headers", () => {
    render(
      <InspectionReportTableSkeleton
        showProjectColumn
        showImColumn
        showQuickFilters
        projectColumnLabel="Project"
      />
    );

    const region = screen.getByLabelText("reportLoading");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("reportTableColUnit")).toBeInTheDocument();
    expect(screen.getByText("reportTableInspectionType")).toBeInTheDocument();
  });

  it("omits project column when showProjectColumn is false", () => {
    render(<InspectionReportTableSkeleton showProjectColumn={false} showImColumn={false} />);

    expect(screen.queryByText("Project")).not.toBeInTheDocument();
    expect(screen.getByText("reportTableColUnit")).toBeInTheDocument();
  });
});
