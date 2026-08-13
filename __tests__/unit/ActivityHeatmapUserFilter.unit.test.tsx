import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { ActivityHeatmapUserFilter } from "@/components/reports/ActivityHeatmapUserFilter";

const MESSAGES = {
  activityHeatmap: {
    allTeamMembers: "All team members",
    membersSelectedCount: "{count} selected",
    teamMembers: "Team members",
    clearTeamMemberFilter: "Clear team member filter",
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

const ACTORS = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Bob" },
];

describe("ActivityHeatmapUserFilter", () => {
  it("shows all team members label when none selected", () => {
    render(
      <Wrapper>
        <ActivityHeatmapUserFilter
          actors={ACTORS}
          selectedUserIds={[]}
          onChange={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText("All team members")).toBeInTheDocument();
  });

  it("opens dropdown and toggles a team member", () => {
    const onChange = vi.fn();
    render(
      <Wrapper>
        <ActivityHeatmapUserFilter
          actors={ACTORS}
          selectedUserIds={[]}
          onChange={onChange}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByLabelText("Team members"));
    fireEvent.click(screen.getByLabelText("Alice"));

    expect(onChange).toHaveBeenCalledWith(["u1"]);
  });

  it("clears selection with the X button", () => {
    const onChange = vi.fn();
    render(
      <Wrapper>
        <ActivityHeatmapUserFilter
          actors={ACTORS}
          selectedUserIds={["u1"]}
          onChange={onChange}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByLabelText("Clear team member filter"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
