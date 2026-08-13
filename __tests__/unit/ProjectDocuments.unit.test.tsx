import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ProjectDocuments } from "@/components/projects/ProjectDocuments";

const messages = {
  projects: {
    unifierDocuments: "Unifier Documents",
    loadingDocuments: "Loading documents…",
    noDocuments: "No documents in Unifier for this project.",
    showDocuments: "Show documents",
    hideDocuments: "Hide documents",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

const MOCK_DOC = {
  id: "doc_1",
  projectId: "1234",
  title: "Submittal Package",
  fileName: "submittal.pdf",
  revisionNo: "Rev 2",
  issueDate: null,
  createDate: null,
  uploadDate: "2026-01-15T00:00:00Z",
  fileSize: 204800,
  createdBy: null,
  uploadBy: "Jane Smith",
  docTag: null,
  downloadUrl: null,
  nodeType: "2",
};

describe("ProjectDocuments", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders nothing when unifierPid is null", () => {
    const { container } = render(
      <ProjectDocuments unifierPid={null} />,
      { wrapper: Wrapper }
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the section heading when unifierPid is provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    expect(screen.getByRole("heading", { name: "Unifier Documents" })).toBeInTheDocument();
  });

  it("is collapsed by default — content is not visible on initial render", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [MOCK_DOC] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    // Give fetch time to resolve
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(screen.queryByText("No documents in Unifier for this project.")).not.toBeInTheDocument();
    expect(screen.queryByText("Submittal Package")).not.toBeInTheDocument();
  });

  it("uses stable aria-controls id derived from unifierPid (SSR/client match)", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [] }),
    });

    render(
      <ProjectDocuments unifierPid="1374" />,
      { wrapper: Wrapper }
    );

    const toggle = screen.getByRole("button", { name: "Show documents" });
    expect(toggle).toHaveAttribute("aria-controls", "project-documents-1374-content");
  });

  it("toggle button has aria-expanded=false when collapsed", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    const toggle = screen.getByRole("button", { name: "Show documents" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking the toggle expands the content and updates aria-expanded", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    const toggle = screen.getByRole("button", { name: "Show documents" });
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-label", "Hide documents");

    await waitFor(() => {
      expect(screen.getByText("No documents in Unifier for this project.")).toBeInTheDocument();
    });
  });

  it("clicking the toggle twice collapses the content again", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    const toggle = screen.getByRole("button", { name: "Show documents" });
    await user.click(toggle);
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("No documents in Unifier for this project.")).not.toBeInTheDocument();
  });

  it("shows loading indicator while fetching after expand", async () => {
    const user = userEvent.setup();
    // Never-resolving promise to keep the loading state active
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    const toggle = screen.getByRole("button", { name: "Show documents" });
    await user.click(toggle);

    await waitFor(() => {
      expect(screen.getByText("Loading documents…")).toBeInTheDocument();
    });
  });

  it("shows empty state after expand when no documents are returned", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Show documents" }));

    await waitFor(() => {
      expect(screen.getByText("No documents in Unifier for this project.")).toBeInTheDocument();
    });
  });

  it("renders document titles after expand when documents are returned", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [MOCK_DOC] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Show documents" }));

    await waitFor(() => {
      expect(screen.getByText("Submittal Package")).toBeInTheDocument();
    });
  });

  it("renders document as a link when unifierBaseUrl is provided", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [MOCK_DOC] }),
    });

    render(
      <ProjectDocuments
        unifierPid="1234"
        unifierBaseUrl="https://us2.unifier.oraclecloud.com/cpbuild"
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Show documents" }));

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /Submittal Package/i });
      expect(link).toHaveAttribute(
        "href",
        "https://us2.unifier.oraclecloud.com/cpbuild/dm/document/doc_1"
      );
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  it("shows the node type label when nodeType is set", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [MOCK_DOC] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Show documents" }));

    await waitFor(() => {
      // nodeType "2" maps to "Document"
      expect(screen.getByText("Document")).toBeInTheDocument();
    });
  });

  it("uses fileName as fallback when title is null and humanizes the name", async () => {
    const user = userEvent.setup();
    const docWithoutTitle = { ...MOCK_DOC, title: null };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [docWithoutTitle] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Show documents" }));

    await waitFor(() => {
      // humanizeName strips the extension, so "submittal.pdf" → "submittal"
      expect(screen.getByText("submittal")).toBeInTheDocument();
      // The extension is shown separately as a badge
      expect(screen.getByText("PDF")).toBeInTheDocument();
    });
  });

  it("shows fetch error after expand when request fails", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    render(
      <ProjectDocuments unifierPid="1234" />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Show documents" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to load documents")).toBeInTheDocument();
    });
  });

  it("appends projectNumber query param when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ documents: [] }),
    });

    render(
      <ProjectDocuments unifierPid="1234" unifierProjectNumber="24-00967" />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("projectNumber=24-00967")
      );
    });
  });
});
