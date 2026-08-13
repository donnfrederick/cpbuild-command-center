"use client";

import { useCallback, useState } from "react";
import type React from "react";

/**
 * Lightweight HTML5 drag-and-drop coordinator for reorderable lists. Returned
 * `getDragProps(index)` gives a child component everything it needs to wire
 * itself up: whether it's currently being dragged, whether a drop indicator
 * should show above or below it, and all the DnD event handlers.
 *
 * Notes:
 * - Uses the native HTML5 drag API, so no dependencies. Works on desktop.
 *   Mobile users should fall back to explicit "move up / move down" buttons
 *   (FormQuestionRow already exposes these).
 * - The whole item element is `draggable={true}` — typing into child inputs /
 *   textareas still works because text-selection inside those elements takes
 *   precedence over card-level drag initiation.
 */
export type DropIndicator = "above" | "below" | null;

export interface SortableItemProps {
  draggable: true;
  isDragging: boolean;
  dropIndicator: DropIndicator;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

export function useSortableList(
  totalItems: number,
  onReorder: (from: number, to: number) => void,
): { getDragProps: (index: number) => SortableItemProps } {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<DropIndicator>(null);

  const reset = useCallback(() => {
    setDraggingIndex(null);
    setDragOverIndex(null);
    setDragPosition(null);
  }, []);

  const getDragProps = useCallback(
    (index: number): SortableItemProps => {
      const isDragging = draggingIndex === index;
      const isOver = dragOverIndex === index && draggingIndex !== index;
      const dropIndicator: DropIndicator = isOver ? dragPosition : null;

      return {
        draggable: true,
        isDragging,
        dropIndicator,

        onDragStart: (e) => {
          setDraggingIndex(index);
          e.dataTransfer.effectAllowed = "move";
          // Firefox requires some data to be set or drag aborts immediately.
          try {
            e.dataTransfer.setData("text/plain", String(index));
          } catch {
            // Some environments throw on setData outside an actual drag op.
          }
        },

        onDragEnter: (e) => {
          e.preventDefault();
        },

        onDragOver: (e) => {
          e.preventDefault();
          if (draggingIndex === null || draggingIndex === index) return;
          const rect = (
            e.currentTarget as HTMLElement
          ).getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          const pos: DropIndicator = e.clientY < midpoint ? "above" : "below";
          if (dragOverIndex !== index) setDragOverIndex(index);
          if (dragPosition !== pos) setDragPosition(pos);
          e.dataTransfer.dropEffect = "move";
        },

        onDragLeave: () => {
          // Intentionally do nothing — dragOver on the next item will update
          // state. Clearing here causes flicker when the cursor crosses the
          // gap between two adjacent rows.
        },

        onDrop: (e) => {
          e.preventDefault();
          if (
            draggingIndex === null ||
            draggingIndex === index ||
            dragPosition === null
          ) {
            reset();
            return;
          }
          const from = draggingIndex;
          let to = dragPosition === "below" ? index + 1 : index;
          // Account for the fact that removing `from` from the array shifts
          // subsequent indices down by one.
          if (from < to) to -= 1;
          if (to < 0) to = 0;
          if (to > totalItems - 1) to = totalItems - 1;
          if (from !== to) onReorder(from, to);
          reset();
        },

        onDragEnd: () => {
          reset();
        },
      };
    },
    [draggingIndex, dragOverIndex, dragPosition, totalItems, onReorder, reset],
  );

  return { getDragProps };
}
