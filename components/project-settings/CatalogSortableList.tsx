"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useSortableList, type SortableItemProps } from "@/components/forms/useSortableList";

interface CatalogSortableRowProps {
  dragProps: SortableItemProps;
  dragHandleAriaLabel: string;
  opacity?: number;
  showMoveButtons?: boolean;
  moveUpAriaLabel: string;
  moveDownAriaLabel: string;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: ReactNode;
}

function DropIndicatorLine({ position }: { position: "above" | "below" }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        [position === "above" ? "top" : "bottom"]: position === "above" ? -2 : -5,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: "var(--primary-500)",
        borderRadius: 2,
        boxShadow: "var(--shadow-1)",
        pointerEvents: "none",
      }}
    />
  );
}

export function CatalogSortableRow({
  dragProps,
  dragHandleAriaLabel,
  opacity = 1,
  showMoveButtons = false,
  moveUpAriaLabel,
  moveDownAriaLabel,
  moveUpDisabled = false,
  moveDownDisabled = false,
  onMoveUp,
  onMoveDown,
  children,
}: CatalogSortableRowProps) {
  const {
    draggable,
    isDragging,
    dropIndicator,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  } = dragProps;

  return (
    <div
      style={{ position: "relative" }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dropIndicator === "above" && <DropIndicatorLine position="above" />}
      {dropIndicator === "below" && <DropIndicatorLine position="below" />}
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--color-surface)",
          opacity: isDragging ? 0.45 : opacity,
          transition: "opacity 0.15s",
        }}
      >
        <span
          aria-label={dragHandleAriaLabel}
          title={dragHandleAriaLabel}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            flexShrink: 0,
            color: "var(--neutral-400)",
            cursor: "grab",
            userSelect: "none",
          }}
        >
          <GripVertical size={16} aria-hidden />
        </span>
        {children}
        {showMoveButtons && (
          <>
            <button
              type="button"
              aria-label={moveUpAriaLabel}
              disabled={moveUpDisabled}
              onClick={onMoveUp}
              style={{ width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
            >
              <ArrowUp size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={moveDownAriaLabel}
              disabled={moveDownDisabled}
              onClick={onMoveDown}
              style={{ width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
            >
              <ArrowDown size={16} aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface CatalogSortableListProps {
  itemCount: number;
  onReorder: (from: number, to: number) => void;
  children: (getDragProps: (index: number) => SortableItemProps, isMobile: boolean) => ReactNode;
}

export function CatalogSortableList({
  itemCount,
  onReorder,
  children,
}: CatalogSortableListProps) {
  const { getDragProps } = useSortableList(itemCount, onReorder);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {children(getDragProps, isMobile)}
    </div>
  );
}

export { useSortableList };