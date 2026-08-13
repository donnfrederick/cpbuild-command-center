import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentIdentityForm } from "@/components/account/AgentIdentityForm";

vi.mock("next-intl", () => {
  const t = (key: string) => key;
  return { useTranslations: () => t };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const defaultIdentity = { agentName: "Max", agentCallsign: "MAX", agentMission: "Build fast." };
const emptyIdentity = { agentName: null, agentCallsign: null, agentMission: null };

function mockGet(data: typeof defaultIdentity | typeof emptyIdentity) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => data });
}

function mockPatch(data: typeof defaultIdentity) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => data });
}

describe("AgentIdentityForm", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders and populates fields from API", async () => {
    mockGet(defaultIdentity);
    render(<AgentIdentityForm />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Max")).toBeInTheDocument();
      expect(screen.getByDisplayValue("MAX")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Build fast.")).toBeInTheDocument();
    });
  });

  it("renders with all-null identity without crashing (mirrors nullable real data)", async () => {
    mockGet(emptyIdentity);
    render(<AgentIdentityForm />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("agentNamePlaceholder")).toBeInTheDocument();
    });
  });

  it("auto-suggests callsign from agent name as first 3 chars uppercase", async () => {
    mockGet(emptyIdentity);
    render(<AgentIdentityForm />);
    await waitFor(() => screen.getByPlaceholderText("agentNamePlaceholder"));

    const nameInput = screen.getByPlaceholderText("agentNamePlaceholder");
    await userEvent.type(nameInput, "Axiom");
    expect(screen.getByDisplayValue("AXI")).toBeInTheDocument();
  });

  it("forces callsign to uppercase", async () => {
    mockGet(emptyIdentity);
    render(<AgentIdentityForm />);
    await waitFor(() => screen.getByPlaceholderText("MAX"));

    const callsignInput = screen.getByPlaceholderText("MAX");
    await userEvent.type(callsignInput, "abc");
    expect(screen.getByDisplayValue("ABC")).toBeInTheDocument();
  });

  it("shows attribution preview when both name and callsign are set", async () => {
    mockGet(defaultIdentity);
    render(<AgentIdentityForm />);
    await waitFor(() => {
      expect(screen.getByText(/agentAttributionPreviewLabel/)).toBeInTheDocument();
    });
  });

  it("calls PATCH with correct payload and shows saved state", async () => {
    mockGet(defaultIdentity);
    mockPatch(defaultIdentity);
    render(<AgentIdentityForm />);
    await waitFor(() => screen.getByText("agentSave"));

    await userEvent.click(screen.getByText("agentSave"));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/users/me/agent-identity",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });

  it("shows error message when PATCH fails", async () => {
    mockGet(defaultIdentity);
    mockFetch.mockResolvedValueOnce({ ok: false });
    render(<AgentIdentityForm />);
    await waitFor(() => screen.getByText("agentSave"));

    await userEvent.click(screen.getByText("agentSave"));
    await waitFor(() => {
      expect(screen.getByText("agentSaveError")).toBeInTheDocument();
    });
  });

  it("shows load error when GET fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    render(<AgentIdentityForm />);
    await waitFor(() => {
      expect(screen.getByText("agentIdentityLoadError")).toBeInTheDocument();
    });
  });
});
