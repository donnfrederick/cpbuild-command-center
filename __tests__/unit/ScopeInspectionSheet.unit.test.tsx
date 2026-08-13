/**
 * ScopeInspectionSheet — Gypcrete appears on floor-covering scopes only;
 * submission still binds at unit level (see inspection-submission-binding).
 *
 * Also covers: ClearInspectionInstallGateRow admin bypass (FT-0052).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { ScopeInspectionSheet } from "@/components/projects/inspections/ScopeInspectionSheet";
import type { ScopeRow } from "@/components/projects/UnitCards";

vi.mock("@/lib/forms/formsApi", () => ({
  listPublishedForms: vi.fn(),
}));

vi.mock("@/lib/inspections/inspection-draft-discovery", () => ({
  listResumableLiveDrafts: vi.fn().mockResolvedValue([]),
  draftToStoredForm: vi.fn(),
}));

vi.mock("@/lib/offline/mutation-queue", () => ({
  flushMutationQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

import { listPublishedForms } from "@/lib/forms/formsApi";

const CLEAR_FORM = {
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

const TIL_SCOPE = {
  id: "row-til",
  scopeStage: "PRE_INSTALL",
  scopeStatus: "IN_STAGING",
  scopeType: {
    id: "st-til",
    code: "TIL",
    name: "Tile",
    canonicalScopeType: { code: "TIL", displayName: "Tile" },
  },
  subScopeInstances: [],
} as unknown as ScopeRow;

const CAB_SCOPE = {
  ...TIL_SCOPE,
  id: "row-cab",
  scopeType: {
    id: "st-cab",
    code: "CAB",
    name: "Cabinets",
    canonicalScopeType: { code: "CAB", displayName: "Cabinets" },
  },
} as unknown as ScopeRow;

/** Scope at Install · Complete with no subcontractor — used for clear inspection tests. */
const CAB_SCOPE_INSTALL_COMPLETE = {
  ...CAB_SCOPE,
  id: "row-cab-ic",
  scopeStage: "INSTALL",
  scopeStatus: "COMPLETE",
  unifierSubId: null,
} as unknown as ScopeRow;

/** A published scope-level clear inspection form applicable to CAB scopes. */
const CLEAR_INSPECTION_FORM = {
  id: "form-clear",
  template: {
    id: "form-clear",
    name: "Clear Inspection",
    description: "",
    status: "published" as const,
    level: "scope" as const,
    category: "CLEAR_INSPECTION" as const,
    scopeTypeCodes: ["CAB"],
    sections: [],
  },
};

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

describe("ScopeInspectionSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(listPublishedForms).mockResolvedValue({ forms: [GYPCRETE_FORM], isFromCache: false });
  });

  it("shows Gypcrete on flooring scopes in the status hub picker", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ScopeInspectionSheet
          projectId="proj-1"
          unitId="unit-key"
          scope={TIL_SCOPE}
          submissions={[]}
          canManageStatus={true}
          initialTab="picker"
          onClose={() => {}}
          onStartInspection={() => {}}
          onReviewSubmission={() => {}}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Gypcrete Moisture Test").length).toBeGreaterThan(0);
    });
  });

  it("hides Gypcrete on non-flooring scopes", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ScopeInspectionSheet
          projectId="proj-1"
          unitId="unit-key"
          scope={CAB_SCOPE}
          submissions={[]}
          canManageStatus={true}
          initialTab="picker"
          onClose={() => {}}
          onStartInspection={() => {}}
          onReviewSubmission={() => {}}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText("Gypcrete Moisture Test")).not.toBeInTheDocument();
    });
  });

  it("shows form picker row for clear inspection when sub is assigned and install is complete", async () => {
    const onStart = vi.fn();
    vi.mocked(listPublishedForms).mockResolvedValue({
      forms: [CLEAR_FORM],
      isFromCache: false,
    });

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ScopeInspectionSheet
          projectId="proj-1"
          unitId="unit-key"
          scope={{
            ...TIL_SCOPE,
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            unifierSubId: "MOCK-SUB-001",
          }}
          submissions={[]}
          canManageStatus={true}
          initialTab="picker"
          onClose={() => {}}
          onStartInspection={onStart}
          onReviewSubmission={() => {}}
          patchScopeRow={vi.fn().mockResolvedValue(true)}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Clear Inspection-TILE")).toBeInTheDocument();
    });
    expect(screen.queryByText("Subcontractor required")).not.toBeInTheDocument();
    expect(screen.queryByText("Start Inspection")).not.toBeInTheDocument();
  });
});

describe("ClearInspectionInstallGateRow — subcontractor required", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(listPublishedForms).mockResolvedValue({ forms: [CLEAR_INSPECTION_FORM], isFromCache: false });
  });

  it("admin sees subcontractor required when no sub is assigned", async () => {
    const onStartInspection = vi.fn();
    const patchScopeRow = vi.fn().mockResolvedValue(true);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ScopeInspectionSheet
          projectId="proj-1"
          unitId="unit-key"
          scope={CAB_SCOPE_INSTALL_COMPLETE}
          submissions={[]}
          canManageStatus={true}
          isAdmin={true}
          patchScopeRow={patchScopeRow}
          initialTab="picker"
          onClose={() => {}}
          onStartInspection={onStartInspection}
          onReviewSubmission={() => {}}
        />
      </NextIntlClientProvider>,
    );

    const startBtn = await screen.findByText("Start Inspection");
    await userEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText("Subcontractor required")).toBeInTheDocument();
    });
    expect(onStartInspection).not.toHaveBeenCalled();
  });

  it("non-admin sees 'Subcontractor required' when no sub is assigned", async () => {
    const onStartInspection = vi.fn();
    const patchScopeRow = vi.fn().mockResolvedValue(true);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ScopeInspectionSheet
          projectId="proj-1"
          unitId="unit-key"
          scope={CAB_SCOPE_INSTALL_COMPLETE}
          submissions={[]}
          canManageStatus={true}
          isAdmin={false}
          patchScopeRow={patchScopeRow}
          initialTab="picker"
          onClose={() => {}}
          onStartInspection={onStartInspection}
          onReviewSubmission={() => {}}
        />
      </NextIntlClientProvider>,
    );

    const startBtn = await screen.findByText("Start Inspection");
    await userEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText("Subcontractor required")).toBeInTheDocument();
    });
    expect(onStartInspection).not.toHaveBeenCalled();
  });
});
