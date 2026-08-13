import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldDailyReportSkeleton } from "@/components/reports/FieldDailyReportSkeleton";

describe("FieldDailyReportSkeleton", () => {
  it("renders a busy status region with the loading label", () => {
    render(<FieldDailyReportSkeleton loadingLabel="Loading…" />);
    expect(screen.getByRole("status", { name: "Loading…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
