import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReportsActivityLayout from "@/app/[locale]/(dashboard)/reports/activity/layout";

vi.mock("@/components/reports/ActivityReportTabs", () => ({
  ActivityReportTabs: () => <div data-testid="activity-tabs" />,
}));

describe("ReportsActivityLayout", () => {
  it("gives tab content flex height so the activity log fills the tab pane", () => {
    render(
      <ReportsActivityLayout>
        <div data-testid="tab-content">Activity log</div>
      </ReportsActivityLayout>,
    );

    const content = screen.getByTestId("tab-content");
    const wrapper = content.parentElement;
    const outer = wrapper?.parentElement;

    expect(outer).toHaveStyle({ flex: "1 1 0%", display: "flex", minHeight: "0px" });
    expect(wrapper).toHaveStyle({
      flex: "1 1 0%",
      minHeight: "0px",
      position: "relative",
      display: "flex",
      overflow: "auto",
    });
  });
});
