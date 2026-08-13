import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { RoleManager } from "@/app/[locale]/(dashboard)/admin/roles/_components/RoleManager";

const messages = {
  roleManager: {
    navLabel: "Roles",
    pageTitle: "Role Manager",
    pageDescription: "Manage roles",
    createButton: "Create role",
    createTitle: "Create role",
    nameLabel: "Role name",
    namePlaceholder: "Name",
    codeLabel: "Role code",
    codePlaceholder: "CODE",
    codeHint: "Uppercase only",
    descriptionLabel: "Description",
    descriptionPlaceholder: "Desc",
    cancelButton: "Cancel",
    submitCreate: "Create",
    creating: "Creating",
    saveButton: "Save permissions",
    saving: "Saving…",
    saved: "Saved",
    saveError: "Save failed",
    detailsSaveError: "Details save failed",
    nameRequired: "Role name is required",
    loadError: "Load failed",
    builtinBadge: "Built-in",
    customBadge: "Custom",
    userCount: "{count} users",
    selectRole: "Select a role",
    permissionsTitle: "Permissions",
    permissionsHint: "Hint",
    issueAccessNote: "Note",
    categoryTeam: "Team",
    categoryProjects: "Projects",
    categoryFieldTracker: "Field Tracker",
    categoryLocationTracking: "Location Tracking",
    categoryAdmin: "Admin",
    categoryForms: "Forms",
    categoryBi: "BI",
    deleteRole: "Delete",
    deleteConfirm: "Delete?",
    deleting: "Deleting",
    deleteError: "Delete failed",
    dangerousPermTitle: "Dangerous",
    dangerousPermBody: "Remove {permission} from {role}",
    confirmRemove: "Remove",
    editDetails: "Edit",
    saveDetails: "Save details",
    detailsSaved: "Saved details",
    loading: "Loading",
    unsavedChanges: "Unsaved",
    protectedPermissionsNote: "Protected: {permissions}",
  },
};

const memberRole = {
  id: "role-1",
  code: "MEMBER",
  name: "Member",
  description: null,
  permissions: ["view:team", "projects:view"],
  isBuiltin: true,
  userCount: 2,
};

function renderManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RoleManager />
    </NextIntlClientProvider>,
  );
}

describe("RoleManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [memberRole] }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders role list after load", async () => {
    renderManager();
    expect(await screen.findByText("Member")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
  });

  it("does not show a details save error before the user edits anything", async () => {
    renderManager();
    await screen.findByText("Member");
    expect(screen.queryByText("Details save failed")).not.toBeInTheDocument();
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
  });

  it("calls PUT when saving permission changes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              ...memberRole,
              permissions: ["view:team"],
              userCount: 0,
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            ...memberRole,
            permissions: ["view:team", "dashboard:view"],
            userCount: 0,
          },
        }),
      } as Response);

    renderManager();
    await screen.findByText("Member");

    const dashboardCheckbox = await screen.findByRole("checkbox", { name: /View Dashboard/i });
    await user.click(dashboardCheckbox);

    await user.click(screen.getByRole("button", { name: /Save permissions/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/roles/role-1/permissions",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("autosaves role name via PATCH after debounce", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [memberRole] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { ...memberRole, name: "Field Member" },
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderManager();
    await screen.findByText("Member");

    const nameInput = screen.getByDisplayValue("Member");
    await user.clear(nameInput);
    await user.type(nameInput, "Field Member");

    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/roles/role-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Field Member", description: null }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getAllByText("Field Member").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("flushes pending name edits before saving permissions", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ ...memberRole, permissions: ["view:team"], userCount: 0 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { ...memberRole, name: "Field Member" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            ...memberRole,
            name: "Field Member",
            permissions: ["view:team", "dashboard:view"],
            userCount: 0,
          },
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderManager();
    await screen.findByText("Member");

    const nameInput = screen.getByDisplayValue("Member");
    await user.clear(nameInput);
    await user.type(nameInput, "Field Member");

    const dashboardCheckbox = await screen.findByRole("checkbox", { name: /View Dashboard/i });
    await user.click(dashboardCheckbox);
    await user.click(screen.getByRole("button", { name: /Save permissions/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/admin/roles/role-1");
      expect(fetchMock.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/admin/roles/role-1/permissions");
      expect(fetchMock.mock.calls[2]?.[1]).toEqual(
        expect.objectContaining({ method: "PUT" }),
      );
    });

    expect(screen.getByDisplayValue("Field Member")).toBeInTheDocument();
  });
});
