import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useInspectionOverlayDraft } from "@/components/projects/inspections/useInspectionOverlayDraft";
import type { StoredForm } from "@/lib/forms/formsApi";

vi.mock("@/lib/inspections/inspectionDraftDb", () => ({
  getDraft: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/inspections/useInspectionLeaveGuard", () => ({
  useInspectionLeaveGuard: () => ({
    setResumeResolved: vi.fn(),
    setPendingMediaNotice: vi.fn(),
    clearDraft: vi.fn().mockResolvedValue(undefined),
    requestClose: vi.fn(),
    scheduleAutosave: vi.fn(),
    pendingMediaNotice: false,
    guardOpen: false,
    closeGuardKeepEditing: vi.fn(),
    closeGuardSaveAndClose: vi.fn(),
    closeGuardDiscard: vi.fn(),
  }),
}));

import { getDraft } from "@/lib/inspections/inspectionDraftDb";

const LIVE_FORM: StoredForm = {
  id: "form-gyp",
  template: {
    id: "form-gyp",
    name: "Gypcrete Moisture Test",
    description: "",
    status: "published",
    level: "unit",
    scopeTypeCodes: [],
    category: "GYPCRETE_MOISTURE_TEST",
    latestVersionId: "ver-1",
    sections: [{ id: "s1", title: "Section", questions: [] }],
  },
};

describe("useInspectionOverlayDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDraft).mockResolvedValue(null);
  });

  it("does not throw when scope is omitted (unit-level Gypcrete)", async () => {
    const { result } = renderHook(() =>
      useInspectionOverlayDraft({
        enabled: true,
        mode: "live",
        template: LIVE_FORM.template,
        projectId: "project-1",
        unitId: "building|L1|N123",
        onClose: vi.fn(),
        liveForm: LIVE_FORM,
      }),
    );

    await waitFor(() => {
      expect(result.current.draftReady).toBe(true);
    });

    expect(getDraft).toHaveBeenCalledWith(
      "live:project-1:unit:building|L1|N123:form-gyp:ver-1",
    );
  });
});
