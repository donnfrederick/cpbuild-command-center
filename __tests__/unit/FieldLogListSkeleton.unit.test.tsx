import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldLogListSkeleton } from "@/components/projects/FieldLogListSkeleton";

describe("FieldLogListSkeleton", () => {
  it("renders an accessible busy status with sr-only loading label", () => {
    const { container } = render(
      <FieldLogListSkeleton loadingLabel="Loading issues…" embeddedInFieldReports />,
    );

    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(screen.getByText("Loading issues…")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(10);
  });

  it("renders standalone chrome when requested", () => {
    const { container } = render(
      <FieldLogListSkeleton
        loadingLabel="Loading observations…"
        showStandaloneChrome
      />,
    );

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(14);
  });
});
