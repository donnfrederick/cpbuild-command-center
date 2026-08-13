/**
 * Unit tests for SubScopesModal.
 *
 * Covers:
 * - Step 1: single unit type selection (radio-style, Next disabled until selection)
 * - Step 2: scope type multi-select (filtered to selected unit type)
 * - Step 3: per-scope walk-through — qty display, even-split preview, manual validation
 * - Submission: one POST per scope config, correct payloads
 * - Validation: duplicate names, empty names, manual qty total
 * - Error handling: API error shown as toast
 * - onCreated + onClose called on success
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SubScopesModal } from "@/components/projects/SubScopesModal";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));


// ── Fixtures ──────────────────────────────────────────────────────────────────

const UNIT_TYPES = ["1BR", "2BR", "Studio"];

/** ScopeTypeOption fixtures now include qtyPerUnit, qtyVaries, uom. */
const SCOPE_TYPES_BY_UNIT_TYPE = {
  "1BR": [
    { id: "st-cab", code: "CAB", name: "Cabinetry", qtyPerUnit: 45, qtyVaries: false, uom: { code: "LF", name: "Linear Feet" } },
    { id: "st-flr", code: "FLR", name: "Flooring", qtyPerUnit: 120, qtyVaries: false, uom: { code: "SF", name: "Square Feet" } },
  ],
  "2BR": [
    { id: "st-cab", code: "CAB", name: "Cabinetry", qtyPerUnit: 60, qtyVaries: false, uom: { code: "LF", name: "Linear Feet" } },
  ],
  Studio: [
    { id: "st-flr", code: "FLR", name: "Flooring", qtyPerUnit: null, qtyVaries: false, uom: null },
  ],
};

const MESSAGES = {
  units: {
    subScopesModalTitle: "Configure Sub-Scopes",
    subScopesModalSubtitle: "Split a scope into multiple areas to track separately",
    subScopesStep1Title: "Select Unit Type",
    subScopesStep1Desc: "Choose the unit type these sub-scopes will apply to. Only one unit type can be configured at a time.",
    subScopesStep2Title: "Select Scope",
    subScopesStep2Desc: "Choose which scopes to split — only scopes for the selected unit type are shown.",
    subScopesStep3Title: "Define Sub-Scopes",
    subScopesStep3Desc: "Name each sub-scope and choose how to split the quantity.",
    subScopesNameLabel: "Sub-scope name",
    subScopesNamePlaceholder: "e.g. Kitchen Cabinetry",
    subScopesAddAnother: "Add another",
    subScopesRemove: "Remove",
    subScopesDistributionLabel: "Quantity split",
    subScopesDistributionEven: "Even split",
    subScopesDistributionEvenDesc: "Total quantity divided equally across sub-scopes",
    subScopesDistributionManual: "Manual",
    subScopesDistributionManualDesc: "Assign a specific quantity to each sub-scope",
    subScopesQtyLabel: "Qty",
    subScopesBack: "Back",
    subScopesNext: "Next",
    subScopesCreate: "Create Sub-Scopes",
    subScopesCreating: "Creating…",
    subScopesSuccessTitle: "Sub-scopes created",
    subScopesSuccessDesc: "{count} units split across {subScopeCount} sub-scopes",
    subScopesErrorGeneric: "Something went wrong. Please try again.",
    subScopesMinTwo: "Add at least 2 sub-scopes",
    subScopesNameRequired: "Name is required",
    subScopesNameUnique: "Names must be unique",
    subScopesNoUnitTypes: "No unit types found in this project",
    subScopesNoScopes: "No scopes found for this unit type",
    subScopesStepOf: "Step {current} of {total}",
    subScopesScopeOf: "Scope {current} of {total}: {name}",
    subScopesQtyTotal: "Total: {qty} {uom}",
    subScopesQtyVaries: "Qty varies by unit",
    subScopesEvenPreviewExact: "Each sub-scope receives {each} {uom}",
    subScopesEvenPreviewUneven: "First sub-scope: {first} {uom} — others: {rest} {uom}",
    subScopesManualAssigned: "{assigned} / {total} {uom} assigned",
    subScopesManualOver: "Exceeds total by {over} {uom}",
    subScopesManualUnder: "{remaining} {uom} still unassigned",
    subScopesNextScope: "Next Scope",
    subScopesSaveAll: "Save All",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(overrides: Partial<Parameters<typeof SubScopesModal>[0]> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();

  const props = {
    projectId: "proj-1",
    unitTypes: UNIT_TYPES,
    scopeTypesByUnitType: SCOPE_TYPES_BY_UNIT_TYPE,
    onClose,
    onCreated,
    ...overrides,
  };

  render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <SubScopesModal {...props} />
    </NextIntlClientProvider>
  );

  return { onClose, onCreated };
}

/** Click a unit type row (single-select) then click Next. */
function pickUnitType(type: string) {
  fireEvent.click(screen.getByRole("option", { name: new RegExp(`^${type}$`) }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
}

/** Click a scope row then click Next. */
function pickScope(name: string) {
  fireEvent.click(screen.getByRole("option", { name }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SubScopesModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: mount-time fetch for configured pairs returns empty — individual tests
    // override with mockResolvedValueOnce for submission assertions.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ subScopes: [] }),
    });
  });

  describe("Step 1 — Unit type selection (single-select)", () => {
    it("renders all unit types as list options", () => {
      renderModal();
      expect(screen.getByRole("option", { name: /^1BR$/ })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /^2BR$/ })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /^Studio$/ })).toBeInTheDocument();
    });

    it("Next button is disabled before selecting any unit type", () => {
      renderModal();
      expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    });

    it("Next button becomes enabled after selecting one unit type", () => {
      renderModal();
      fireEvent.click(screen.getByRole("option", { name: /^1BR$/ }));
      expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
    });

    it("selecting a different unit type switches selection (radio style)", () => {
      renderModal();
      fireEvent.click(screen.getByRole("option", { name: /^1BR$/ }));
      expect(screen.getByRole("option", { name: /^1BR$/ })).toHaveAttribute("aria-selected", "true");
      fireEvent.click(screen.getByRole("option", { name: /^2BR$/ }));
      expect(screen.getByRole("option", { name: /^1BR$/ })).toHaveAttribute("aria-selected", "false");
      expect(screen.getByRole("option", { name: /^2BR$/ })).toHaveAttribute("aria-selected", "true");
    });

    it("shows empty state when no unit types are provided", () => {
      renderModal({ unitTypes: [] });
      expect(screen.getByText("No unit types found in this project")).toBeInTheDocument();
    });

    it("calls onClose when Cancel is clicked (after slide-out animation)", async () => {
      vi.useFakeTimers();
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      vi.advanceTimersByTime(350);
      expect(onClose).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });
  });

  describe("Step 2 — Scope type selection", () => {
    it("shows only scopes for the selected unit type", () => {
      renderModal();
      pickUnitType("1BR");
      // 1BR has Cabinetry + Flooring
      expect(screen.getByRole("option", { name: "Cabinetry" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Flooring" })).toBeInTheDocument();
    });

    it("shows only one scope for unit type with one scope", () => {
      renderModal();
      pickUnitType("2BR");
      expect(screen.getByRole("option", { name: "Cabinetry" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Flooring" })).not.toBeInTheDocument();
    });

    it("Next is disabled until a scope is selected", () => {
      renderModal();
      pickUnitType("1BR");
      expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    });

    it("Next enabled after selecting a scope", () => {
      renderModal();
      pickUnitType("1BR");
      fireEvent.click(screen.getByRole("option", { name: "Cabinetry" }));
      expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
    });

    it("allows selecting multiple scopes", () => {
      renderModal();
      pickUnitType("1BR");
      fireEvent.click(screen.getByRole("option", { name: "Cabinetry" }));
      fireEvent.click(screen.getByRole("option", { name: "Flooring" }));
      expect(screen.getByRole("option", { name: "Cabinetry" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("option", { name: "Flooring" })).toHaveAttribute("aria-selected", "true");
    });

    it("clicking a selected scope deselects it", () => {
      renderModal();
      pickUnitType("1BR");
      fireEvent.click(screen.getByRole("option", { name: "Cabinetry" }));
      fireEvent.click(screen.getByRole("option", { name: "Cabinetry" }));
      expect(screen.getByRole("option", { name: "Cabinetry" })).toHaveAttribute("aria-selected", "false");
      expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    });

    it("Back returns to step 1", () => {
      renderModal();
      pickUnitType("1BR");
      fireEvent.click(screen.getByRole("button", { name: /back/i }));
      expect(screen.getByRole("option", { name: /^1BR$/ })).toBeInTheDocument();
    });
  });

  describe("Step 3 — Single scope: qty display and even split", () => {
    function goToStep3Single() {
      renderModal();
      pickUnitType("1BR");
      pickScope("Cabinetry"); // qtyPerUnit=45, uom=LF
    }

    it("shows the scope qty from project data", () => {
      goToStep3Single();
      // Label row
      expect(screen.getByText(/Qty per unit \(from project\)/)).toBeInTheDocument();
      // Qty value (rendered as its own element)
      expect(screen.getByText("45")).toBeInTheDocument();
      // UOM code
      expect(screen.getByText("LF")).toBeInTheDocument();
    });

    it("shows even-split preview for clean division (45 ÷ 3 = 15 LF each)", () => {
      goToStep3Single();
      // Add a third sub-scope to get a clean 3-way split: 45/3=15
      fireEvent.click(screen.getByRole("button", { name: /add another/i }));
      expect(screen.getByText(/Each sub-scope receives 15 LF/)).toBeInTheDocument();
    });

    it("shows even-split preview for uneven division (45 ÷ 2 — first gets extra)", () => {
      goToStep3Single();
      // 45 ÷ 2 = 22.5 — not an integer, so divides evenly: each=22.5
      // Actually 45 is integer, 45 % 2 = 1, so uneven: first=23, rest=22
      expect(screen.getByText(/First sub-scope: 23 LF — others: 22 LF/)).toBeInTheDocument();
    });

    it("starts with two empty name inputs", () => {
      goToStep3Single();
      const inputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      expect(inputs).toHaveLength(2);
    });

    it("Remove button is disabled when exactly 2 entries remain", () => {
      goToStep3Single();
      const removeButtons = screen.getAllByRole("button", { name: /remove/i });
      expect(removeButtons[0]).toBeDisabled();
      expect(removeButtons[1]).toBeDisabled();
    });

    it("Add another adds a third entry", () => {
      goToStep3Single();
      fireEvent.click(screen.getByRole("button", { name: /add another/i }));
      expect(screen.getAllByPlaceholderText(/kitchen cabinetry/i)).toHaveLength(3);
    });

    it("shows scope name as heading when only one scope selected", () => {
      goToStep3Single();
      expect(screen.getByText("Cabinetry")).toBeInTheDocument();
    });

    it("does NOT show 'Scope X of N' header for single scope", () => {
      goToStep3Single();
      expect(screen.queryByText(/Scope 1 of 1/)).not.toBeInTheDocument();
    });

    it("shows Not set when qtyPerUnit is null", () => {
      renderModal();
      pickUnitType("Studio");
      pickScope("Flooring"); // qtyPerUnit=null, uom=null
      expect(screen.getByText("Not set")).toBeInTheDocument();
      // "units" should never appear as a fallback UOM label
      expect(screen.queryByText("units")).not.toBeInTheDocument();
    });

    it("Back returns to step 2", () => {
      goToStep3Single();
      fireEvent.click(screen.getByRole("button", { name: /back/i }));
      expect(screen.getByRole("option", { name: "Cabinetry" })).toBeInTheDocument();
    });
  });

  describe("Step 3 — Single scope: manual qty validation", () => {
    function goToStep3Manual() {
      renderModal();
      pickUnitType("1BR");
      pickScope("Cabinetry"); // qtyPerUnit=45 LF
      fireEvent.click(screen.getByRole("button", { name: /manual/i }));
    }

    it("Save button is disabled when manual totals don't match scope qty", () => {
      goToStep3Manual();
      // Default: qty inputs are empty, so total=0, not matching 45
      expect(screen.getByRole("button", { name: /create sub-scopes/i })).toBeDisabled();
    });

    it("shows 'unassigned' status when total is under", () => {
      goToStep3Manual();
      // Qty inputs in the allocation section use placeholder "0"
      const qtyInputs = screen.getAllByPlaceholderText("0");
      fireEvent.change(qtyInputs[0], { target: { value: "20" } });
      fireEvent.change(qtyInputs[1], { target: { value: "10" } });
      // 30 assigned, 15 remaining
      expect(screen.getByText(/15 LF still unassigned/)).toBeInTheDocument();
    });

    it("shows 'exceeds' status when total is over", () => {
      goToStep3Manual();
      const qtyInputs = screen.getAllByPlaceholderText("0");
      fireEvent.change(qtyInputs[0], { target: { value: "30" } });
      fireEvent.change(qtyInputs[1], { target: { value: "20" } });
      // 50 assigned, exceeds by 5
      expect(screen.getByText(/Exceeds total by 5 LF/)).toBeInTheDocument();
    });

    it("Save button is enabled when manual totals match scope qty exactly", () => {
      goToStep3Manual();
      const nameInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(nameInputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(nameInputs[1], { target: { value: "Bathroom" } });
      const qtyInputs = screen.getAllByPlaceholderText("0");
      fireEvent.change(qtyInputs[0], { target: { value: "25" } });
      fireEvent.change(qtyInputs[1], { target: { value: "20" } });
      expect(screen.getByRole("button", { name: /create sub-scopes/i })).not.toBeDisabled();
    });

    it("shows assigned / total status when totals match", () => {
      goToStep3Manual();
      const nameInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(nameInputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(nameInputs[1], { target: { value: "Bathroom" } });
      const qtyInputs = screen.getAllByPlaceholderText("0");
      fireEvent.change(qtyInputs[0], { target: { value: "25" } });
      fireEvent.change(qtyInputs[1], { target: { value: "20" } });
      // Status bar shows "45 / 45 LF assigned"
      expect(screen.getByText(/45 \/ 45 LF assigned/i)).toBeInTheDocument();
      // Qty info row still shows project qty
      expect(screen.getByText("45")).toBeInTheDocument();
    });

    it("Save always enabled when qtyVaries=true (soft warning expected)", () => {
      renderModal({
        scopeTypesByUnitType: {
          "1BR": [
            { id: "st-v", code: "V", name: "Varies", qtyPerUnit: null, qtyVaries: true, uom: { code: "LF", name: "Linear Feet" } },
          ],
        },
        unitTypes: ["1BR"],
      });
      pickUnitType("1BR");
      pickScope("Varies");
      fireEvent.click(screen.getByRole("button", { name: /manual/i }));
      const nameInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(nameInputs[0], { target: { value: "A" } });
      fireEvent.change(nameInputs[1], { target: { value: "B" } });
      // No total enforcement; button should be enabled
      expect(screen.getByRole("button", { name: /create sub-scopes/i })).not.toBeDisabled();
    });
  });

  describe("Step 3 — Multiple scopes: walk-through", () => {
    function goToStep3TwoScopes() {
      renderModal();
      pickUnitType("1BR");
      // Select both Cabinetry and Flooring
      fireEvent.click(screen.getByRole("option", { name: "Cabinetry" }));
      fireEvent.click(screen.getByRole("option", { name: "Flooring" }));
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    }

    it("shows 'Scope 1 of 2: Cabinetry' header on first scope", () => {
      goToStep3TwoScopes();
      expect(screen.getByText(/Scope 1 of 2: Cabinetry/)).toBeInTheDocument();
    });

    it("shows 'Next Scope' button label on the first scope", () => {
      goToStep3TwoScopes();
      expect(screen.getByRole("button", { name: /next scope/i })).toBeInTheDocument();
    });

    it("advancing to scope 2 shows 'Scope 2 of 2: Flooring' header", () => {
      goToStep3TwoScopes();
      const nameInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(nameInputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(nameInputs[1], { target: { value: "Bathroom" } });
      fireEvent.click(screen.getByRole("button", { name: /next scope/i }));
      expect(screen.getByText(/Scope 2 of 2: Flooring/)).toBeInTheDocument();
    });

    it("shows Save All button on the last scope", () => {
      goToStep3TwoScopes();
      const nameInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(nameInputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(nameInputs[1], { target: { value: "Bathroom" } });
      fireEvent.click(screen.getByRole("button", { name: /next scope/i }));
      expect(screen.getByRole("button", { name: /save all/i })).toBeInTheDocument();
    });

    it("Back from scope 2 goes to scope 1 (not step 2)", () => {
      goToStep3TwoScopes();
      const nameInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(nameInputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(nameInputs[1], { target: { value: "Bathroom" } });
      fireEvent.click(screen.getByRole("button", { name: /next scope/i }));
      fireEvent.click(screen.getByRole("button", { name: /back/i }));
      expect(screen.getByText(/Scope 1 of 2: Cabinetry/)).toBeInTheDocument();
    });

    it("each scope gets its own independent name inputs (scope 2 starts blank)", () => {
      goToStep3TwoScopes();
      const nameInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(nameInputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(nameInputs[1], { target: { value: "Bathroom" } });
      fireEvent.click(screen.getByRole("button", { name: /next scope/i }));
      // Scope 2 name inputs should be blank
      const scope2Inputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      expect(scope2Inputs[0]).toHaveValue("");
      expect(scope2Inputs[1]).toHaveValue("");
    });
  });

  describe("Submission — even split, single scope", () => {
    async function submitEven(names = ["Kitchen Cabinetry", "Bathroom Cabinetry"]) {
      const { onCreated, onClose } = renderModal();
      vi.mocked(global.fetch).mockClear(); // clear mount-time fetch call from history
      pickUnitType("1BR");
      pickScope("Cabinetry");

      const inputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(inputs[0], { target: { value: names[0] } });
      fireEvent.change(inputs[1], { target: { value: names[1] } });

      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ rowCount: 5, subScopes: [{}, {}] }), { status: 201 })
      );

      fireEvent.click(screen.getByRole("button", { name: /create sub-scopes/i }));
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());

      return { onCreated, onClose };
    }

    it("POSTs to the correct endpoint with distributionMode=even", async () => {
      await submitEven();
      expect(global.fetch).toHaveBeenCalledOnce();
      const [url, opts] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/projects/proj-1/sub-scopes");
      const body = JSON.parse(opts.body as string) as {
        unitType: string;
        scopeTypeId: string;
        distributionMode: string;
        subScopes: { name: string }[];
      };
      expect(body.unitType).toBe("1BR");
      expect(body.scopeTypeId).toBe("st-cab");
      expect(body.distributionMode).toBe("even");
      expect(body.subScopes).toHaveLength(2);
      expect(body.subScopes[0].name).toBe("Kitchen Cabinetry");
    });

    it("calls onCreated and onClose after success (after slide-out animation)", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { onCreated, onClose } = await submitEven();
      expect(onCreated).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(350);
      expect(onClose).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });
  });

  describe("Submission — two scopes make two separate POST calls", () => {
    it("makes one POST per selected scope with correct payloads", async () => {
      renderModal();
      vi.mocked(global.fetch).mockClear(); // clear mount-time fetch call from history
      pickUnitType("1BR");
      // Select Cabinetry + Flooring
      fireEvent.click(screen.getByRole("option", { name: "Cabinetry" }));
      fireEvent.click(screen.getByRole("option", { name: "Flooring" }));
      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      // Scope 1: Cabinetry
      const cabInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(cabInputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(cabInputs[1], { target: { value: "Bathroom" } });
      fireEvent.click(screen.getByRole("button", { name: /next scope/i }));

      // Scope 2: Flooring
      const flrInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(flrInputs[0], { target: { value: "Living Room" } });
      fireEvent.change(flrInputs[1], { target: { value: "Bedroom" } });

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ rowCount: 3 }), { status: 201 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ rowCount: 4 }), { status: 201 }));

      fireEvent.click(screen.getByRole("button", { name: /save all/i }));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

      const bodies = vi.mocked(global.fetch).mock.calls.map(
        (c) => JSON.parse((c as [string, RequestInit])[1].body as string) as {
          unitType: string;
          scopeTypeId: string;
          subScopes: { name: string }[];
        }
      );
      // Both calls use the same unit type
      expect(bodies[0].unitType).toBe("1BR");
      expect(bodies[1].unitType).toBe("1BR");
      // Each call targets its own scope
      const scopeIds = bodies.map((b) => b.scopeTypeId).sort();
      expect(scopeIds).toEqual(["st-cab", "st-flr"]);
      // Each call has its own sub-scope names
      const cabBody = bodies.find((b) => b.scopeTypeId === "st-cab")!;
      expect(cabBody.subScopes.map((s) => s.name)).toEqual(["Kitchen", "Bathroom"]);
      const flrBody = bodies.find((b) => b.scopeTypeId === "st-flr")!;
      expect(flrBody.subScopes.map((s) => s.name)).toEqual(["Living Room", "Bedroom"]);
    });
  });

  describe("Submission — manual split", () => {
    it("POSTs with qty per sub-scope when distributionMode=manual", async () => {
      renderModal();
      vi.mocked(global.fetch).mockClear(); // clear mount-time fetch call from history
      pickUnitType("1BR");
      pickScope("Cabinetry");

      fireEvent.click(screen.getByRole("button", { name: /manual/i }));

      const nameInputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(nameInputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(nameInputs[1], { target: { value: "Bathroom" } });

      // Must match qtyPerUnit=45
      const qtyInputs = screen.getAllByPlaceholderText("0");
      fireEvent.change(qtyInputs[0], { target: { value: "25" } });
      fireEvent.change(qtyInputs[1], { target: { value: "20" } });

      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ rowCount: 4 }), { status: 201 })
      );

      fireEvent.click(screen.getByRole("button", { name: /create sub-scopes/i }));
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());

      const body = JSON.parse(
        (vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit])[1].body as string
      ) as { distributionMode: string; subScopes: { name: string; qty: number }[] };

      expect(body.distributionMode).toBe("manual");
      expect(body.subScopes[0].qty).toBe(25);
      expect(body.subScopes[1].qty).toBe(20);
    });
  });

  describe("Validation", () => {
    function goToStep3() {
      renderModal();
      vi.mocked(global.fetch).mockClear(); // clear mount-time fetch call from history
      pickUnitType("1BR");
      pickScope("Cabinetry");
    }

    it("does not call fetch when names are empty", async () => {
      goToStep3();
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ rowCount: 1 }), { status: 201 })
      );
      fireEvent.click(screen.getByRole("button", { name: /create sub-scopes/i }));
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("shows error for duplicate names on submit", async () => {
      goToStep3();
      const inputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(inputs[0], { target: { value: "Same Name" } });
      fireEvent.change(inputs[1], { target: { value: "Same Name" } });
      fireEvent.click(screen.getByRole("button", { name: /create sub-scopes/i }));
      expect(global.fetch).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getAllByText(/names must be unique/i).length).toBeGreaterThan(0);
      });
    });
  });

  describe("Error handling", () => {
    it("shows toast error when API returns non-OK response", async () => {
      const { toast } = await import("sonner");
      renderModal();
      vi.mocked(global.fetch).mockClear(); // clear mount-time fetch call from history
      pickUnitType("1BR");
      pickScope("Cabinetry");

      const inputs = screen.getAllByPlaceholderText(/kitchen cabinetry/i);
      fireEvent.change(inputs[0], { target: { value: "Kitchen" } });
      fireEvent.change(inputs[1], { target: { value: "Bathroom" } });

      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Conflict" }), { status: 409 })
      );

      fireEvent.click(screen.getByRole("button", { name: /create sub-scopes/i }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Conflict"));
    });
  });
});
