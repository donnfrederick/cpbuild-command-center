import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";
import { IssuesLogClient } from "@/components/projects/IssuesLogClient";
import { ObservationsLogClient } from "@/components/projects/ObservationsLogClient";
import { toast } from "sonner";

vi.mock("@/lib/deliver-pdf-blob", () => ({
  isMobilePdfDelivery: vi.fn(() => false),
  deliverPdfBlob: vi.fn(async () => "downloaded" as const),
  deliverPdfBlobOnUserGesture: vi.fn(async () => "shared" as const),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true }),
}));

vi.mock("@/hooks/use-register-offline-cache-view", () => ({
  useRegisterOfflineCacheView: vi.fn(),
}));

vi.mock("@/lib/offline/snapshot-cache", () => ({
  readSnapshotData: vi.fn(async () => null),
}));

vi.mock("@/lib/offline/snapshot-project-reads", () => ({
  readSnapshotObservationsForProject: vi.fn(async () => null),
}));

vi.mock("@/components/projects/IssueDetailModal", () => ({
  IssueDetailModal: () => null,
}));

vi.mock("@/components/projects/ObservationDetailModal", () => ({
  ObservationDetailModal: () => null,
}));

vi.mock("@/components/projects/issues/IssueLogRow", () => ({
  IssueLogRow: () => <div data-testid="issue-row-stub" />,
}));

const messages = {
  units: en.units,
  offlineIndicator: en.offlineIndicator,
  projects: { fieldReports: en.projects.fieldReports },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function mockPdfResponse(): Response {
  const bytes = new TextEncoder().encode("%PDF-1.4");
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    blob: async () => new Blob([bytes], { type: "application/pdf" }),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

function mockJsonResponse<T>(data: T): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as unknown as Response;
}

const sampleIssue = {
  id: "issue-1",
  shortDescription: "Test issue",
  status: "OPEN",
  issueType: "OTHER",
  responsibleParty: "CP_BUILD",
  isBlockingWork: false,
  createdAt: "2026-07-01T12:00:00.000Z",
  createdBy: { id: "u1", name: "Admin", email: "admin@test.com" },
  attachments: [],
  unitRef: "A|1|101",
  scopeTags: [
    {
      row: {
        id: "row-1",
        building: "A",
        level: "1",
        unit: "101",
        scopeType: { name: "Unit" },
      },
    },
  ],
  _count: { comments: 0 },
};

const sampleObs = {
  id: "obs-1",
  title: "Test obs",
  description: "",
  observationType: "QUALITY",
  unitRef: "A|1|101",
  createdAt: "2026-07-01T12:00:00.000Z",
  author: { id: "u1", name: "Admin", email: "admin@test.com" },
  attachments: [],
  _count: { comments: 0 },
};

function installFetchMock(mode: "issues" | "observations") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveFetchUrl(input);
    const method = init?.method ?? "GET";

    if (url.includes("/issues/export-pdf") && method === "POST") {
      return mockPdfResponse();
    }
    if (url.includes("/observations/export-pdf") && method === "POST") {
      return mockPdfResponse();
    }
    if (url.includes("/issues") && method === "GET") {
      return mockJsonResponse({ issues: [sampleIssue] });
    }
    if (url.includes("/observations") && method === "GET") {
      return mockJsonResponse({ observations: [sampleObs] });
    }
    throw new Error(`Unhandled fetch in ${mode}: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Field Reports PDF export — mobile delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isMobilePdfDelivery).mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("IssuesLogClient delivers immediately on desktop after export", async () => {
    const fetchMock = installFetchMock("issues");

    render(
      <Wrapper>
        <IssuesLogClient projectId="proj-1" embeddedInFieldReports />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export issues as PDF" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export issues as PDF" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/issues/export-pdf",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(deliverPdfBlob).toHaveBeenCalled();
    });
    expect(deliverPdfBlobOnUserGesture).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("IssuesLogClient shows Save PDF on mobile instead of auto-sharing", async () => {
    vi.mocked(isMobilePdfDelivery).mockReturnValue(true);
    installFetchMock("issues");

    render(
      <Wrapper>
        <IssuesLogClient projectId="proj-1" embeddedInFieldReports />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export issues as PDF" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export issues as PDF" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save PDF" })).toBeInTheDocument();
    });

    expect(deliverPdfBlob).not.toHaveBeenCalled();
    expect(deliverPdfBlobOnUserGesture).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save PDF" }));

    await waitFor(() => {
      expect(deliverPdfBlobOnUserGesture).toHaveBeenCalled();
    });
  });

  it("ObservationsLogClient shows Save PDF on mobile after export", async () => {
    vi.mocked(isMobilePdfDelivery).mockReturnValue(true);
    const fetchMock = installFetchMock("observations");

    render(
      <Wrapper>
        <ObservationsLogClient projectId="proj-1" embeddedInFieldReports />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export observations as PDF" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export observations as PDF" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/observations/export-pdf",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save PDF" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save PDF" }));

    await waitFor(() => {
      expect(deliverPdfBlobOnUserGesture).toHaveBeenCalled();
    });
  });
});
