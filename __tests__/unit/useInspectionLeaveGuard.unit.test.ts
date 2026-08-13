import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInspectionLeaveGuard } from "@/lib/inspections/useInspectionLeaveGuard";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";

vi.mock("@/lib/inspections/inspectionDraftDb", () => ({
  putDraft: vi.fn().mockResolvedValue(undefined),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
}));

import { putDraft, deleteDraft } from "@/lib/inspections/inspectionDraftDb";

const BASE_DRAFT: InspectionDraft = {
  draftKey: "live:scope-1:form-1:v1",
  kind: "live",
  projectId: "p1",
  unitId: "u1",
  scopeRowId: "scope-1",
  formId: "form-1",
  categorySnapshot: "CLEAR_INSPECTION",
  templateSnapshot: {},
  updatedAt: new Date().toISOString(),
  answers: { q1: { choice: "pass" } },
};

describe("useInspectionLeaveGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes immediately when not dirty", () => {
    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => false,
        onConfirmedClose,
      }),
    );

    act(() => {
      result.current.setResumeResolved(true);
      result.current.requestClose();
    });

    expect(onConfirmedClose).toHaveBeenCalledTimes(1);
    expect(result.current.guardOpen).toBe(false);
  });

  it("opens guard sheet when dirty", () => {
    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => true,
        onConfirmedClose,
      }),
    );

    act(() => {
      result.current.setResumeResolved(true);
      result.current.requestClose();
    });

    expect(onConfirmedClose).not.toHaveBeenCalled();
    expect(result.current.guardOpen).toBe(true);
  });

  it("save-and-close persists draft then closes", async () => {
    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => true,
        onConfirmedClose,
      }),
    );

    act(() => {
      result.current.setResumeResolved(true);
      result.current.requestClose();
    });

    await act(async () => {
      await result.current.closeGuardSaveAndClose();
    });

    expect(putDraft).toHaveBeenCalledWith(BASE_DRAFT);
    expect(onConfirmedClose).toHaveBeenCalledTimes(1);
    expect(result.current.guardOpen).toBe(false);
  });

  it("discard deletes draft then closes", async () => {
    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => true,
        onConfirmedClose,
      }),
    );

    await act(async () => {
      await result.current.closeGuardDiscard();
    });

    expect(deleteDraft).toHaveBeenCalledWith(BASE_DRAFT.draftKey);
    expect(onConfirmedClose).toHaveBeenCalledTimes(1);
  });

  it("debounces autosave when dirty and resume resolved", async () => {
    vi.useFakeTimers();
    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => true,
        onConfirmedClose,
      }),
    );

    act(() => {
      result.current.setResumeResolved(true);
    });

    act(() => {
      result.current.scheduleAutosave();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(putDraft).toHaveBeenCalledWith(BASE_DRAFT);
    vi.useRealTimers();
  });

  it("prepareForSubmit awaits in-flight persistDraft", async () => {
    let resolvePut: (() => void) | undefined;
    vi.mocked(putDraft).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePut = resolve;
        }),
    );

    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => true,
        onConfirmedClose,
      }),
    );

    act(() => {
      result.current.setResumeResolved(true);
    });

    let saveFinished = false;
    const savePromise = result.current.closeGuardSaveAndClose().then(() => {
      saveFinished = true;
    });

    await act(async () => {
      await Promise.resolve();
    });

    let prepareFinished = false;
    const preparePromise = result.current.prepareForSubmit().then(() => {
      prepareFinished = true;
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(prepareFinished).toBe(false);

    resolvePut?.();
    await act(async () => {
      await savePromise;
      await preparePromise;
    });
    expect(saveFinished).toBe(true);
    expect(prepareFinished).toBe(true);
  });

  it("prepareForSubmit does not trigger stale autosave deleteDraft cleanup", async () => {
    let resolvePut: (() => void) | undefined;
    vi.mocked(putDraft).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePut = resolve;
        }),
    );

    vi.useFakeTimers();
    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => true,
        onConfirmedClose,
      }),
    );

    act(() => {
      result.current.setResumeResolved(true);
      result.current.scheduleAutosave();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
    });

    const preparePromise = result.current.prepareForSubmit();
    await act(async () => {
      await Promise.resolve();
    });
    expect(deleteDraft).not.toHaveBeenCalled();

    resolvePut?.();
    await act(async () => {
      await preparePromise;
      await Promise.resolve();
    });
    expect(deleteDraft).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("blocks requestClose while submit is in progress", () => {
    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => true,
        isSubmitBlocked: () => true,
        onConfirmedClose,
      }),
    );

    act(() => {
      result.current.setResumeResolved(true);
      result.current.requestClose();
    });

    expect(onConfirmedClose).not.toHaveBeenCalled();
    expect(result.current.guardOpen).toBe(false);
  });

  it("prepareForSubmit resolves when no autosave is in flight", async () => {
    const onConfirmedClose = vi.fn();
    const { result } = renderHook(() =>
      useInspectionLeaveGuard({
        enabled: true,
        draftKey: BASE_DRAFT.draftKey,
        buildDraftRecord: () => BASE_DRAFT,
        isDirty: () => true,
        onConfirmedClose,
      }),
    );

    await act(async () => {
      await result.current.prepareForSubmit();
    });
  });
});
