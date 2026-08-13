import { describe, it, expect, beforeEach } from "vitest";
import {
  clearOfflineUploadProgress,
  getOfflineUploadProgressSnapshot,
  patchOfflineUploadProgress,
  queuedUploadRowStatus,
  resetOfflineUploadProgressForTests,
} from "@/lib/offline/offline-upload-progress";

describe("offline-upload-progress", () => {
  beforeEach(() => {
    resetOfflineUploadProgressForTests();
  });

  it("queuedUploadRowStatus marks current and pending rows during active sync", () => {
    patchOfflineUploadProgress({
      active: true,
      kind: "mutation",
      phase: "request",
      done: 1,
      total: 3,
      currentItemId: "m-2",
      currentType: "unit-status",
    });

    const progress = getOfflineUploadProgressSnapshot();
    expect(queuedUploadRowStatus("m-2", progress)).toBe("uploading");
    expect(queuedUploadRowStatus("m-3", progress)).toBe("pending");
    expect(queuedUploadRowStatus("m-1", progress)).toBe("pending");
  });

  it("clearOfflineUploadProgress resets to idle", () => {
    patchOfflineUploadProgress({
      active: true,
      kind: "mutation",
      phase: "media",
      done: 0,
      total: 2,
      currentItemId: "x",
      currentType: "create-issue",
    });
    clearOfflineUploadProgress();
    expect(getOfflineUploadProgressSnapshot().active).toBe(false);
    expect(queuedUploadRowStatus("x", getOfflineUploadProgressSnapshot())).toBe("idle");
  });
});
