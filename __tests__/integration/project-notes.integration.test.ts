import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
  enforceProductionFieldNotesMutation: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/project-notes/service", () => ({
  PROJECT_NOTES_PAGE_SIZE: 5,
  listProjectNotes: vi.fn(),
  createProjectNote: vi.fn(),
  updateProjectNote: vi.fn(),
  setProjectNotePinned: vi.fn(),
  softDeleteProjectNote: vi.fn(),
}));

import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  enforceProjectReadVisibility,
  enforceProductionFieldNotesMutation,
} from "@/lib/production-project-access";
import {
  createProjectNote,
  listProjectNotes,
  setProjectNotePinned,
  softDeleteProjectNote,
  updateProjectNote,
} from "@/lib/project-notes/service";
import { GET, POST } from "@/app/api/projects/[id]/notes/route";
import { DELETE, PATCH } from "@/app/api/projects/[id]/notes/[noteId]/route";

const sampleNote = {
  id: "note-1",
  body: "Decision recorded",
  author: { id: "user-1", name: "Admin", email: "admin@test.com" },
  createdAt: "2026-07-17T12:00:00.000Z",
  editedAt: null,
  pinnedAt: null,
};

describe("Project notes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(null);
    vi.mocked(enforceProductionFieldNotesMutation).mockResolvedValue(null);
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user-1", role: "ADMIN", email: "admin@test.com" },
    } as never);
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "user-1", role: "ADMIN", email: "admin@test.com" },
      masquerade: null,
    } as never);
  });

  it("GET returns 401 without session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/notes"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET returns notes payload when project is visible", async () => {
    vi.mocked(listProjectNotes).mockResolvedValue({
      notes: [sampleNote],
      totalCount: 1,
      nextCursor: null,
      previewNote: sampleNote,
    });

    const res = await GET(new NextRequest("http://localhost/api/projects/p1/notes"), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.previewNote.id).toBe("note-1");
    expect(enforceProjectReadVisibility).toHaveBeenCalledWith("p1", expect.any(Object));
  });

  it("POST returns 422 for empty body", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/projects/p1/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "" }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(422);
  });

  it("POST creates a note", async () => {
    vi.mocked(createProjectNote).mockResolvedValue(sampleNote);

    const res = await POST(
      new NextRequest("http://localhost/api/projects/p1/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Decision recorded" }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );

    expect(res.status).toBe(201);
    expect(createProjectNote).toHaveBeenCalledWith({
      projectId: "p1",
      authorId: "user-1",
      body: "Decision recorded",
    });
    expect(enforceProductionFieldNotesMutation).toHaveBeenCalled();
  });

  it("PATCH returns 403 when service rejects non-author", async () => {
    vi.mocked(updateProjectNote).mockResolvedValue("forbidden");

    const res = await PATCH(
      new NextRequest("http://localhost/api/projects/p1/notes/note-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Updated" }),
      }),
      { params: Promise.resolve({ id: "p1", noteId: "note-1" }) },
    );

    expect(res.status).toBe(403);
  });

  it("PATCH updates author note", async () => {
    vi.mocked(updateProjectNote).mockResolvedValue({ ...sampleNote, body: "Updated" });

    const res = await PATCH(
      new NextRequest("http://localhost/api/projects/p1/notes/note-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Updated" }),
      }),
      { params: Promise.resolve({ id: "p1", noteId: "note-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note.body).toBe("Updated");
  });

  it("PATCH pins a note", async () => {
    vi.mocked(setProjectNotePinned).mockResolvedValue({
      ...sampleNote,
      pinnedAt: "2026-07-18T12:00:00.000Z",
    });

    const res = await PATCH(
      new NextRequest("http://localhost/api/projects/p1/notes/note-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: true }),
      }),
      { params: Promise.resolve({ id: "p1", noteId: "note-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note.pinnedAt).toBe("2026-07-18T12:00:00.000Z");
    expect(setProjectNotePinned).toHaveBeenCalledWith({
      projectId: "p1",
      noteId: "note-1",
      pinned: true,
    });
  });

  it("DELETE soft-deletes author note", async () => {
    vi.mocked(softDeleteProjectNote).mockResolvedValue("ok");

    const res = await DELETE(
      new NextRequest("http://localhost/api/projects/p1/notes/note-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "p1", noteId: "note-1" }) },
    );

    expect(res.status).toBe(200);
    expect(softDeleteProjectNote).toHaveBeenCalledWith({
      projectId: "p1",
      noteId: "note-1",
      authorId: "user-1",
    });
  });
});
