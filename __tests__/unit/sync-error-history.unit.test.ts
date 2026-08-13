import { describe, expect, it } from "vitest";
import {
  latestSyncError,
  sortSyncErrorsLatestFirst,
  terminalSyncErrorKind,
  type SyncErrorAttempt,
} from "@/lib/inspections/sync-error-history";

const threeAttemptFixture: SyncErrorAttempt[] = [
  {
    attempt: 1,
    message: "calibratedAgainstSubmissionId must be a valid cuid",
    httpStatus: 422,
    errorKind: "retriable",
    recordedAt: "2026-06-25T10:00:00.000Z",
  },
  {
    attempt: 2,
    message: "HTTP 500: Internal Server Error",
    httpStatus: 500,
    errorKind: "retriable",
    recordedAt: "2026-06-25T10:05:00.000Z",
  },
  {
    attempt: 3,
    message: "Could not reach the server after 3 tries.",
    errorKind: "exhausted",
    recordedAt: "2026-06-25T10:10:00.000Z",
  },
];

describe("sortSyncErrorsLatestFirst()", () => {
  it("orders attempts by attempt number descending", () => {
    const sorted = sortSyncErrorsLatestFirst(threeAttemptFixture);
    expect(sorted.map((entry) => entry.attempt)).toEqual([3, 2, 1]);
  });
});

describe("latestSyncError()", () => {
  it("returns the highest attempt entry", () => {
    expect(latestSyncError(threeAttemptFixture)?.attempt).toBe(3);
  });
});

describe("terminalSyncErrorKind()", () => {
  it("returns exhausted when latest entry is exhausted", () => {
    expect(terminalSyncErrorKind(threeAttemptFixture)).toBe("exhausted");
  });

  it("returns rejected for auth/rejected latest kinds", () => {
    expect(
      terminalSyncErrorKind([
        {
          attempt: 1,
          message: "Unauthorized",
          httpStatus: 401,
          errorKind: "auth",
          recordedAt: "2026-06-25T10:00:00.000Z",
        },
      ]),
    ).toBe("rejected");
  });
});
