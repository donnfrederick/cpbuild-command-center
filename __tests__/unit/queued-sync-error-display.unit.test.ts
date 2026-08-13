import { describe, it, expect } from "vitest";
import { formatQueuedSyncErrorDisplay } from "@/lib/offline/queued-sync-error-display";
import { MUTATION_SYNC_ERROR } from "@/lib/offline/mutation-sync-errors";

describe("formatQueuedSyncErrorDisplay", () => {
  const t = (key: string) => key;

  it("maps blob missing code to panel key", () => {
    expect(formatQueuedSyncErrorDisplay(MUTATION_SYNC_ERROR.BLOB_MISSING, t)).toBe(
      "queuedItemMutationBlobMissing",
    );
  });

  it("returns null for empty error", () => {
    expect(formatQueuedSyncErrorDisplay(undefined, t)).toBeNull();
  });
});
