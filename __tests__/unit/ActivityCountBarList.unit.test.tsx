import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityCountBarList } from "@/components/reports/ActivityCountBarList";

describe("ActivityCountBarList", () => {
  it("renders rows with counts including zero activity", () => {
    render(
      <ActivityCountBarList
        rows={[
          { id: "1", name: "Alpha Tower", subtitle: "Jane PM", count: 10 },
          { id: "2", name: "Beta Site", subtitle: "", count: 0 },
        ]}
        sort="most"
        onSortToggle={() => {}}
        nameColumnLabel="Project"
        activityColumnLabel="Activity"
        sortActivityAria="Sort by activity"
        countLabel={(count) => String(count)}
      />,
    );

    expect(screen.getByText("Alpha Tower")).toBeInTheDocument();
    expect(screen.getByText("Beta Site")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("calls onSortToggle when activity header is clicked", async () => {
    const user = userEvent.setup();
    const onSortToggle = vi.fn();

    render(
      <ActivityCountBarList
        rows={[
          { id: "1", name: "Alpha Tower", subtitle: "Jane PM", count: 10 },
          { id: "2", name: "Beta Site", subtitle: "", count: 5 },
        ]}
        sort="most"
        onSortToggle={onSortToggle}
        nameColumnLabel="Project"
        activityColumnLabel="Activity"
        sortActivityAria="Sort by activity"
        countLabel={(count) => String(count)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sort by activity" }));
    expect(onSortToggle).toHaveBeenCalledTimes(1);
  });
});
