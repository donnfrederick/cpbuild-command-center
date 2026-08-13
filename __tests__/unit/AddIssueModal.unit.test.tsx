import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddIssueModal } from "@/components/projects/AddIssueModal";
import messages from "@/messages/en.json";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/components/ui/DictationButton", () => ({
  DictationButton: () => <button type="button" aria-label="Dictate" />,
}));

vi.mock("@/lib/issues/use-issue-catalog", () => ({
  useIssueCatalog: () => ({
    issueTypes: [
      { code: "SUBSTRATE_CONDITION", displayName: "Substrate Condition", requiresVisual: false },
      { code: "MISSING_MATERIALS", displayName: "Missing Materials", requiresVisual: false },
      { code: "OTHER", displayName: "Other", requiresVisual: false },
    ],
    responsibleParties: [
      { code: "ELECTRICIAN", displayName: "Electrician" },
      { code: "PLUMBER", displayName: "Plumber" },
      { code: "CP_BUILD", displayName: "CP Build" },
    ],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  resolveIssueTypeLabel: (code: string, types: Array<{ code: string; displayName: string }>) =>
    types.find((t) => t.code === code)?.displayName ?? code,
  resolvePartyLabel: (code: string, parties: Array<{ code: string; displayName: string }>) =>
    parties.find((p) => p.code === code)?.displayName ?? code,
  issueTypeRequiresVisual: () => false,
}));

const UNIT_CONTEXT = {
  unitKey: "N101",
  building: "Building A",
  level: "Level 1",
  unit: "101",
  unitRef: "Building A|Level 1|101",
};

const MULTI_SCOPES = [
  { id: "row-1", name: "Vinyl Flooring", uom: { code: "SF", name: "Square Feet" } },
  { id: "row-2", name: "Kitchen Cabinetry", uom: { code: "LF", name: "Linear Feet" } },
];

async function openIssueForm(): Promise<void> {
  fireEvent.click(screen.getAllByRole("button", { name: /blocking/i })[0]);
  await screen.findByPlaceholderText("e.g. Water damage behind cabinet panel");
}

function renderMultiScopeModal(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddIssueModal
        projectId="project-1"
        unitContext={UNIT_CONTEXT}
        scopes={MULTI_SCOPES}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

function scopeButton(name: string) {
  return screen.getByRole("button", { name: new RegExp(name, "i") });
}

function renderModal(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddIssueModal
        projectId="project-1"
        unitContext={UNIT_CONTEXT}
        scopes={[{ id: "row-1", name: "Cabinetry" }]}
        defaultRowId="row-1"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("AddIssueModal", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("shows the required title field without automatically opening the keyboard", async () => {
    renderModal();

    fireEvent.click(screen.getAllByRole("button", { name: /blocking/i })[0]);

    const titleInput = await screen.findByPlaceholderText("e.g. Water damage behind cabinet panel");
    expect(titleInput).toBeVisible();
    expect(document.activeElement).not.toBe(titleInput);
  });

  it("uses elevated z-index stacking when elevatedStacking is true", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddIssueModal
          projectId="project-1"
          unitContext={UNIT_CONTEXT}
          scopes={[{ id: "row-1", name: "Cabinetry" }]}
          defaultRowId="row-1"
          elevatedStacking
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(document.querySelector(".aim-backdrop.aim-elevated")).not.toBeNull();
  });

  it("hides empty building and level chips for custom site locations", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddIssueModal
          projectId="project-1"
          unitContext={{
            unitKey: "Parking Lot East",
            building: "",
            level: "",
            unit: "Parking Lot East",
            unitRef: "@custom|loc-1|Parking Lot East",
          }}
          scopes={[]}
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Parking Lot East")).toBeInTheDocument();
    expect(screen.queryByText(/Level/i)).not.toBeInTheDocument();
  });

  it("allows selecting multiple responsible parties", async () => {
    renderModal();

    fireEvent.click(screen.getAllByRole("button", { name: /blocking/i })[0]);

    const titleInput = await screen.findByPlaceholderText("e.g. Water damage behind cabinet panel");
    fireEvent.change(titleInput, { target: { value: "Leak near panel" } });

    fireEvent.click(screen.getByRole("button", { name: "Electrician" }));
    fireEvent.click(screen.getByRole("button", { name: "Plumber" }));

    expect(screen.getByRole("button", { name: "Electrician" })).toHaveStyle({
      backgroundColor: "var(--primary-500)",
    });
    expect(screen.getByRole("button", { name: "Plumber" })).toHaveStyle({
      backgroundColor: "var(--primary-500)",
    });
  });

  it("shows missing-material fields with scope UOM when Missing Materials is selected", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddIssueModal
          projectId="project-1"
          unitContext={UNIT_CONTEXT}
          scopes={[{ id: "row-1", name: "Countertops", uom: { code: "SF", name: "Square Feet" } }]}
          defaultRowId="row-1"
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /blocking/i })[0]);
    const titleInput = await screen.findByPlaceholderText("e.g. Water damage behind cabinet panel");
    fireEvent.change(titleInput, { target: { value: "Missing countertop" } });
    fireEvent.click(screen.getByRole("button", { name: "Missing Materials" }));

    expect(screen.getByText("Describe the missing material and how much is missing.")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit of measure")).toHaveTextContent("SF");
    expect(screen.getByPlaceholderText("e.g. White shaker upper cabinet doors")).toBeInTheDocument();
  });

  it("shows alert dialog and clears scopes when Missing Materials is chosen with multiple scopes selected", async () => {
    renderMultiScopeModal();
    await openIssueForm();

    fireEvent.click(scopeButton("Vinyl Flooring"));
    fireEvent.click(scopeButton("Kitchen Cabinetry"));
    expect(scopeButton("Vinyl Flooring")).toHaveStyle({ backgroundColor: "var(--primary-50)" });
    expect(scopeButton("Kitchen Cabinetry")).toHaveStyle({ backgroundColor: "var(--primary-50)" });

    const titleInput = screen.getByPlaceholderText("e.g. Water damage behind cabinet panel");
    fireEvent.change(titleInput, { target: { value: "Missing materials" } });
    fireEvent.click(screen.getByRole("button", { name: "Missing Materials" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("One scope per missing-material report")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(scopeButton("Vinyl Flooring")).not.toHaveStyle({ backgroundColor: "var(--primary-50)" });
    expect(scopeButton("Kitchen Cabinetry")).not.toHaveStyle({ backgroundColor: "var(--primary-50)" });
    expect(screen.getByRole("alert")).toHaveTextContent("Select exactly one scope");
  });

  it("uses single-select scopes for Missing Materials after alert is dismissed", async () => {
    renderMultiScopeModal();
    await openIssueForm();

    fireEvent.click(scopeButton("Vinyl Flooring"));
    fireEvent.click(scopeButton("Kitchen Cabinetry"));

    const titleInput = screen.getByPlaceholderText("e.g. Water damage behind cabinet panel");
    fireEvent.change(titleInput, { target: { value: "Missing materials" } });
    fireEvent.click(screen.getByRole("button", { name: "Missing Materials" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    fireEvent.click(scopeButton("Vinyl Flooring"));
    expect(scopeButton("Vinyl Flooring")).toHaveStyle({ backgroundColor: "var(--primary-50)" });
    expect(screen.getByLabelText("Unit of measure")).toHaveTextContent("SF");

    fireEvent.click(scopeButton("Kitchen Cabinetry"));
    expect(scopeButton("Kitchen Cabinetry")).toHaveStyle({ backgroundColor: "var(--primary-50)" });
    expect(scopeButton("Vinyl Flooring")).not.toHaveStyle({ backgroundColor: "var(--primary-50)" });
    expect(screen.getByLabelText("Unit of measure")).toHaveTextContent("LF");
  });

  it("disables submit until exactly one scope is selected for Missing Materials", async () => {
    renderMultiScopeModal();
    await openIssueForm();

    fireEvent.click(scopeButton("Vinyl Flooring"));
    fireEvent.click(scopeButton("Kitchen Cabinetry"));

    const titleInput = screen.getByPlaceholderText("e.g. Water damage behind cabinet panel");
    fireEvent.change(titleInput, { target: { value: "Missing tile" } });
    fireEvent.click(screen.getByRole("button", { name: "Missing Materials" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    fireEvent.click(screen.getByRole("button", { name: "Electrician" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. White shaker upper cabinet doors"), {
      target: { value: "Tile cartons" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter quantity"), {
      target: { value: "4" },
    });

    expect(screen.getByRole("button", { name: "Report Issue" })).toBeDisabled();

    fireEvent.click(scopeButton("Vinyl Flooring"));
    expect(screen.getByRole("button", { name: "Report Issue" })).not.toBeDisabled();
  });

  it("restores multi-select scopes when switching away from Missing Materials", async () => {
    renderMultiScopeModal();
    await openIssueForm();

    fireEvent.click(scopeButton("Vinyl Flooring"));
    fireEvent.click(scopeButton("Kitchen Cabinetry"));

    const titleInput = screen.getByPlaceholderText("e.g. Water damage behind cabinet panel");
    fireEvent.change(titleInput, { target: { value: "Issue title" } });
    fireEvent.click(screen.getByRole("button", { name: "Missing Materials" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    fireEvent.click(screen.getByRole("button", { name: "Substrate Condition" }));
    fireEvent.click(scopeButton("Vinyl Flooring"));
    fireEvent.click(scopeButton("Kitchen Cabinetry"));

    expect(scopeButton("Vinyl Flooring")).toHaveStyle({ backgroundColor: "var(--primary-50)" });
    expect(scopeButton("Kitchen Cabinetry")).toHaveStyle({ backgroundColor: "var(--primary-50)" });
  });
});
