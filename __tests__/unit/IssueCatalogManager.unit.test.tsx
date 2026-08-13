import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { IssueCatalogManager } from "@/components/forms/IssueCatalogManager";

const messages = {
  forms: {
    issueSetup: {
      title: "Issue setup",
      typesHeading: "Issue types",
      partiesHeading: "Responsible parties",
      issueTypesTitle: "Issue types",
      issueTypesHint: "Types hint",
      expandSection: "Expand {section}",
      collapseSection: "Collapse {section}",
      partiesTitle: "Responsible parties",
      partiesHint: "Parties hint",
      addType: "Add type",
      addParty: "Add party",
      requiresPhotoToggle: "Requires photo or video",
      moveUp: "Move up",
      moveDown: "Move down",
      dragToReorder: "Drag to reorder",
      editTypeName: "Edit issue type {name}",
      editPartyName: "Edit party {name}",
      created: "Added",
      archive: "Archive",
      restore: "Restore",
      loadError: "Failed to load",
      saveError: "Save failed",
      saved: "Saved",
      newTypePlaceholder: "New issue type",
      newPartyPlaceholder: "New party",
    },
  },
  common: {
    loading: "Loading",
  },
};

const manageFixture = {
  issueTypes: [
    {
      code: "OTHER",
      displayName: "Other",
      requiresVisual: false,
      sortOrder: 10,
      isActive: true,
    },
    {
      code: "RETIRED",
      displayName: "Retired",
      requiresVisual: false,
      sortOrder: 99,
      isActive: false,
    },
  ],
  responsibleParties: [
    { code: "CP_BUILD", displayName: "CP Build", sortOrder: 10, isActive: true },
  ],
};

function renderManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <IssueCatalogManager />
    </NextIntlClientProvider>,
  );
}

describe("IssueCatalogManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/issue-catalog/manage")) {
        return {
          ok: true,
          json: async () => manageFixture,
        };
      }
      if (url.includes("/api/issue-catalog/issue-types/") && init?.method === "PATCH") {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;
  });

  it("renders active and archived issue types from manage API", async () => {
    renderManager();
    expect(await screen.findByDisplayValue("Other")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Retired")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CP Build")).toBeInTheDocument();
  });

  it("archives an active issue type via PATCH", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByDisplayValue("Other");
    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    await user.click(archiveButtons[0]);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/issue-catalog/issue-types/OTHER",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ isActive: false }),
        }),
      );
    });
  });

  it("collapses and expands the issue types section", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByDisplayValue("Other");

    await user.click(screen.getByRole("button", { name: "Collapse Issue types" }));
    expect(screen.queryByDisplayValue("Other")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Issue types" }));
    expect(await screen.findByDisplayValue("Other")).toBeInTheDocument();
  });

  it("collapses the responsible parties section independently", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByDisplayValue("CP Build");

    await user.click(screen.getByRole("button", { name: "Collapse Responsible parties" }));
    expect(screen.queryByDisplayValue("CP Build")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Other")).toBeInTheDocument();
  });

  it("persists sort order when reordering issue types via move up", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("640px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    renderManager();
    await screen.findByDisplayValue("Other");

    const moveDownButtons = screen.getAllByRole("button", { name: "Move down" });
    await user.click(moveDownButtons[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/issue-catalog/issue-types/OTHER",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ sortOrder: 20 }),
        }),
      );
    });
  });
});
