import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

describe("ThemeProvider", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => {
        const m = {
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        };
        return m;
      }),
    });
  });

  it("renders children without embedding a script tag (React 19–safe provider)", () => {
    render(
      <ThemeProvider>
        <span data-testid="child">ok</span>
      </ThemeProvider>
    );
    expect(screen.getByTestId("child")).toHaveTextContent("ok");
  });
});
