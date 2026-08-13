import { describe, expect, it } from "vitest";
import {
  isTransientFetchError,
  isTransientSyncErrorMessage,
} from "@/lib/inspections/sync-network-errors";

describe("sync-network-errors", () => {
  it("isTransientSyncErrorMessage matches service worker offline failures", () => {
    expect(
      isTransientSyncErrorMessage("Response served by service worker is an error"),
    ).toBe(true);
    expect(isTransientSyncErrorMessage("Failed to fetch")).toBe(true);
    expect(isTransientSyncErrorMessage("HTTP 422 invalid id")).toBe(false);
  });

  it("isTransientFetchError wraps Error messages", () => {
    expect(
      isTransientFetchError(new Error("Response served by service worker is an error")),
    ).toBe(true);
    expect(isTransientFetchError("not an error")).toBe(false);
  });
});
