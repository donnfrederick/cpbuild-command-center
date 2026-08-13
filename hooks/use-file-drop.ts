"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { filterFilesByAccept } from "@/lib/filter-files-by-accept";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

function subscribeDesktopViewport(cb: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }
  mq.addListener(cb);
  return () => mq.removeListener(cb);
}

function getDesktopViewportSnapshot(): boolean {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getDesktopViewportServerSnapshot(): boolean {
  return false;
}

export function useIsDesktopViewport(): boolean {
  return useSyncExternalStore(
    subscribeDesktopViewport,
    getDesktopViewportSnapshot,
    getDesktopViewportServerSnapshot,
  );
}

export interface UseFileDropOptions {
  onFiles: (files: File[]) => void;
  onRejected?: () => void;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
}

export interface FileDropHandlers {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function useFileDrop({
  onFiles,
  onRejected,
  disabled = false,
  accept,
  multiple = true,
}: UseFileDropOptions): { isDragOver: boolean; dropHandlers: FileDropHandlers; isDesktop: boolean } {
  const isDesktop = useIsDesktopViewport();
  const active = isDesktop && !disabled;
  const dragCounterRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDragOver(false);
  }, []);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragOver(true);
      }
    },
    [active],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    [active],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        resetDragState();
      }
    },
    [active, resetDragState],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      resetDragState();

      const dropped = Array.from(e.dataTransfer.files ?? []);
      if (dropped.length === 0) return;

      const { accepted, rejected } = filterFilesByAccept(dropped, accept);
      if (rejected.length > 0) {
        onRejected?.();
      }
      if (accepted.length === 0) return;

      onFiles(multiple ? accepted : accepted.slice(0, 1));
    },
    [accept, active, multiple, onFiles, onRejected, resetDragState],
  );

  const noop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const dropHandlers: FileDropHandlers = active
    ? { onDragEnter, onDragOver, onDragLeave, onDrop }
    : { onDragEnter: noop, onDragOver: noop, onDragLeave: noop, onDrop: noop };

  return {
    isDragOver: active && isDragOver,
    dropHandlers,
    isDesktop,
  };
}
