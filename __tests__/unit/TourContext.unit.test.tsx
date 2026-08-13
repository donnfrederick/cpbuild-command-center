import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TourProvider } from "@/components/tour/TourContext";

describe("TourProvider", () => {
  it("renders children transparently", () => {
    render(
      <TourProvider>
        <span>Hello from child</span>
      </TourProvider>
    );
    expect(screen.getByText("Hello from child")).toBeInTheDocument();
  });

  it("renders multiple children", () => {
    render(
      <TourProvider>
        <span>Child 1</span>
        <span>Child 2</span>
      </TourProvider>
    );
    expect(screen.getByText("Child 1")).toBeInTheDocument();
    expect(screen.getByText("Child 2")).toBeInTheDocument();
  });
});
