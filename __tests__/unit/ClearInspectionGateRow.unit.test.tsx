import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { ClearInspectionGateRow } from "@/components/projects/inspections/ClearInspectionGateRow";
import type { ScopeRow } from "@/components/projects/UnitCards";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock("@/lib/offline/mutation-queue", () => ({
  flushMutationQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/projects/SubcontractorPicker", () => ({
  SubcontractorPicker: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (id: string | null, displayName?: string | null) => void;
  }) => (
    <select
      aria-label="Subcontractor"
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value || null, e.target.value ? "Pro Floor Tile Co" : null)}
    >
      <option value="">Unassigned</option>
      <option value="MOCK-SUB-001">Pro Floor Tile Co</option>
    </select>
  ),
}));

const CLEAR_FORM = {
  id: "form-clear",
  template: {
    id: "form-clear",
    name: "Clear Inspection-COUNTERTOPS",
    description: "",
    status: "published" as const,
    level: "scope" as const,
    category: "CLEAR_INSPECTION" as const,
    scopeTypeCodes: ["TOP"],
    sections: [],
  },
};

const SCOPE = {
  id: "row-top",
  scopeStage: "INSTALL",
  scopeStatus: "IN_PROGRESS",
  unifierSubId: null,
  subScopeInstances: [],
  scopeType: {
    id: "st-top",
    code: "TOP",
    name: "Countertops",
    canonicalScopeType: { code: "TOP", displayName: "Countertops" },
  },
} as unknown as ScopeRow;

describe("ClearInspectionGateRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows subcontractor dropdown when scope has no subcontractor assigned", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ClearInspectionGateRow
          template={CLEAR_FORM.template}
          stored={CLEAR_FORM}
          scope={SCOPE}
          isInstallComplete={false}
          patchScopeRow={vi.fn().mockResolvedValue(true)}
          onStartInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Subcontractor required")).toBeInTheDocument();
    expect(screen.getByLabelText("Subcontractor")).toBeInTheDocument();
    expect(
      screen.getByText(/Requires a scope subcontractor before clearing/i),
    ).toBeInTheDocument();
  });

  it("keeps subcontractor dropdown visible when scope already has a subcontractor", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ClearInspectionGateRow
          template={CLEAR_FORM.template}
          stored={CLEAR_FORM}
          scope={{ ...SCOPE, unifierSubId: "MOCK-SUB-001" }}
          isInstallComplete={true}
          patchScopeRow={vi.fn().mockResolvedValue(true)}
          onStartInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("Subcontractor required")).not.toBeInTheDocument();
    expect(screen.getByText("Subcontractor")).toBeInTheDocument();
    expect(screen.getByLabelText("Subcontractor")).toBeInTheDocument();
  });

  it("saves on change and shows a success toast", async () => {
    const user = userEvent.setup();
    const patchScopeRow = vi.fn().mockResolvedValue(true);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ClearInspectionGateRow
          template={CLEAR_FORM.template}
          stored={CLEAR_FORM}
          scope={SCOPE}
          isInstallComplete={false}
          patchScopeRow={patchScopeRow}
          onStartInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await user.selectOptions(screen.getByLabelText("Subcontractor"), "MOCK-SUB-001");

    await waitFor(() => {
      expect(patchScopeRow).toHaveBeenCalledWith({ unifierSubId: "MOCK-SUB-001" });
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("patches parent scope to INSTALL+COMPLETE before starting inspection", async () => {
    const onStartInspection = vi.fn();
    const patchScopeRow = vi.fn().mockResolvedValue(true);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ClearInspectionGateRow
          template={CLEAR_FORM.template}
          stored={CLEAR_FORM}
          scope={{ ...SCOPE, unifierSubId: "MOCK-SUB-001" }}
          isInstallComplete={false}
          patchScopeRow={patchScopeRow}
          onStartInspection={onStartInspection}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Mark 'Install Complete' & Start Inspection/i }),
    );

    await waitFor(() => {
      expect(patchScopeRow).toHaveBeenCalledWith({
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
      });
      expect(onStartInspection).toHaveBeenCalledWith(CLEAR_FORM);
    });
  });

  it("does not re-patch subcontractor on CTA when picker assign just succeeded", async () => {
    const user = userEvent.setup();
    const onStartInspection = vi.fn();
    const patchScopeRow = vi.fn().mockResolvedValue(true);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ClearInspectionGateRow
          template={CLEAR_FORM.template}
          stored={CLEAR_FORM}
          scope={SCOPE}
          isInstallComplete={false}
          patchScopeRow={patchScopeRow}
          onStartInspection={onStartInspection}
        />
      </NextIntlClientProvider>,
    );

    await user.selectOptions(screen.getByLabelText("Subcontractor"), "MOCK-SUB-001");

    fireEvent.click(
      screen.getByRole("button", { name: /Mark 'Install Complete' & Start Inspection/i }),
    );

    await waitFor(() => {
      expect(onStartInspection).toHaveBeenCalledWith(CLEAR_FORM);
    });

    const subPatches = patchScopeRow.mock.calls.filter(
      (call) => call[0] && "unifierSubId" in (call[0] as object),
    );
    expect(subPatches).toHaveLength(1);
    expect(subPatches[0]?.[0]).toEqual({ unifierSubId: "MOCK-SUB-001" });
  });
});
