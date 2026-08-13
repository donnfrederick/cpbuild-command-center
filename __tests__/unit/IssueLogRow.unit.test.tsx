import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, type ComponentProps } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { IssueLogRow } from "@/components/projects/issues/IssueLogRow";
import en from "@/messages/en.json";

const BASE_ISSUE = {
  id: "issue-abc12345",
  issueType: "SUBSTRATE_CONDITION",
  responsibleParty: "CP_BUILD",
  isBlockingWork: true,
  status: "OPEN",
  shortDescription: "Water damage in corridor",
  createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
  createdBy: { id: "u1", name: "Admin", email: "admin@example.com" },
  attachments: [],
  scopeTags: [{ row: { id: "r1", scopeType: { name: "Cabinets" } } }],
  subScopeTags: [],
  _count: { comments: 2 },
};

function renderRow(
  props: Partial<ComponentProps<typeof IssueLogRow>> = {},
) {
  const onView = vi.fn();
  const onResolve = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <IssueLogRow
        issue={BASE_ISSUE}
        variant="log"
        onView={onView}
        onResolve={onResolve}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onView, onResolve };
}

describe("IssueLogRow", () => {
  it("leads with the issue title and tokenized type pill", () => {
    renderRow();
    expect(screen.getByText("Water damage in corridor")).toBeInTheDocument();
    expect(screen.getByText("Substrate Condition")).toHaveClass(
      "issue-log-type-pill--substrate-condition",
    );
    expect(screen.getByText("Blocking")).toBeInTheDocument();
  });

  it("uses split resolve action in log variant", async () => {
    const user = userEvent.setup();
    const { onResolve, onView } = renderRow();
    await user.click(screen.getByRole("button", { name: /Resolve issue/i }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it("shows icon-only edit and resolve actions in unit variant", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderRow({
      variant: "unit",
      onEdit,
      onResolve: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Edit issue" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Resolve issue/i }));
  });

  it("toggles selection in select mode instead of opening detail", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const { onView } = renderRow({
      selectMode: true,
      selected: false,
      onToggleSelect,
      onResolve: undefined,
    });
    await user.click(screen.getByRole("button", { name: /Select issue:/i }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it("hides resolve split action while in select mode", () => {
    renderRow({
      selectMode: true,
      selected: true,
      onToggleSelect: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: /Resolve issue/i })).not.toBeInTheDocument();
  });

  it("sets aria-pressed when selected in select mode", () => {
    renderRow({
      selectMode: true,
      selected: true,
      onToggleSelect: vi.fn(),
    });
    expect(screen.getByRole("button", { name: /Select issue:/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not nest photo buttons inside the row tap target", () => {
    renderRow({
      issue: {
        ...BASE_ISSUE,
        attachments: [
          {
            id: "att-1",
            storageUrl: "https://example.com/photo.jpg",
            mimeType: "image/jpeg",
          },
        ],
      },
    });
    const rowButton = screen.getByRole("button", { name: /View issue:/i });
    expect(rowButton.querySelectorAll("button").length).toBe(0);
    expect(screen.getByRole("button", { name: "View photo 1" })).toBeInTheDocument();
  });

  it("displays multiple responsible parties comma-separated", () => {
    renderRow({
      showResponsible: true,
      issue: {
        ...BASE_ISSUE,
        responsibleParties: ["ELECTRICIAN", "PLUMBER"],
      },
    });
    expect(screen.getByText(/ELECTRICIAN, PLUMBER/)).toBeInTheDocument();
  });
});
