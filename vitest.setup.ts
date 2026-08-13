import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** `server-only` throws outside Next.js; lib imports use it as a bundling guard. */
vi.mock("server-only", () => ({}));

// JSDOM does not implement window.matchMedia — provide a minimal stub so
// components that call matchMedia() (e.g. mobile-viewport detection) don't
// crash in the test environment.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

afterEach(() => {
  cleanup();
});
