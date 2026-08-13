import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "@/components/account/ProfileForm";

vi.mock("next-intl", () => {
  const t = (key: string) => key;
  return { useTranslations: () => t };
});

vi.mock("@/lib/permissions", () => ({
  formatRole: (role: string) => role,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ProfileForm", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const defaultProps = {
    initialName: "Phil Amour",
    email: "phil@cpbuild.com",
    role: "ADMIN" as const,
  };

  it("renders name input pre-filled with initialName", () => {
    render(<ProfileForm {...defaultProps} />);
    expect(screen.getByDisplayValue("Phil Amour")).toBeInTheDocument();
  });

  it("renders with null initialName without crashing", () => {
    render(<ProfileForm {...defaultProps} initialName={null} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows email and role as read-only text", () => {
    render(<ProfileForm {...defaultProps} />);
    expect(screen.getByText("phil@cpbuild.com")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("save button is disabled when name is unchanged", () => {
    render(<ProfileForm {...defaultProps} />);
    expect(screen.getByRole("button", { name: /saveName/i })).toBeDisabled();
  });

  it("save button becomes enabled after typing a different name", async () => {
    render(<ProfileForm {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Phil Updated");
    expect(screen.getByRole("button", { name: /saveName/i })).not.toBeDisabled();
  });

  it("save button is disabled when input is cleared to empty", async () => {
    render(<ProfileForm {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    expect(screen.getByRole("button", { name: /saveName/i })).toBeDisabled();
  });

  it("calls PATCH /api/users/me with trimmed name on save", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "Phil Updated" }) });
    render(<ProfileForm {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Phil Updated");
    await userEvent.click(screen.getByRole("button", { name: /saveName/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/users/me",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Phil Updated" }),
        })
      );
    });
  });

  it("shows saved status after successful PATCH", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "Phil Updated" }) });
    render(<ProfileForm {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Phil Updated");
    await userEvent.click(screen.getByRole("button", { name: /saveName/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /nameSaved/i })).toBeInTheDocument();
    });
  });

  it("shows error message when PATCH fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    render(<ProfileForm {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Phil Updated");
    await userEvent.click(screen.getByRole("button", { name: /saveName/i }));
    await waitFor(() => {
      expect(screen.getByText("nameSaveError")).toBeInTheDocument();
    });
  });

  it("submits on Enter key press", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "Phil Updated" }) });
    render(<ProfileForm {...defaultProps} />);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Phil Updated");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/users/me", expect.objectContaining({ method: "PATCH" }));
    });
  });
});
