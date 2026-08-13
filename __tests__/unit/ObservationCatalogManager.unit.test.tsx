import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ObservationCatalogManager } from "@/components/forms/ObservationCatalogManager";

const messages = {
  forms: {
    observationSetup: {
      typesTitle: "Observation types",
      typesHint: "Types hint",
      expandSection: "Expand {section}",
      collapseSection: "Collapse {section}",
      moveUp: "Move up",
      moveDown: "Move down",
      dragToReorder: "Drag to reorder",
      archive: "Archive",
      restore: "Restore",
      addType: "Add observation type",
      newTypePlaceholder: "New observation type name",
      editTypeName: "Edit observation type {name}",
      saved: "Saved",
      created: "Added",
      saveError: "Save failed",
      loadError: "Failed to load",
    },
  },
  common: {
    loading: "Loading",
  },
};

const manageFixture = {
  observationTypes: [
    { code: "QUALITY", displayName: "Quality", sortOrder: 10, isActive: true },
    { code: "RETIRED", displayName: "Retired", sortOrder: 99, isActive: false },
  ],
};

function renderManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ObservationCatalogManager />
    </NextIntlClientProvider>,
  );
}

describe("ObservationCatalogManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/observation-catalog/manage")) {
        return { ok: true, json: async () => manageFixture };
      }
      if (url.includes("/api/observation-catalog/types/") && init?.method === "PATCH") {
        return { ok: true, json: async () => ({}) };
      }
      if (url.includes("/api/observation-catalog/types") && init?.method === "POST") {
        return { ok: true, json: async () => ({ code: "CUSTOM", displayName: "Custom" }) };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;
  });

  it("renders active and archived observation types from manage API", async () => {
    renderManager();
    expect(await screen.findByDisplayValue("Quality")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Retired")).toBeInTheDocument();
  });

  it("archives an active observation type via PATCH", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByDisplayValue("Quality");
    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    await user.click(archiveButtons[0]);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/observation-catalog/types/QUALITY"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });
});
