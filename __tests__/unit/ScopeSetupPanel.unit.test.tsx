import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROJECT_ID = "proj_test";
const SCOPE_TYPE_ID = "st_lvt";

const CANONICAL_LVT_FLOORING = { id: "cst_lvt", code: "LVT", displayName: "LVT Flooring" };
const CANONICAL_LVT_STAIRS = { id: "cst_lvt_s", code: "LVT-S", displayName: "LVT Stairs" };

const SCOPES_NO_OVERRIDE = {
  scopes: [
    {
      scopeTypeId: SCOPE_TYPE_ID,
      code: "LVT",
      name: "LVT",
      globalCanonical: CANONICAL_LVT_FLOORING,
      projectOverride: null,
    },
  ],
};

const CANONICALS_RESPONSE = {
  canonicalScopes: [CANONICAL_LVT_FLOORING, CANONICAL_LVT_STAIRS],
};

// ── Component import after mocks ───────────────────────────────────────────────

const { ScopeSetupPanel } = await import("@/components/projects/ScopeSetupPanel");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ScopeSetupPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/scope-overrides")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SCOPES_NO_OVERRIDE),
        });
      }
      if (url.includes("/canonical-scopes")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CANONICALS_RESPONSE),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  it("renders the scope table with scope codes after loading", async () => {
    render(<ScopeSetupPanel projectId={PROJECT_ID} />);
    // Table header should appear after data loads
    await waitFor(() => {
      expect(screen.getByText("colScopeInUPM")).toBeInTheDocument();
    });
    // "LVT" appears in both the code cell (monospace) and name cell below it
    expect(screen.getAllByText("LVT").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the scope row with globalCanonical display name", async () => {
    render(<ScopeSetupPanel projectId={PROJECT_ID} />);
    await waitFor(() => {
      expect(screen.getByText("LVT Flooring")).toBeInTheDocument();
    });
  });

  it("renders the add new global scope button", async () => {
    render(<ScopeSetupPanel projectId={PROJECT_ID} />);
    await waitFor(() => {
      expect(screen.getByText("addNewGlobal")).toBeInTheDocument();
    });
  });

  it("shows the new global scope form when add button is clicked", async () => {
    const user = userEvent.setup();
    render(<ScopeSetupPanel projectId={PROJECT_ID} />);
    await waitFor(() => {
      expect(screen.getByText("addNewGlobal")).toBeInTheDocument();
    });

    await user.click(screen.getByText("addNewGlobal"));
    expect(screen.getByText("newGlobalTitle")).toBeInTheDocument();
    // Both code and displayName fields should be visible
    expect(screen.getByPlaceholderText("codePlaceholder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("displayNamePlaceholder")).toBeInTheDocument();
  });

  it("calls POST /scope-overrides when dropdown changes to a non-empty value", async () => {
    const user = userEvent.setup();
    const onMappingChanged = vi.fn();

    mockFetch.mockImplementation((url: string, options?: { method?: string }) => {
      if (url.includes("/scope-overrides") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              override: {
                id: "ov-1",
                scopeTypeId: SCOPE_TYPE_ID,
                canonicalScopeType: CANONICAL_LVT_STAIRS,
              },
            }),
        });
      }
      if (url.includes("/scope-overrides")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SCOPES_NO_OVERRIDE),
        });
      }
      if (url.includes("/canonical-scopes")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CANONICALS_RESPONSE),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    render(<ScopeSetupPanel projectId={PROJECT_ID} onMappingChanged={onMappingChanged} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    const dropdown = screen.getByRole("combobox");
    await user.selectOptions(dropdown, CANONICAL_LVT_STAIRS.id);

    await waitFor(() => {
      const calls = mockFetch.mock.calls as [string, { method?: string; body?: string }?][];
      const postCall = calls.find(
        ([url, opts]) => url.includes("/scope-overrides") && opts?.method === "POST",
      );
      expect(postCall).toBeDefined();
    });
  });

  it("calls DELETE /scope-overrides/[scopeTypeId] when dropdown is reset to global default", async () => {
    const user = userEvent.setup();

    // Render with an existing project override
    const scopesWithOverride = {
      scopes: [
        {
          scopeTypeId: SCOPE_TYPE_ID,
          code: "LVT",
          name: "LVT",
          globalCanonical: CANONICAL_LVT_FLOORING,
          projectOverride: CANONICAL_LVT_STAIRS,
        },
      ],
    };

    mockFetch.mockImplementation((url: string, options?: { method?: string }) => {
      if (url.includes(`/scope-overrides/${SCOPE_TYPE_ID}`) && options?.method === "DELETE") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ deleted: true }),
        });
      }
      if (url.includes("/scope-overrides")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(scopesWithOverride),
        });
      }
      if (url.includes("/canonical-scopes")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CANONICALS_RESPONSE),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    render(<ScopeSetupPanel projectId={PROJECT_ID} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    const dropdown = screen.getByRole("combobox");
    // Select the empty option ("Use global default")
    await user.selectOptions(dropdown, "");

    await waitFor(() => {
      const calls = mockFetch.mock.calls as [string, { method?: string }?][];
      const deleteCall = calls.find(
        ([url, opts]) =>
          url.includes(`/scope-overrides/${SCOPE_TYPE_ID}`) && opts?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
    });
  });

  it("shows empty state message when scopes array is empty", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/scope-overrides")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ scopes: [] }),
        });
      }
      if (url.includes("/canonical-scopes")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CANONICALS_RESPONSE),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    render(<ScopeSetupPanel projectId={PROJECT_ID} />);
    await waitFor(() => {
      expect(screen.getByText("noScopesFound")).toBeInTheDocument();
    });
  });

  it("renders with null projectOverride (Unifier empty-field case)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/scope-overrides")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              scopes: [
                {
                  scopeTypeId: SCOPE_TYPE_ID,
                  code: "LVT",
                  name: "LVT",
                  globalCanonical: null, // no global canonical
                  projectOverride: null,
                },
              ],
            }),
        });
      }
      if (url.includes("/canonical-scopes")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CANONICALS_RESPONSE),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    render(<ScopeSetupPanel projectId={PROJECT_ID} />);
    await waitFor(() => {
      // Should show warning for unlinked scope
      expect(screen.getByText("warningUnlinked")).toBeInTheDocument();
    });
  });
});
