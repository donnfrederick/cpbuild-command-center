import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityListCountSummary } from "@/components/shared/ActivityListCountSummary";

describe("ActivityListCountSummary", () => {
  it("renders the label when total > 0", () => {
    render(
      <ActivityListCountSummary filtered={5} total={5} label="5 events" />,
    );
    expect(screen.getByTestId("activity-list-count")).toHaveTextContent("5 events");
  });

  it("returns null when total is 0", () => {
    const { container } = render(
      <ActivityListCountSummary filtered={0} total={0} label="0 events" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("uses status role for screen readers", () => {
    render(
      <ActivityListCountSummary filtered={2} total={10} label="2 of 10 events" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 of 10 events");
  });
});
