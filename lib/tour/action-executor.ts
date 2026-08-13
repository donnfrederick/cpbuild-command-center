/**
 * ActionExecutor — runs TourAction sequences for the simulation engine.
 *
 * Each action:
 *   1. Asks the cursor to move to the target element's center
 *   2. Waits for the cursor animation to complete
 *   3. Fires the real DOM event (click, type, scroll, etc.)
 *   4. Waits for the UI to react before continuing
 *
 * All timings are divided by speedMultiplier so 2x speed is twice as fast.
 */

import type { TourAction, CursorActionState } from "./types";

export interface CursorController {
  moveTo: (x: number, y: number, label?: string) => Promise<void>;
  setAction: (action: CursorActionState) => void;
  setLabel: (label: string) => void;
}

export interface ExecutorOptions {
  speedMultiplier: number;
  cursor: CursorController;
  signal?: AbortSignal;
}

// ── Timing helpers ─────────────────────────────────────────────────────────

function scaled(ms: number, multiplier: number, min = 50): number {
  return Math.max(min, ms / multiplier);
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

// ── DOM helpers ────────────────────────────────────────────────────────────

function getCenter(selector: string): { x: number; y: number } | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function simulateClick(selector: string): void {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return;
  el.focus();
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

async function simulateType(
  selector: string,
  text: string,
  clearFirst: boolean,
  opts: ExecutorOptions
): Promise<void> {
  const input = document.querySelector(selector) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  if (!input) return;

  input.focus();

  if (clearFirst) {
    setNativeValue(input, "");
    await wait(scaled(80, opts.speedMultiplier), opts.signal);
  }

  const charDelay = scaled(75, opts.speedMultiplier, 20);

  for (const char of text) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const current = input.value;
    setNativeValue(input, current + char);
    await wait(charDelay, opts.signal);
  }
}

// ── Action runners ─────────────────────────────────────────────────────────

export async function executeAction(
  action: TourAction,
  opts: ExecutorOptions
): Promise<void> {
  const { speedMultiplier, cursor, signal } = opts;

  switch (action.type) {
    case "navigate":
      // Navigation at the step level is handled by the TourContext — skip here
      break;

    case "hover": {
      const pos = getCenter(action.selector);
      if (pos) {
        cursor.setAction("moving");
        cursor.setLabel(action.label ?? "");
        await cursor.moveTo(pos.x, pos.y, action.label ?? "");
        cursor.setAction("idle");
      }
      break;
    }

    case "click": {
      const pos = getCenter(action.selector);
      if (pos) {
        cursor.setAction("moving");
        cursor.setLabel(action.label ?? "Clicking...");
        await cursor.moveTo(pos.x, pos.y, action.label ?? "Clicking...");
        await wait(scaled(120, speedMultiplier), signal);
        cursor.setAction("clicking");
        simulateClick(action.selector);
        await wait(scaled(350, speedMultiplier), signal);
        cursor.setAction("idle");
        cursor.setLabel("");
      }
      break;
    }

    case "type": {
      const pos = getCenter(action.selector);
      if (pos) {
        cursor.setAction("moving");
        cursor.setLabel("Focusing field...");
        await cursor.moveTo(pos.x, pos.y, "Focusing field...");
        await wait(scaled(100, speedMultiplier), signal);
        cursor.setAction("clicking");
        simulateClick(action.selector);
        await wait(scaled(150, speedMultiplier), signal);
        cursor.setAction("typing");
        cursor.setLabel(action.label ?? "Typing...");
        await simulateType(
          action.selector,
          action.text,
          action.clearFirst ?? false,
          opts
        );
        cursor.setAction("idle");
        cursor.setLabel("");
      }
      break;
    }

    case "scroll": {
      const el = document.querySelector(action.selector);
      if (el) {
        el.scrollIntoView({
          behavior: action.behavior ?? "smooth",
          block: "center",
        });
        await wait(scaled(500, speedMultiplier, 200), signal);
      }
      break;
    }

    case "wait": {
      await wait(scaled(action.ms, speedMultiplier), signal);
      break;
    }
  }
}

export async function executeActions(
  actions: TourAction[],
  opts: ExecutorOptions
): Promise<void> {
  for (const action of actions) {
    if (opts.signal?.aborted) break;
    await executeAction(action, opts);
  }
}
