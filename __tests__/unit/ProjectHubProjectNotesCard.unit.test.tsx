import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProjectHubProjectNotesCard } from "@/components/projects/ProjectHubProjectNotesCard";

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: vi.fn(() => ({ isOffline: false })),
}));

vi.mock("@/lib/offline/snapshot-project-reads", () => ({
  readSnapshotProjectNotes: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/offline/project-note-offline-save", () => ({
  saveProjectNoteCreateOffline: vi.fn(),
  saveProjectNoteEditOffline: vi.fn(),
  deleteProjectNoteOffline: vi.fn(),
  toggleProjectNotePinOffline: vi.fn(),
}));

vi.mock("@/components/projects/ProjectNoteComposerModal", () => ({
  ProjectNoteComposerModal: ({
    onSubmit,
    onClose,
  }: {
    onSubmit: (body: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="composer">
      <button type="button" onClick={() => onSubmit("New note body")}>
        Submit note
      </button>
      <button type="button" onClick={onClose}>
        Close composer
      </button>
    </div>
  ),
}));

const messages = {
  projects: {
    hubProjectNotesTitle: "Project Notes",
    hubProjectNotesEmpty: "No project notes yet.",
    hubProjectNotesAddAria: "Add project note",
    hubProjectNotesViewAll: "Show more",
    hubProjectNotesShowLess: "Show less",
    hubProjectNotesLoadMore: "Load more",
    hubProjectNotesLoadingMore: "Loading…",
    hubProjectNotesEdited: "(edited)",
    hubProjectNotesPendingSync: "Pending sync",
    hubProjectNotesEditAria: "Edit note",
    hubProjectNotesDeleteAria: "Delete note",
    hubProjectNotesLoadFailed: "Failed to load project notes",
    hubFieldNotesRetry: "Retry",
    hubProjectNotesDeleteConfirm: "Delete?",
    hubProjectNotesSaved: "Saved",
    hubProjectNotesSaveFailed: "Save failed",
    hubProjectNotesDeleted: "Deleted",
    hubProjectNotesDeleteFailed: "Delete failed",
    hubProjectNotesQueuedOffline: "Queued",
    hubProjectNotesPinnedLabel: "Pinned",
    hubProjectNotesPinAria: "Pin note",
    hubProjectNotesUnpinAria: "Unpin note",
    hubProjectNotesPinned: "Pinned",
    hubProjectNotesUnpinned: "Unpinned",
    hubProjectNotesPinFailed: "Pin failed",
  },
  common: {
    close: "Close",
    cancel: "Cancel",
  },
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectHubProjectNotesCard projectId="proj-1" currentUserId="user-1" />
    </NextIntlClientProvider>,
  );
}

describe("ProjectHubProjectNotesCard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useOfflineStatus } = await import("@/hooks/use-offline-status");
    vi.mocked(useOfflineStatus).mockReturnValue({ isOnline: true, wasOffline: false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          notes: [],
          totalCount: 0,
          nextCursor: null,
          previewNote: null,
        }),
      }),
    );
  });

  it("renders empty state when there are no notes", async () => {
    renderCard();
    expect(await screen.findByText("No project notes yet.")).toBeTruthy();
  });

  it("renders preview note and expand toggle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          notes: [
            {
              id: "note-1",
              body: "Latest decision",
              author: { id: "user-2", name: "Sam", email: "sam@test.com" },
              createdAt: "2026-07-17T12:00:00.000Z",
              editedAt: null,
              pinnedAt: null,
            },
          ],
          totalCount: 1,
          nextCursor: null,
          previewNote: {
            id: "note-1",
            body: "Latest decision",
            author: { id: "user-2", name: "Sam", email: "sam@test.com" },
            createdAt: "2026-07-17T12:00:00.000Z",
            editedAt: null,
            pinnedAt: null,
          },
        }),
      }),
    );

    renderCard();
    expect(await screen.findByText("Latest decision")).toBeTruthy();
    expect(screen.getByText("Show more")).toBeTruthy();
  });

  it("opens composer from plus button", async () => {
    renderCard();
    await screen.findByText("No project notes yet.");
    fireEvent.click(screen.getByLabelText("Add project note"));
    expect(await screen.findByTestId("composer")).toBeTruthy();
  });

  it("shows edit/delete only for author notes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          notes: [
            {
              id: "note-1",
              body: "Mine",
              author: { id: "user-1", name: "Me", email: "me@test.com" },
              createdAt: "2026-07-17T12:00:00.000Z",
              editedAt: null,
              pinnedAt: null,
            },
          ],
          totalCount: 1,
          nextCursor: null,
          previewNote: {
            id: "note-1",
            body: "Mine",
            author: { id: "user-1", name: "Me", email: "me@test.com" },
            createdAt: "2026-07-17T12:00:00.000Z",
            editedAt: null,
            pinnedAt: null,
          },
        }),
      }),
    );

    renderCard();
    await screen.findByText("Mine");
    expect(screen.getByLabelText("Edit note")).toBeTruthy();
    expect(screen.getByLabelText("Delete note")).toBeTruthy();
    expect(screen.getByLabelText("Pin note")).toBeTruthy();
  });

  it("shows pinned preview before unpinned notes when collapsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pinnedNotes: [
            {
              id: "note-pinned",
              body: "Pinned decision",
              author: { id: "user-2", name: "Sam", email: "sam@test.com" },
              createdAt: "2026-07-15T12:00:00.000Z",
              editedAt: null,
              pinnedAt: "2026-07-18T12:00:00.000Z",
            },
          ],
          notes: [
            {
              id: "note-1",
              body: "Latest decision",
              author: { id: "user-2", name: "Sam", email: "sam@test.com" },
              createdAt: "2026-07-17T12:00:00.000Z",
              editedAt: null,
              pinnedAt: null,
            },
          ],
          totalCount: 2,
          nextCursor: null,
          previewNote: {
            id: "note-pinned",
            body: "Pinned decision",
            author: { id: "user-2", name: "Sam", email: "sam@test.com" },
            createdAt: "2026-07-15T12:00:00.000Z",
            editedAt: null,
            pinnedAt: "2026-07-18T12:00:00.000Z",
          },
        }),
      }),
    );

    renderCard();
    expect(await screen.findByText("Pinned decision")).toBeTruthy();
    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(screen.queryByText("Latest decision")).toBeNull();
  });

  it("queues offline create when offline", async () => {
    const { useOfflineStatus } = await import("@/hooks/use-offline-status");
    const { saveProjectNoteCreateOffline } = await import("@/lib/offline/project-note-offline-save");
    vi.mocked(useOfflineStatus).mockReturnValue({ isOnline: false, wasOffline: true });

    renderCard();
    await screen.findByText("No project notes yet.");
    fireEvent.click(screen.getByLabelText("Add project note"));
    fireEvent.click(await screen.findByText("Submit note"));

    await waitFor(() => {
      expect(saveProjectNoteCreateOffline).toHaveBeenCalledWith({
        projectId: "proj-1",
        currentUserId: "user-1",
        body: "New note body",
      });
    });
  });
});
