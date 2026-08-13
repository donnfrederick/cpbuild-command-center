import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/en/projects",
}));

vi.mock("@/components/feedback/FeedbackModal", () => ({
  FeedbackModal: ({
    open,
    onOpenChange,
    pageUrl,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    pageUrl?: string;
  }) => (
    <div data-testid="feedback-modal" data-open={String(open)} data-page-url={pageUrl}>
      {open && (
        <button onClick={() => onOpenChange(false)}>close</button>
      )}
    </div>
  ),
}));

// ── Component import after mocks ───────────────────────────────────────────────

const { FeedbackButton } = await import("@/components/feedback/FeedbackButton");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FeedbackButton — floating variant (default)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the floating button with correct aria-label", () => {
    render(<FeedbackButton />);
    expect(screen.getByRole("button", { name: "buttonLabel" })).toBeInTheDocument();
  });

  it("modal starts closed", () => {
    render(<FeedbackButton />);
    expect(screen.getByTestId("feedback-modal")).toHaveAttribute("data-open", "false");
  });

  it("opens modal when button is clicked", () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByRole("button", { name: "buttonLabel" }));
    expect(screen.getByTestId("feedback-modal")).toHaveAttribute("data-open", "true");
  });

  it("closes modal when modal calls onOpenChange(false)", () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByRole("button", { name: "buttonLabel" }));
    expect(screen.getByTestId("feedback-modal")).toHaveAttribute("data-open", "true");
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByTestId("feedback-modal")).toHaveAttribute("data-open", "false");
  });

  it("passes pageUrl from window.location.href when available", () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByRole("button", { name: "buttonLabel" }));
    const modal = screen.getByTestId("feedback-modal");
    expect(modal.getAttribute("data-page-url")).toBeTruthy();
  });
});

describe("FeedbackButton — inline variant", () => {
  it("renders an icon button when variant is inline", () => {
    render(<FeedbackButton variant="inline" />);
    expect(screen.getByRole("button", { name: "buttonLabel" })).toBeInTheDocument();
  });

  it("opens modal when inline button is clicked", () => {
    render(<FeedbackButton variant="inline" />);
    fireEvent.click(screen.getByRole("button", { name: "buttonLabel" }));
    expect(screen.getByTestId("feedback-modal")).toHaveAttribute("data-open", "true");
  });

  it("renders with light theme without error", () => {
    render(<FeedbackButton variant="inline" theme="light" />);
    expect(screen.getByRole("button", { name: "buttonLabel" })).toBeInTheDocument();
  });

  it("renders as secondary without error", () => {
    render(<FeedbackButton variant="inline" secondary />);
    expect(screen.getByRole("button", { name: "buttonLabel" })).toBeInTheDocument();
  });
});
