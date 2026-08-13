import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileDrop } from "@/hooks/use-file-drop";

function setDesktopViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === "(min-width: 768px)" ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function makeDragEvent(type: string, files: File[] = []): React.DragEvent<HTMLDivElement> {
  const dataTransfer = {
    types: files.length > 0 ? ["Files"] : [],
    files,
    dropEffect: "none" as DataTransfer["dropEffect"],
  };
  return {
    type,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer,
  } as unknown as React.DragEvent<HTMLDivElement>;
}

describe("useFileDrop()", () => {
  beforeEach(() => {
    setDesktopViewport(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not activate drag state on mobile viewport", () => {
    setDesktopViewport(false);
    const onFiles = vi.fn();
    const { result } = renderHook(() => useFileDrop({ onFiles }));

    act(() => {
      result.current.dropHandlers.onDragEnter(makeDragEvent("dragenter", [new File(["x"], "a.jpg", { type: "image/jpeg" })]));
    });

    expect(result.current.isDragOver).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("calls onFiles when files are dropped on desktop", () => {
    const onFiles = vi.fn();
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const { result } = renderHook(() => useFileDrop({ onFiles, accept: "image/*" }));

    act(() => {
      result.current.dropHandlers.onDragEnter(makeDragEvent("dragenter", [file]));
      result.current.dropHandlers.onDrop(makeDragEvent("drop", [file]));
    });

    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(result.current.isDragOver).toBe(false);
  });

  it("filters rejected files and calls onRejected", () => {
    const onFiles = vi.fn();
    const onRejected = vi.fn();
    const image = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const text = new File(["x"], "b.txt", { type: "text/plain" });
    const { result } = renderHook(() =>
      useFileDrop({ onFiles, onRejected, accept: "image/*" }),
    );

    act(() => {
      result.current.dropHandlers.onDrop(makeDragEvent("drop", [image, text]));
    });

    expect(onFiles).toHaveBeenCalledWith([image]);
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it("is inactive when disabled", () => {
    const onFiles = vi.fn();
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const { result } = renderHook(() => useFileDrop({ onFiles, disabled: true }));

    act(() => {
      result.current.dropHandlers.onDrop(makeDragEvent("drop", [file]));
    });

    expect(onFiles).not.toHaveBeenCalled();
  });
});
