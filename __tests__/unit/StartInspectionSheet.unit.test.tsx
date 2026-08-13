/**
 * Unit tests for StartInspectionSheet — Gypcrete gating and unit-level flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { StartInspectionSheet } from "@/components/projects/inspections/StartInspectionSheet";
import type { ScopeRow } from "@/components/projects/UnitCards";

vi.mock("@/lib/forms/formsApi", () => ({
  listPublishedForms: vi.fn(),
}));

vi.mock("@/lib/inspections/inspection-draft-discovery", () => ({
  listResumableLiveDrafts: vi.fn(),
  draftToStoredForm: vi.fn(),
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock("@/components/projects/SubcontractorPicker", () => ({
  SubcontractorPicker: ({ value }: { value: string | null }) => (
    <div aria-label="Subcontractor">{value ?? "Unassigned"}</div>
  ),
}));

import { listPublishedForms } from "@/lib/forms/formsApi";
import {
  draftToStoredForm,
  listResumableLiveDrafts,
} from "@/lib/inspections/inspection-draft-discovery";

const CAB_SCOPE = {
  id: "row-cab",
  scopeStage: "INSTALL",
  scopeStatus: "IN_PROGRESS",
  unifierSubId: null,
  subScopeInstances: [],
  scopeType: {
    id: "st-cab",
    code: "CAB",
    name: "Cabinets",
    canonicalScopeType: { code: "CAB", displayName: "Cabinets" },
  },
} as unknown as ScopeRow;

const TIL_SCOPE = {
  id: "row-til",
  scopeStage: "INSTALL",
  scopeStatus: "IN_PROGRESS",
  unifierSubId: null,
  subScopeInstances: [],
  scopeType: {
    id: "st-til",
    code: "TIL",
    name: "Tile",
    canonicalScopeType: { code: "TIL", displayName: "Tile" },
  },
} as unknown as ScopeRow;

const GYPCRETE_FORM = {
  id: "form-gyp",
  template: {
    id: "form-gyp",
    name: "Gypcrete Moisture Test",
    description: "",
    status: "published" as const,
    level: "unit" as const,
    category: "GYPCRETE_MOISTURE_TEST" as const,
    scopeTypeCodes: [],
    sections: [],
  },
};

function renderSheet(
  props: Partial<{
    scopes: ScopeRow[];
    unitHasFlooring: boolean;
    onStartFill: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const onStartFill = props.onStartFill ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <StartInspectionSheet
        projectId="proj-1"
        unitId="unit-key"
        scopes={props.scopes ?? [CAB_SCOPE]}
        unitHasFlooring={props.unitHasFlooring ?? false}
        onStartFill={onStartFill}
        onClose={onClose}
      />
    </NextIntlClientProvider>,
  );
  return { onStartFill, onClose };
}

describe("StartInspectionSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPublishedForms).mockResolvedValue({ forms: [GYPCRETE_FORM], isFromCache: false });
    vi.mocked(listResumableLiveDrafts).mockResolvedValue([]);
  });

  it("hides Gypcrete when the unit has no floor-covering scope", async () => {
    renderSheet({ unitHasFlooring: false });

    await waitFor(() => {
      expect(screen.getByText("Clear Inspection")).toBeInTheDocument();
    });
    expect(screen.queryByText("Gypcrete Moisture Test")).not.toBeInTheDocument();
  });

  it("shows Gypcrete and skips scope step when unit has flooring", async () => {
    const user = userEvent.setup();
    renderSheet({ scopes: [CAB_SCOPE, TIL_SCOPE], unitHasFlooring: true });

    await waitFor(() => {
      expect(screen.getByText("Gypcrete Moisture Test")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^Gypcrete Moisture Test$/i }));

    await waitFor(() => {
      expect(screen.getByText("Unit inspection")).toBeInTheDocument();
    });
    expect(screen.queryByText("Cabinets")).not.toBeInTheDocument();
  });

  it("calls onStartFill without scope for unit-level Gypcrete form", async () => {
    const user = userEvent.setup();
    const { onStartFill } = renderSheet({
      scopes: [TIL_SCOPE],
      unitHasFlooring: true,
    });

    await waitFor(() => {
      expect(screen.getByText("Gypcrete Moisture Test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Gypcrete Moisture Test$/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Gypcrete Moisture Test/i }).length).toBeGreaterThan(0);
    });
    const formButtons = screen.getAllByRole("button", { name: /Gypcrete Moisture Test/i });
    await user.click(formButtons[formButtons.length - 1]!);

    await waitFor(() => {
      expect(onStartFill).toHaveBeenCalledWith(GYPCRETE_FORM);
    });
    expect(onStartFill.mock.calls[0][1]).toBeUndefined();
  });

  it("shows Resume draft and calls onStartFill when a live draft exists", async () => {
    const user = userEvent.setup();
    const clearForm = {
      id: "form-clear",
      template: {
        id: "form-clear",
        name: "Clear Inspection Form",
        description: "",
        status: "published" as const,
        level: "scope" as const,
        category: "CLEAR_INSPECTION" as const,
        scopeTypeCodes: ["CAB"],
        sections: [],
      },
    };
    vi.mocked(listPublishedForms).mockResolvedValue({ forms: [clearForm], isFromCache: false });
    vi.mocked(listResumableLiveDrafts).mockResolvedValue([
      {
        draftKey: "live:row-cab:form-clear:latest",
        kind: "live",
        projectId: "proj-1",
        unitId: "unit-key",
        scopeRowId: "row-cab",
        formId: "form-clear",
        categorySnapshot: "CLEAR_INSPECTION",
        templateSnapshot: clearForm.template,
        updatedAt: "2026-06-12T10:00:00.000Z",
      },
    ]);
    vi.mocked(draftToStoredForm).mockReturnValue(clearForm);

    const installCompleteCab = {
      ...CAB_SCOPE,
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      unifierSubId: "sub-cab",
    } as typeof CAB_SCOPE;

    const onStartFillMock = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <StartInspectionSheet
          projectId="proj-1"
          unitId="unit-key"
          scopes={[installCompleteCab]}
          unitHasFlooring={false}
          onStartFill={onStartFillMock}
          onClose={vi.fn()}
          patchScopeRow={vi.fn().mockResolvedValue(true)}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Clear Inspection")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Clear Inspection$/i }));
    await waitFor(() => {
      expect(screen.getByText("Cabinets")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Cabinets$/i }));

    await waitFor(() => {
      expect(screen.getByText("Resume draft")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Resume draft/i }));

    await waitFor(() => {
      expect(onStartFillMock).toHaveBeenCalledWith(clearForm, installCompleteCab);
    });
  });

  it("shows selectable form rows when subcontractor is assigned and install is complete", async () => {
    const user = userEvent.setup();
    const onStartFill = vi.fn();
    const clearForm = {
      id: "form-clear",
      template: {
        id: "form-clear",
        name: "Clear Inspection-TILE",
        description: "",
        status: "published" as const,
        level: "scope" as const,
        category: "CLEAR_INSPECTION" as const,
        scopeTypeCodes: ["TIL"],
        sections: [],
      },
    };
    vi.mocked(listPublishedForms).mockResolvedValue({ forms: [clearForm], isFromCache: false });

    const readyScope = {
      ...TIL_SCOPE,
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      unifierSubId: "MOCK-SUB-001",
    } as typeof TIL_SCOPE;

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <StartInspectionSheet
          projectId="proj-1"
          unitId="unit-key"
          scopes={[readyScope]}
          unitHasFlooring={false}
          onStartFill={onStartFill}
          onClose={vi.fn()}
          patchScopeRow={vi.fn().mockResolvedValue(true)}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Clear Inspection")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Clear Inspection$/i }));
    await waitFor(() => {
      expect(screen.getByText("Tile")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Tile"));

    await waitFor(() => {
      expect(screen.getByText("Clear Inspection-TILE")).toBeInTheDocument();
    });
    expect(screen.queryByText("Subcontractor required")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Clear Inspection-TILE/i }));
    await waitFor(() => {
      expect(onStartFill).toHaveBeenCalledWith(clearForm, readyScope);
    });
  });

  it("locks Clear Inspection scopes without a subcontractor", async () => {
    const user = userEvent.setup();
    const installCompleteNoSub = {
      ...TIL_SCOPE,
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      unifierSubId: null,
      description: "Porcelain Tile",
    } as typeof TIL_SCOPE;

    renderSheet({ scopes: [installCompleteNoSub] });

    await waitFor(() => {
      expect(screen.getByText("Clear Inspection")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Clear Inspection$/i }));

    await waitFor(() => {
      expect(screen.getByText("Requires subcontractor")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^Tile$/i })).not.toBeInTheDocument();
  });

  it("locks Clear Inspection scopes that are not Install · Complete", async () => {
    const user = userEvent.setup();
    const inProgressWithSub = {
      ...TIL_SCOPE,
      scopeStage: "INSTALL",
      scopeStatus: "IN_PROGRESS",
      unifierSubId: "sub-til",
      description: "Floor Tile",
    } as typeof TIL_SCOPE;

    renderSheet({ scopes: [inProgressWithSub] });

    await waitFor(() => {
      expect(screen.getByText("Clear Inspection")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Clear Inspection$/i }));

    await waitFor(() => {
      expect(screen.getByText("Requires Install · Complete")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^Tile$/i })).not.toBeInTheDocument();
  });
});
