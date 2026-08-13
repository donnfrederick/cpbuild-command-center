import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProjectHubFieldNotesCard } from "@/components/projects/ProjectHubFieldNotesCard";

vi.mock("@/components/projects/ObservationDetailModal", () => ({
  ObservationDetailModal: ({
    onClose,
    total,
  }: {
    onClose: () => void;
    total?: number;
  }) => (
    <div data-testid="obs-detail" data-total={total ?? ""}>
      <button type="button" onClick={onClose}>
        Close obs
      </button>
    </div>
  ),
}));

vi.mock("@/components/projects/IssueDetailModal", () => ({
  IssueDetailModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="issue-detail">
      <button type="button" onClick={onClose}>
        Close issue
      </button>
    </div>
  ),
}));

vi.mock("@/components/projects/AddLocationObservationModal", () => ({
  AddProjectObservationModal: ({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) => (
    <div data-testid="add-obs">
      <button type="button" onClick={onCreated}>
        Save obs
      </button>
      <button type="button" onClick={onClose}>
        Cancel obs
      </button>
    </div>
  ),
}));

vi.mock("@/components/projects/AddProjectIssueModal", () => ({
  AddProjectIssueModal: ({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) => (
    <div data-testid="add-issue">
      <button type="button" onClick={onCreated}>
        Save issue
      </button>
      <button type="button" onClick={onClose}>
        Cancel issue
      </button>
    </div>
  ),
}));

vi.mock("@/components/projects/issues/IssueLogRow", () => ({
  IssueLogRow: ({ issue, onView }: { issue: { shortDescription: string }; onView: () => void }) => (
    <button type="button" onClick={onView}>
      {issue.shortDescription}
    </button>
  ),
}));

const messages = {
  projects: {
    hubFieldNotesTitle: "Project Level Observations & Issues",
    hubFieldNotesLoading: "Loading field notes…",
    hubFieldNotesLoadFailed: "Failed to load observations and issues",
    hubFieldNotesRetry: "Retry",
    hubFieldNotesObservations: "Observations",
    hubFieldNotesIssues: "Issues",
    hubFieldNotesNoObservations: "No project-level observations yet.",
    hubFieldNotesNoIssues: "No project-level issues yet.",
    hubFieldNotesAddObservation: "Add project observation",
    hubFieldNotesAddIssue: "Add project issue",
    hubFieldNotesShowMore: "Show {count} more",
    hubFieldNotesShowLess: "Show less",
    hubFieldNotesTimeJustNow: "just now",
    hubFieldNotesTimeMinutes: "{n}m ago",
    hubFieldNotesTimeHours: "{n}h ago",
    hubFieldNotesTimeDays: "{n}d ago",
    hubFieldNotesObsFallbackTitle: "Observation",
  },
  units: {
    obsTypeQuality: "Quality",
    obsTypeProgress: "Progress",
    obsTypeSafety: "Safety",
    obsTypeOther: "Other",
    levelGroupHeading: "Level {level}",
    fieldNotesBuildingLevel: "{building}, Level {level}",
    fieldNotesUnknownLocation: "—",
    fieldNotesProjectUnitKey: "Project",
  },
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectHubFieldNotesCard
        projectId="proj-1"
        projectName="Test Project"
        currentUserId="user-1"
        currentUserRole="ADMIN"
      />
    </NextIntlClientProvider>,
  );
}

const projectObs = {
  id: "obs-1",
  observationType: "QUALITY",
  title: "Site access blocked",
  description: "",
  createdAt: new Date().toISOString(),
  unitRef: null,
  author: { id: "user-1", name: "Pat", email: "pat@example.com" },
  scopeTags: [],
  attachments: [],
  _count: { comments: 0 },
};

const projectIssue = {
  id: "issue-1",
  issueType: "OTHER",
  responsibleParty: "CP_BUILD",
  isBlockingWork: false,
  status: "OPEN",
  shortDescription: "Permit missing",
  createdAt: new Date().toISOString(),
  unitRef: null,
  createdBy: { id: "user-1", name: "Pat", email: "pat@example.com" },
  attachments: [],
  scopeTags: [],
  _count: { comments: 0 },
};

const olderObs = {
  ...projectObs,
  id: "obs-2",
  title: "Older observation",
  createdAt: new Date(Date.now() - 86400000).toISOString(),
};

const newerObs = {
  ...projectObs,
  id: "obs-1",
  title: "Newest observation",
  createdAt: new Date().toISOString(),
};

describe("ProjectHubFieldNotesCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches project-level observations and issues", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/observations?projectLevel=true")) {
        return new Response(JSON.stringify({ observations: [projectObs] }), { status: 200 });
      }
      if (url.includes("/issues?projectLevel=true")) {
        return new Response(JSON.stringify({ issues: [projectIssue] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText("Project Level Observations & Issues")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/proj-1/observations?projectLevel=true&limit=1");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/proj-1/issues?projectLevel=true&limit=1");
  });

  it("expands observations and opens detail modal on row click", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/observations")) {
        return new Response(JSON.stringify({ observations: [projectObs] }), { status: 200 });
      }
      return new Response(JSON.stringify({ issues: [projectIssue] }), { status: 200 });
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText("Site access blocked")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Site access blocked"));

    expect(screen.getByTestId("obs-detail")).toBeInTheDocument();
  });

  it("shows only the most recent observation until expanded", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/observations") && url.includes("limit=1")) {
        return new Response(JSON.stringify({ observations: [newerObs], totalCount: 2 }), { status: 200 });
      }
      if (url.includes("/observations")) {
        return new Response(JSON.stringify({ observations: [newerObs, olderObs], totalCount: 2 }), { status: 200 });
      }
      return new Response(JSON.stringify({ issues: [], totalCount: 0 }), { status: 200 });
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText("Newest observation")).toBeInTheDocument();
    });

    expect(screen.queryByText("Older observation")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 1 more" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 1 more" }));

    await waitFor(() => {
      expect(screen.getByText("Older observation")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/proj-1/observations?projectLevel=true");
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("passes preview-only total to observation detail modal before expand", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/observations") && url.includes("limit=1")) {
        return new Response(JSON.stringify({ observations: [newerObs], totalCount: 3 }), { status: 200 });
      }
      if (url.includes("/observations")) {
        return new Response(JSON.stringify({ observations: [newerObs, olderObs], totalCount: 3 }), { status: 200 });
      }
      return new Response(JSON.stringify({ issues: [], totalCount: 0 }), { status: 200 });
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText("Newest observation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Newest observation"));

    expect(screen.getByTestId("obs-detail")).toHaveAttribute("data-total", "1");
  });

  it("opens add observation modal from add button", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/observations")) {
        return new Response(JSON.stringify({ observations: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ issues: [] }), { status: 200 });
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByLabelText("Add project observation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Add project observation"));
    expect(screen.getByTestId("add-obs")).toBeInTheDocument();
  });
});
