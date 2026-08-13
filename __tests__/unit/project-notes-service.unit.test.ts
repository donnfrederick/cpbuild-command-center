import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PROJECT_NOTES_PAGE_SIZE,
} from "@/lib/project-notes/constants";
import {
  toProjectNoteDto,
} from "@/lib/project-notes/service";

vi.mock("@/lib/db", () => ({
  db: {
    projectNote: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { listProjectNotes } from "@/lib/project-notes/service";

const author = { id: "u1", name: "Alex", email: "alex@test.com" };

function makeRow(id: string, createdAt: string, body: string, pinnedAt: Date | null = null) {
  return {
    id,
    body,
    editedAt: null,
    pinnedAt,
    createdAt: new Date(createdAt),
    author,
  };
}

describe("project-notes service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toProjectNoteDto maps author and timestamps", () => {
    const dto = toProjectNoteDto(makeRow("n1", "2026-07-17T12:00:00.000Z", "Hello"));
    expect(dto.author.email).toBe("alex@test.com");
    expect(dto.createdAt).toBe("2026-07-17T12:00:00.000Z");
    expect(dto.pinnedAt).toBeNull();
  });

  it("listProjectNotes returns nextCursor when more rows exist", async () => {
    const rows = Array.from({ length: PROJECT_NOTES_PAGE_SIZE + 1 }, (_, i) =>
      makeRow(`n${i}`, `2026-07-1${7 - i}T12:00:00.000Z`, `Note ${i}`),
    );
    vi.mocked(db.projectNote.count).mockResolvedValue(6);
    vi.mocked(db.projectNote.findMany).mockResolvedValue(rows as never);
    vi.mocked(db.projectNote.findFirst).mockResolvedValue(rows[0] as never);

    const result = await listProjectNotes({ projectId: "p1" });

    expect(result.notes).toHaveLength(PROJECT_NOTES_PAGE_SIZE);
    expect(result.nextCursor).toBe(`n${PROJECT_NOTES_PAGE_SIZE - 1}`);
    expect(result.previewNote?.id).toBe("n0");
    expect(result.totalCount).toBe(6);
  });
});
