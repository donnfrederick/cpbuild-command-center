import { describe, it, expect } from "vitest";
import {
  MUTATION_SYNC_ERROR,
  formatHttpMutationError,
  mutationSyncErrorMessageKey,
  mutationSyncErrorMessageValues,
} from "@/lib/offline/mutation-sync-errors";

describe("mutation-sync-errors", () => {
  it("maps known codes to translation keys", () => {
    expect(mutationSyncErrorMessageKey(MUTATION_SYNC_ERROR.BLOB_MISSING)).toBe(
      "queuedItemMutationBlobMissing",
    );
    expect(mutationSyncErrorMessageKey(MUTATION_SYNC_ERROR.UPLOAD_FAILED)).toBe(
      "queuedItemMutationUploadFailed",
    );
  });

  it("formatHttpMutationError encodes status and server message", () => {
    expect(formatHttpMutationError(422)).toBe("mutation:http:422");
    expect(formatHttpMutationError(400, "Invalid request")).toBe(
      "mutation:http:400:Invalid request",
    );
  });

  it("mutationSyncErrorMessageValues parses http detail codes", () => {
    expect(mutationSyncErrorMessageValues("mutation:http:500")).toEqual({ status: "500" });
    expect(
      mutationSyncErrorMessageValues("mutation:http:400:Invalid request"),
    ).toEqual({ status: "400", message: "Invalid request" });
  });
});
