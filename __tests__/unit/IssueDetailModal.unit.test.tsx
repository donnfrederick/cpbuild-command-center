import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ComponentProps } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { IssueSummary } from "@/components/projects/UnitCards";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/projects/CommentThread", () => ({ CommentThread: () => null }));
vi.mock("@/components/ui/MentionTextarea", () => ({
  MentionTextarea: ({ value, onChange, placeholder, className, "aria-label": ariaLabel, ...rest }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
    "aria-label"?: string;
    [key: string]: unknown;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      {...rest}
    />
  ),
}));
vi.mock("@/components/projects/MediaWithOfflineFallback", () => ({
  ImgWithOfflineFallback: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
  VideoWithOfflineFallback: () => null,
}));
vi.mock("@/components/projects/ImageAnnotationEditor", () => ({
  ImageAnnotationEditor: () => null,
}));
vi.mock("@/components/projects/ImageAnnotationOverlay", () => ({
  ImageAnnotationOverlay: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));
vi.mock("@/components/projects/CameraCapture", () => ({
  CameraCapture: () => null,
}));
vi.mock("@/lib/upload-with-retry", () => ({ uploadWithRetry: vi.fn() }));
vi.mock("@/lib/issues/use-issue-catalog", () => ({
  useIssueCatalog: () => ({
    issueTypes: [
      { code: "SUBSTRATE_CONDITION", displayName: "Substrate Condition", requiresVisual: false },
      { code: "DAMAGED_MATERIALS", displayName: "Damaged Materials", requiresVisual: true },
      { code: "MISSING_MATERIALS", displayName: "Missing Materials", requiresVisual: false },
      { code: "TRADE_DAMAGE_REPAIR", displayName: "Trade Damage Repair", requiresVisual: true },
      { code: "OTHER", displayName: "Other", requiresVisual: false },
    ],
    responsibleParties: [
      { code: "CP_BUILD", displayName: "CP Build" },
      { code: "ELECTRICIAN", displayName: "Electrician" },
      { code: "PLUMBER", displayName: "Plumber" },
    ],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  resolveIssueTypeLabel: (code: string, types: Array<{ code: string; displayName: string }>) =>
    types.find((t) => t.code === code)?.displayName ?? code,
  resolvePartyLabel: (code: string, parties: Array<{ code: string; displayName: string }>) =>
    parties.find((p) => p.code === code)?.displayName ?? code,
  issueTypeRequiresVisual: (
    code: string,
    types: Array<{ code: string; requiresVisual: boolean }>,
  ) => types.find((t) => t.code === code)?.requiresVisual ?? false,
}));

const messages = {
  units: {
    issuesPageTitle: "Issues",
    editIssueTitle: "Edit Issue",
    backToIssueAria: "Back to issue",
    issueDetailAria: "Issue details",
    issueViewerLabel: "Issue",
    editIssueAria: "Edit issue",
    saveChangesBtn: "Save changes",
    submitting: "Submitting...",
    blockingStatusLabel: "Blocking status",
    blockingLabel: "Blocking",
    nonBlockingLabel: "Non-Blocking",
    issueTypeLabel: "Issue Type",
    scopeTagsLabel: "Scope tags",
    photosFilesLabel: "Photos & files",
    galleryLabel: "Gallery",
    detailsSectionLabel: "Details",
    noIssueDetails: "No additional details were added to this issue.",
    responsibleLabel: "Responsible",
    responsiblePartyLabel: "Responsible Party",
    responsiblePartiesHint: "Select one or more parties",
    responsiblePartiesRequired: "Select at least one responsible party",
    fieldNotesUnknownLocation: "Unknown location",
    fieldNotesProjectUnitKey: "Project",
    projectLevelScope: "Project-level",
    fieldNotesBuildingLevel: "Building {building} · Level {level}",
    statusLabel: "Status",
    issueStatusOpen: "Open",
    statusOpen: "Open",
    statusResolved: "Resolved",
    levelGroupHeading: "Level {level}",
    issueTypeSubstrate: "Substrate Condition",
    issueTypeDamagedMaterials: "Damaged Materials",
    issueTypeMissingMaterials: "Missing Materials",
    issueTypeTradeDamage: "Trade Damage Repair",
    issueTypeOther: "Other",
    editNotesPlaceholder: "Add notes…",
    issueNotesAria: "Issue notes",
    titlePlaceholderIssue: "e.g. Water damage",
    album: { camera: "Camera", library: "Library" },
  },
  common: {
    cancel: "Cancel",
    close: "Close",
    optionalLabel: "optional",
  },
  dictation: {
    fieldTitle: "Title",
    fieldNotes: "Notes",
  },
};

const baseIssue: IssueSummary = {
  id: "issue-1",
  issueType: "SUBSTRATE_CONDITION",
  shortDescription: "Water damage in corridor",
  notes: "",
  status: "OPEN",
  isBlockingWork: true,
  responsibleParty: "ELECTRICIAN",
  unitRef: "B|6|606",
  createdAt: "2026-05-19T16:46:00.000Z",
  createdBy: { id: "u1", name: "Admin", email: "admin@example.com" },
  attachments: [],
  scopeTags: [{ row: { id: "r1", scopeType: { name: "CABIU" } } }],
  subScopeTags: [],
  _count: { comments: 0 },
};

const { IssueDetailModal } = await import("@/components/projects/IssueDetailModal");

function renderEditModal(initialEditOpen = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <IssueDetailModal
        issue={baseIssue}
        unitContext={{ unitKey: "606", building: "1", level: "6", area: "", unit: "606" }}
        projectId="proj-1"
        currentUserId="u1"
        currentUserRole="ADMIN"
        scopes={[
          { id: "r1", name: "CABIU" },
          { id: "r2", name: "TOPIU" },
        ]}
        onClose={vi.fn()}
        initialEditOpen={initialEditOpen}
      />
    </NextIntlClientProvider>,
  );
}

function makeResolveIssue(overrides: Partial<IssueSummary> = {}): IssueSummary {
  return {
    id: "issue-1",
    issueType: "TRADE_DAMAGE_REPAIR",
    responsibleParty: "PLUMBER",
    isBlockingWork: false,
    status: "OPEN",
    shortDescription: "Water Damage",
    notes: "there's water in my boots",
    createdAt: "2026-04-01T00:51:00.000Z",
    bulkGroupId: "group-1",
    bulkGroupCount: 3,
    createdBy: { id: "user-1", name: "Phil Salter", email: "phil@example.com" },
    attachments: [],
    scopeTags: [{ row: { id: "row-1", scopeType: { name: "Ceramic Tile" } } }],
    _count: { comments: 0 },
    ...overrides,
  };
}

function renderResolveModal(
  issue: IssueSummary,
  props: Partial<ComponentProps<typeof IssueDetailModal>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <IssueDetailModal
        issue={issue}
        unitContext={{
          unitKey: "N0001",
          unitRef: "N|0|N0001",
          building: "North",
          area: "North",
          level: "0",
          unit: "Lobby",
        }}
        projectId="proj-1"
        currentUserId="user-1"
        currentUserRole="INSTALL_MANAGER"
        onClose={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("IssueDetailModal edit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens edit mode with issue type and title fields — edit action hidden", () => {
    renderEditModal(true);
    expect(screen.getByText("Issue type")).toBeDefined();
    expect(screen.getByText("Title")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit issue" })).toBeNull();
  });

  it("shows title field with current description value", () => {
    renderEditModal(true);
    expect(screen.getByDisplayValue("Water damage in corridor")).toBeDefined();
  });

  it("returns to view mode when cancel is pressed in the edit footer", () => {
    renderEditModal(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Water damage in corridor" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Edit Issue" })).toBeNull();
  });
});

describe("IssueDetailModal view mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an Issue label badge in the header", () => {
    renderEditModal(false);
    expect(screen.getByText("Issue")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Issue details" })).toBeInTheDocument();
  });
});

describe("IssueDetailModal — bulk resolve workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "issue-1",
          status: "RESOLVED",
          resolvedAt: "2026-05-27T00:00:00.000Z",
          resolvedBy: { id: "user-1", name: "Phil Salter", email: "phil@example.com" },
          resolutionNote: "Fixed the leak",
          attachments: [],
          resolvedCount: 1,
        }),
      }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows resolution note and photo controls before bulk resolve buttons", () => {
    renderResolveModal(makeResolveIssue());

    expect(screen.getByLabelText("Resolution note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open camera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resolve for all 3 remaining units/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resolve for this unit only/i })).toBeInTheDocument();
  });

  it("submits resolution note when resolving a bulk issue for this unit only", async () => {
    renderResolveModal(makeResolveIssue());

    fireEvent.change(screen.getByLabelText("Resolution note"), {
      target: { value: "Fixed the leak" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Resolve for this unit only/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/proj-1/issues/issue-1/resolve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            resolutionNote: "Fixed the leak",
            resolveGroup: false,
            attachmentKeys: [],
            attachmentUrls: [],
            attachmentMimeTypes: [],
            attachmentFileSizeBytes: [],
          }),
        }),
      );
    });
  });

  it("clears auto-close timers on unmount after resolve", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const { unmount } = renderResolveModal(makeResolveIssue());

    fireEvent.change(screen.getByLabelText("Resolution note"), {
      target: { value: "Fixed the leak" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Resolve for this unit only/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

describe("IssueDetailModal — single issue resolve workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "issue-2",
          status: "RESOLVED",
          resolvedCount: 1,
          attachments: [],
        }),
      }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("expands resolution note and photo controls after tapping Resolve Issue", () => {
    renderResolveModal(makeResolveIssue({ id: "issue-2", bulkGroupId: null, bulkGroupCount: null }));

    expect(screen.queryByLabelText("Resolution note")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resolve Issue" }));
    expect(screen.getByLabelText("Resolution note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open camera" })).toBeInTheDocument();
  });

  it("opens with resolution controls visible when initialResolveOpen is true", () => {
    renderResolveModal(makeResolveIssue({ id: "issue-2", bulkGroupId: null, bulkGroupCount: null }), {
      initialResolveOpen: true,
    });

    expect(screen.getByLabelText("Resolution note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Resolve" })).toBeInTheDocument();
  });
});
