import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  APPEND_ROWS_BATCH_SIZE,
  AppendRowsCancelledError,
  appendProjectRowsInBatches,
  revertAppendedRowsInBatches,
  REVERT_ROWS_BATCH_SIZE,
} from "@/lib/field-tracker-append-rows";

function makeRow(n: number): Record<string, string> {
  return { Building: String(n), Unit: String(100 + n) };
}

describe("appendProjectRowsInBatches", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { rows: Record<string, string>[] };
        return {
          ok: true,
          json: async () => ({
            added: body.rows.length,
            skipped: 0,
            addedRowIds: body.rows.map((_, i) => `row-${i}`),
            unlinkedScopeTypes: [],
          }),
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a single batch when rows fit in one chunk", async () => {
    const rows = [makeRow(1), makeRow(2)];
    const result = await appendProjectRowsInBatches({
      projectId: "proj-1",
      rows,
      source: "upload",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.added).toBe(2);
    expect(result.addedRowIds).toEqual(["row-0", "row-1"]);
  });

  it("splits large uploads into batches of APPEND_ROWS_BATCH_SIZE", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => makeRow(i));
    const onProgress = vi.fn();

    const result = await appendProjectRowsInBatches({
      projectId: "proj-1",
      rows,
      source: "upload",
      onProgress,
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.added).toBe(250);
    expect(result.addedRowIds).toHaveLength(250);
    expect(onProgress).toHaveBeenCalledWith({ phase: "uploading", completed: 250, total: 250 });
  });

  it("stops after the current batch when cancelled and returns partial row ids", async () => {
    let batch = 0;
    let cancelled = false;
    vi.mocked(fetch).mockImplementation(async (_url: string, init?: RequestInit) => {
      batch += 1;
      const body = JSON.parse(String(init?.body)) as { rows: Record<string, string>[] };
      const response = {
        ok: true,
        json: async () => ({
          added: body.rows.length,
          skipped: 0,
          addedRowIds: body.rows.map((_, i) => `batch-${batch}-row-${i}`),
          unlinkedScopeTypes: [],
        }),
      } as Response;
      if (batch === 1) cancelled = true;
      return response;
    });

    const rows = Array.from({ length: 250 }, (_, i) => makeRow(i));

    await expect(
      appendProjectRowsInBatches({
        projectId: "proj-1",
        rows,
        source: "upload",
        isCancelled: () => cancelled,
      }),
    ).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof AppendRowsCancelledError)) return false;
      expect(err.addedRowIds).toHaveLength(APPEND_ROWS_BATCH_SIZE);
      return true;
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when a batch fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server error" }),
    } as Response);

    await expect(
      appendProjectRowsInBatches({
        projectId: "proj-1",
        rows: [makeRow(1)],
        source: "paste",
      }),
    ).rejects.toThrow("Server error");
  });

  it("deduplicates unlinked scope types across batches by rawCode", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          added: APPEND_ROWS_BATCH_SIZE,
          skipped: 0,
          addedRowIds: [],
          unlinkedScopeTypes: [{ id: "a", rawCode: "SCOPE-A" }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          added: 1,
          skipped: 0,
          addedRowIds: [],
          unlinkedScopeTypes: [
            { id: "a", rawCode: "SCOPE-A" },
            { id: "b", rawCode: "SCOPE-B" },
          ],
        }),
      } as Response);

    const rows = Array.from({ length: APPEND_ROWS_BATCH_SIZE + 1 }, (_, i) => makeRow(i));
    const result = await appendProjectRowsInBatches({
      projectId: "proj-1",
      rows,
      source: "upload",
    });

    expect(result.unlinkedScopeTypes).toHaveLength(2);
  });
});

describe("revertAppendedRowsInBatches", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ deleted: REVERT_ROWS_BATCH_SIZE }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bulk-deletes row ids in chunks of REVERT_ROWS_BATCH_SIZE", async () => {
    const rowIds = Array.from({ length: REVERT_ROWS_BATCH_SIZE + 50 }, (_, i) => `id-${i}`);
    const deleted = await revertAppendedRowsInBatches("proj-1", rowIds);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(deleted).toBe(REVERT_ROWS_BATCH_SIZE * 2);
  });
});
