import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RolePreviewPicker } from "@/components/layout/RolePreviewPicker";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const MOCK_ROLES = [
  { code: "ADMIN", name: "Admin", id: "1", description: null },
  { code: "DESIGNER", name: "Designer", id: "2", description: null },
  { code: "DEVELOPER", name: "Developer", id: "3", description: null },
  { code: "MEMBER", name: "Member", id: "4", description: null },
  { code: "PRODUCT", name: "Product", id: "5", description: null },
  { code: "EXECUTIVE", name: "Executive", id: "6", description: null },
  { code: "TEAM_LEAD", name: "Team Lead", id: "7", description: null },
  { code: "PROJECT_MANAGER", name: "Project Manager", id: "8", description: null },
  { code: "PROJECT_COORDINATOR", name: "Project Coordinator", id: "9", description: null },
  { code: "CONTROLS_MANAGER", name: "Controls Manager", id: "10", description: null },
  { code: "INSTALL_MANAGER", name: "Install Manager", id: "11", description: null },
  { code: "INSTALL_DIRECTOR", name: "Install Director", id: "12", description: null },
  { code: "BI_ANALYST", name: "BI Analyst", id: "13", description: null },
];

function mockFetch(handlers?: {
  postOk?: boolean;
  postError?: string;
  deleteOnly?: boolean;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/roles") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: MOCK_ROLES }),
        });
      }
      if (url === "/api/admin/role-preview" && init?.method === "DELETE") {
        return Promise.resolve({ ok: true });
      }
      if (url === "/api/admin/role-preview" && init?.method === "POST") {
        if (handlers?.postOk === false) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: handlers.postError ?? "Failed" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ previewRole: "MEMBER", realRole: "ADMIN" }),
        });
      }
      return Promise.resolve({ ok: handlers?.deleteOnly ? true : false });
    }),
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────

const messages = {
  rolePreview: {
    bannerLabel: "Role preview active",
    previewingAs: "Previewing as",
    yourRoleIs: "Your real role is {role}",
    exitPreview: "Exit preview",
    exitingLabel: "Exiting…",
    sectionLabel: "Role preview",
    selectRole: "Select a role to preview",
    pickARole: "Preview as…",
    yours: "yours",
    errorGeneric: "Failed to switch preview role",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RolePreviewPicker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch();
  });

  it("renders the role select with placeholder option", async () => {
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole={null} />,
      { wrapper: Wrapper },
    );
    const select = await screen.findByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Preview as…")).toBeInTheDocument();
  });

  it("renders all role options from the API", async () => {
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole={null} />,
      { wrapper: Wrapper },
    );
    const select = await screen.findByRole("combobox");
    await waitFor(() => {
      expect(select.querySelectorAll("option").length).toBe(MOCK_ROLES.length + 1);
    });
  });

  it("marks the real role with (yours)", async () => {
    render(
      <RolePreviewPicker realRole="MEMBER" activePreviewRole={null} />,
      { wrapper: Wrapper },
    );
    expect(await screen.findByText(/Member.*yours/)).toBeInTheDocument();
  });

  it("calls POST /api/admin/role-preview when a role is selected", async () => {
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole={null} />,
      { wrapper: Wrapper },
    );
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "MEMBER" } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/admin/role-preview",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ previewRole: "MEMBER" }),
        }),
      );
    });
  });

  it("calls router.refresh() after a successful role selection", async () => {
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole={null} />,
      { wrapper: Wrapper },
    );
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "PROJECT_MANAGER" } });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the exit preview button when a preview is active", () => {
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole="MEMBER" />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("button", { name: /Exit preview/i })).toBeInTheDocument();
  });

  it("does not show the exit button when no preview is active", async () => {
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole={null} />,
      { wrapper: Wrapper },
    );
    await screen.findByRole("combobox");
    expect(screen.queryByRole("button", { name: /Exit preview/i })).not.toBeInTheDocument();
  });

  it("calls DELETE /api/admin/role-preview on exit click", async () => {
    mockFetch({ deleteOnly: true });
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole="MEMBER" />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole("button", { name: /Exit preview/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/admin/role-preview", { method: "DELETE" });
    });
  });

  it("shows the active preview role as the selected option", async () => {
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole="CONTROLS_MANAGER" />,
      { wrapper: Wrapper },
    );
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    await waitFor(() => {
      expect(select.value).toBe("CONTROLS_MANAGER");
    });
  });

  it("shows an error message when the POST fails", async () => {
    mockFetch({ postOk: false, postError: "Failed to switch preview role" });
    render(
      <RolePreviewPicker realRole="ADMIN" activePreviewRole={null} />,
      { wrapper: Wrapper },
    );
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "MEMBER" } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to switch preview role");
    });
  });
});
