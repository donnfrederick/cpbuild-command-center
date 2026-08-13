import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";

vi.mock("@/hooks/use-register-offline-cache-view", () => ({
  useRegisterOfflineCacheView: vi.fn(),
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

vi.mock("@/lib/offline/snapshot-cache", () => ({
  readSnapshotData: vi.fn().mockResolvedValue(null),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/projects/IssueDetailModal", () => ({
  IssueDetailModal: () => null,
}));

function makeIssue(id: string, shortDescription: string) {
  return {
    id,
    issueType: "OTHER",
    responsibleParty: "CP_BUILD",
    isBlockingWork: false,
    status: "OPEN",
    shortDescription,
    createdAt: "2026-07-01T12:00:00.000Z",
    resolvedAt: null,
    unitRef: "||",
    createdBy: { id: "u1", name: "Admin", email: "admin@test.com" },
    attachments: [],
    scopeTags: [],
    subScopeTags: [],
    _count: { comments: 0 },
  };
}

const MOCK_ISSUES = [
  makeIssue("issue-aaa", "First issue"),
  makeIssue("issue-bbb", "Second issue"),
];

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("IssuesLogClient PDF export selection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/issues/export-pdf")) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["pdf"], { type: "application/pdf" })),
        });
      }
      if (url.includes("/issues") && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ issues: MOCK_ISSUES }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: vi.fn(),
    });
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports all filtered issues without issueIds in normal mode", async () => {
    const user = userEvent.setup();
    const { IssuesLogClient } = await import("@/components/projects/IssuesLogClient");

    render(
      <Wrapper>
        <IssuesLogClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("First issue")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Export issues as PDF" }));

    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/issues/export-pdf"),
      );
      expect(exportCall).toBeTruthy();
      const body = JSON.parse(String((exportCall![1] as RequestInit).body));
      expect(body.issueIds).toBeUndefined();
      expect(body.projectName).toBe("Demo Project");
    });
  });

  it("exports only selected issueIds in select mode", async () => {
    const user = userEvent.setup();
    const { IssuesLogClient } = await import("@/components/projects/IssuesLogClient");

    render(
      <Wrapper>
        <IssuesLogClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("First issue")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: /Select issue: First issue/i }));
    await user.click(screen.getByRole("button", { name: "Export selected issues as PDF" }));

    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/issues/export-pdf"),
      );
      expect(exportCall).toBeTruthy();
      const body = JSON.parse(String((exportCall![1] as RequestInit).body));
      expect(body.issueIds).toEqual(["issue-aaa"]);
      expect(body.filterSummary).toBe("1 selected issues");
    });
  });

  it("cancels an in-progress PDF export and dismisses the overlay", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/issues/export-pdf")) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      if (url.includes("/issues") && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ issues: MOCK_ISSUES }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    const { IssuesLogClient } = await import("@/components/projects/IssuesLogClient");

    render(
      <Wrapper>
        <IssuesLogClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("First issue")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Export issues as PDF" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel export" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel export" }));

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "Exporting PDF" })).not.toBeInTheDocument();
    });
  });
});
