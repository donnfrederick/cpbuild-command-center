import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createProjectWithUpmRows,
  CreateProjectCancelledError,
  revertCreateProjectAttempt,
} from "@/lib/create-project-with-upm";
import { AppendRowsCancelledError } from "@/lib/field-tracker-append-rows";

vi.mock("@/lib/field-tracker-append-rows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/field-tracker-append-rows")>();
  return {
    ...actual,
    appendProjectRowsInBatches: vi.fn(),
    revertAppendedRowsInBatches: vi.fn(),
  };
});

import { appendProjectRowsInBatches, revertAppendedRowsInBatches } from "@/lib/field-tracker-append-rows";

describe("createProjectWithUpmRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/projects") {
          return {
            ok: true,
            json: async () => ({ id: "proj-new", projectName: "Tower A", restored: false }),
          } as Response;
        }
        return { ok: false, json: async () => ({ error: "unexpected" }) } as Response;
      }),
    );
    vi.mocked(appendProjectRowsInBatches).mockResolvedValue({
      added: 2,
      skipped: 0,
      addedRowIds: ["r1", "r2"],
      unlinkedScopeTypes: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates project shell then uploads rows in batches", async () => {
    const onProgress = vi.fn();
    const rows = [{ Building: "A", Unit: "101" }, { Building: "A", Unit: "102" }];
    const result = await createProjectWithUpmRows({
      unifierPid: "UNI-1",
      rows,
      source: "upload",
      onProgress,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ unifierPid: "UNI-1" }),
      }),
    );
    expect(appendProjectRowsInBatches).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-new", rows, source: "upload" }),
    );
    expect(result.project.id).toBe("proj-new");
    expect(result.addedRowIds).toEqual(["r1", "r2"]);
    expect(onProgress).toHaveBeenCalledWith({ phase: "creating", completed: 0, total: 2 });
  });

  it("throws CreateProjectCancelledError when upload is cancelled", async () => {
    vi.mocked(appendProjectRowsInBatches).mockRejectedValue(
      new AppendRowsCancelledError({
        added: 1,
        skipped: 0,
        addedRowIds: ["r1"],
        unlinkedScopeTypes: [],
      }),
    );

    await expect(
      createProjectWithUpmRows({
        unifierPid: "UNI-1",
        rows: [{ Building: "A", Unit: "101" }],
        source: "paste",
      }),
    ).rejects.toBeInstanceOf(CreateProjectCancelledError);
  });
});

describe("revertCreateProjectAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (url.includes("/bulk-delete")) {
          return { ok: true, json: async () => ({ deleted: 1 }) } as Response;
        }
        if (url === "/api/projects/proj-new" && opts?.method === "DELETE") {
          return { ok: true, status: 204, json: async () => ({}) } as Response;
        }
        return { ok: false, json: async () => ({ error: "unexpected" }) } as Response;
      }),
    );
    vi.mocked(revertAppendedRowsInBatches).mockResolvedValue(1);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reverts rows then deletes the project", async () => {
    await revertCreateProjectAttempt("proj-new", ["r1"]);
    expect(revertAppendedRowsInBatches).toHaveBeenCalledWith("proj-new", ["r1"]);
    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-new", { method: "DELETE" });
  });
});
