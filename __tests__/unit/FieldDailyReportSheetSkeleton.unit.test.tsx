import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldDailyReportSheetSkeleton } from "@/components/reports/FieldDailyReportSheetSkeleton";

describe("FieldDailyReportSheetSkeleton", () => {
  it("renders a busy status region with the loading label", () => {
    render(<FieldDailyReportSheetSkeleton loadingLabel="Loading…" />);
    expect(screen.getByRole("status", { name: "Loading…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
