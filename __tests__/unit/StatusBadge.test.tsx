import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";

const messages = {
  status: {
    Active: "Active",
    Completed: "Completed",
    Planning: "Planning",
    "On Hold": "On Hold",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("StatusBadge", () => {
  it("renders translated label when label matches a lifecycle key", () => {
    render(<StatusBadge label="Active" lifecycleStatus="Active" />, { wrapper: Wrapper });
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders Completed", () => {
    render(<StatusBadge label="Completed" lifecycleStatus="Completed" />, { wrapper: Wrapper });
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders Planning", () => {
    render(<StatusBadge label="Planning" lifecycleStatus="Planning" />, { wrapper: Wrapper });
    expect(screen.getByText("Planning")).toBeInTheDocument();
  });

  it("renders On Hold", () => {
    render(<StatusBadge label="On Hold" lifecycleStatus="On Hold" />, { wrapper: Wrapper });
    expect(screen.getByText("On Hold")).toBeInTheDocument();
  });

  it("shows arbitrary Unifier phase text and uses lifecycle for styling", () => {
    render(<StatusBadge label="Bid" lifecycleStatus="Active" />, { wrapper: Wrapper });
    expect(screen.getByText("Bid")).toBeInTheDocument();
  });

  it("shows em dash when label is empty", () => {
    render(<StatusBadge label="   " lifecycleStatus="Planning" />, { wrapper: Wrapper });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  describe("phase-keyword color mapping", () => {
    it("renders Construction with success (green) colors", () => {
      render(<StatusBadge label="Construction" lifecycleStatus="Planning" />, { wrapper: Wrapper });
      const badge = screen.getByText("Construction");
      expect(badge).toHaveStyle({
        color: "var(--color-secondary-hover)",
        backgroundColor: "var(--color-secondary-subtle)",
      });
    });

    it("renders Production with success (green) colors", () => {
      render(<StatusBadge label="Production" lifecycleStatus="Planning" />, { wrapper: Wrapper });
      const badge = screen.getByText("Production");
      expect(badge).toHaveStyle({
        color: "var(--color-secondary-hover)",
        backgroundColor: "var(--color-secondary-subtle)",
      });
    });

    it("renders Shipping with primary (blue) colors", () => {
      render(<StatusBadge label="Shipping" lifecycleStatus="Planning" />, { wrapper: Wrapper });
      const badge = screen.getByText("Shipping");
      expect(badge).toHaveStyle({
        color: "var(--color-accent-hover)",
        backgroundColor: "var(--color-accent-subtle)",
      });
    });

    it("renders Pre-Con (Submittals) with warning (yellow) colors", () => {
      render(<StatusBadge label="Pre-Con (Submittals)" lifecycleStatus="Planning" />, { wrapper: Wrapper });
      const badge = screen.getByText("Pre-Con (Submittals)");
      expect(badge).toHaveStyle({ color: "var(--amber-700)", backgroundColor: "var(--amber-100)" });
    });

    it("renders Closeout with neutral (gray) colors", () => {
      render(<StatusBadge label="Closeout" lifecycleStatus="Planning" />, { wrapper: Wrapper });
      const badge = screen.getByText("Closeout");
      expect(badge).toHaveStyle({
        color: "var(--color-text-tertiary)",
        backgroundColor: "var(--color-surface-sunken)",
      });
    });

    it("renders On Hold phase label with error (red) colors", () => {
      render(<StatusBadge label="On Hold" lifecycleStatus="On Hold" />, { wrapper: Wrapper });
      const badge = screen.getByText("On Hold");
      expect(badge).toHaveStyle({
        color: "var(--color-error)",
        backgroundColor: "var(--color-error-subtle)",
      });
    });

    it("phase keyword takes priority over lifecycleStatus fallback", () => {
      // lifecycleStatus=Planning would normally give warning yellow, but "Shipping" → accent blue
      render(<StatusBadge label="Shipping" lifecycleStatus="Planning" />, { wrapper: Wrapper });
      const badge = screen.getByText("Shipping");
      expect(badge).toHaveStyle({ color: "var(--color-accent-hover)" });
    });

    it("falls back to lifecycleStatus color when label has no matching keyword", () => {
      render(<StatusBadge label="Unknown Phase" lifecycleStatus="Active" />, { wrapper: Wrapper });
      const badge = screen.getByText("Unknown Phase");
      expect(badge).toHaveStyle({ color: "var(--green-600)", backgroundColor: "var(--green-100)" });
    });
  });
});
