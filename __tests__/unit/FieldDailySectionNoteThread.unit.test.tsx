import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FieldDailySectionNoteThread } from "@/components/reports/FieldDailySectionNoteThread";
import type { FieldDailyReportSectionNoteDto } from "@/lib/field-daily-report/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const messages = {
  fieldDailyReport: {
    sectionNotesLabel: "Notes",
    sectionNotesEmpty: "No notes yet.",
    sectionNotePlaceholder: "Add a note…",
    sectionNoteSubmit: "Submit note",
    sectionNoteSubmitSuccess: "Note posted.",
    sectionNoteSubmitError: "Couldn't post",
    sectionNoteReplyPlaceholder: "Write a reply…",
    sectionNoteReplyLink: "Reply",
    sectionNoteReplySubmit: "Submit reply",
    sectionNoteReplyCancel: "Cancel",
    sectionNoteReplyError: "Reply failed",
    sectionNoteReplySubmitSuccess: "Reply posted.",
    sectionNoteAuthorInstallManager: "Install Manager",
    sectionNoteEdited: "edited",
    sectionNoteShowMore: "Show {count} more notes",
    sectionNoteShowLess: "Show fewer notes",
    sectionNoteShowMoreReplies: "Show {count} more replies",
    sectionNoteEditAria: "Edit note",
    sectionNoteEditReplyAria: "Edit reply",
    sectionNoteDeleteAria: "Delete note",
    sectionNoteDeleteReplyAria: "Delete reply",
    sectionNoteSaveEdit: "Save edit",
    sectionNoteCancelEdit: "Cancel edit",
  },
};

const note: FieldDailyReportSectionNoteDto = {
  id: "note-1",
  sectionKey: "progress",
  itemKey: "",
  body: "Main note text",
  author: {
    id: "user-1",
    name: "Phil",
    roleCode: "ADMIN",
    isInstallManager: true,
  },
  createdAt: "2026-07-17T12:00:00.000Z",
  editedAt: null,
  replies: [
    {
      id: "reply-1",
      body: "Existing reply",
      author: {
        id: "user-2",
        name: "Alex",
        roleCode: "MEMBER",
        isInstallManager: false,
      },
      createdAt: "2026-07-17T13:00:00.000Z",
      editedAt: null,
    },
  ],
};

function renderThread(overrides: Partial<Parameters<typeof FieldDailySectionNoteThread>[0]> = {}) {
  const onNotesChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FieldDailySectionNoteThread
        projectId="p1"
        reportDate="2026-07-17"
        sectionKey="progress"
        notes={[note]}
        currentUserId="user-1"
        editable
        onNotesChange={onNotesChange}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onNotesChange };
}

describe("FieldDailySectionNoteThread reply UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not show a reply textarea until Reply is clicked", () => {
    renderThread();
    expect(screen.queryByLabelText("Write a reply…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByText("Existing reply")).toBeInTheDocument();
  });

  it("opens inline reply composer on Reply and closes on Cancel", async () => {
    const user = userEvent.setup();
    renderThread();

    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByLabelText("Write a reply…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Write a reply…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
  });
});
