"use client";

/**
 * TourCursor — animated agent cursor for the guided tour.
 *
 * Renders a branded CP Build blue pointer that physically demos the app:
 * - Slides smoothly (CSS transition 600ms) to the center of the highlighted
 *   element on each step change.
 * - Shows a click-ripple pulse on arrival.
 * - For cross-page navigation steps: first moves to the sidebar nav link,
 *   fires the click animation, then calls onNavAnimationComplete so TourPlayer
 *   can execute the route change.
 *
 * The cursor is pointer-events:none and lives above all other tour overlays
 * (z-index 1002).
 */

import { useEffect, useRef, useState } from "react";
import type { TourStep } from "./TourPlayer";

interface CursorPendingNav {
  targetPath: string;
  /** CSS selector for the sidebar nav link to click before navigating. */
  navSelector: string;
}

interface TourCursorProps {
  currentStep: TourStep | null;
  /** Set when TourPlayer has a cross-page nav queued — cursor animates here first. */
  pendingNavStep: CursorPendingNav | null;
  /** Called after cursor finishes nav-link animation; TourPlayer then pushes the route. */
  onNavAnimationComplete: () => void;
}

function getElementCenter(selector: string): { x: number; y: number } | null {
  if (!selector || typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
}

/** Inject the cursor ripple keyframe once into document.head. */
function ensureRippleKeyframe() {
  if (typeof document === "undefined") return;
  if (document.getElementById("tour-cursor-style")) return;
  const style = document.createElement("style");
  style.id = "tour-cursor-style";
  style.textContent = `
    @keyframes tourCursorRipple {
      0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0.8; }
      100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export function TourCursor({ currentStep, pendingNavStep, onNavAnimationComplete }: TourCursorProps) {
  // Start offscreen (top-left, at -100,-100) so first entrance is a deliberate slide-in
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [showClick, setShowClick] = useState(false);
  /** Prevents the nav animation from firing twice when deps haven't changed. */
  const navHandledRef = useRef<string | null>(null);

  useEffect(() => {
    ensureRippleKeyframe();
  }, []);

  // Same-page step: animate cursor to highlighted element center
  useEffect(() => {
    if (pendingNavStep) return; // nav animation takes priority
    if (!currentStep?.elementSelector) return;

    const center = getElementCenter(currentStep.elementSelector);
    if (!center) return;

    // Defer position update one frame so React batches it outside the effect body.
    const frame = requestAnimationFrame(() => setPos(center));

    // After CSS transition (~600ms), show click pulse
    const t1 = setTimeout(() => {
      setShowClick(true);
      const t2 = setTimeout(() => setShowClick(false), 420);
      return () => clearTimeout(t2);
    }, 650);

    return () => { cancelAnimationFrame(frame); clearTimeout(t1); };
  }, [currentStep, pendingNavStep]);

  // Cross-page nav: animate to sidebar nav link → click → notify TourPlayer
  useEffect(() => {
    if (!pendingNavStep) {
      navHandledRef.current = null;
      return;
    }
    // Deduplicate — don't re-run for the same pending nav
    const key = `${pendingNavStep.targetPath}:${pendingNavStep.navSelector}`;
    if (navHandledRef.current === key) return;
    navHandledRef.current = key;

    const navCenter = getElementCenter(pendingNavStep.navSelector);
    // Defer position update one frame so React batches it outside the effect body.
    const frame = navCenter ? requestAnimationFrame(() => setPos(navCenter)) : 0;

    // After transition, show click, then tell TourPlayer to navigate
    const t1 = setTimeout(() => {
      setShowClick(true);
      const t2 = setTimeout(() => {
        setShowClick(false);
        onNavAnimationComplete();
      }, 380);
      return () => clearTimeout(t2);
    }, 650);

    return () => { if (frame) cancelAnimationFrame(frame); clearTimeout(t1); };
  }, [pendingNavStep, onNavAnimationComplete]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 1002,
        pointerEvents: "none",
        // Translate the cursor to its target position — CSS handles the animation
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: "transform",
      }}
    >
      {/* Click ripple ring */}
      {showClick && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "2px solid rgba(37, 99, 235, 0.6)",
            backgroundColor: "rgba(37, 99, 235, 0.15)",
            animation: "tourCursorRipple 0.42s ease-out forwards",
          }}
        />
      )}

      {/*
        CP Build branded cursor: standard arrow pointer shape in primary blue
        with white outline. The SVG tip is at (5, 3) so we offset by (-5, -3)
        to align the pointer tip exactly with the target coordinates.
      */}
      <svg
        width="30"
        height="36"
        viewBox="0 0 30 36"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: "block",
          transform: "translate(-5px, -3px)",
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
        }}
      >
        {/* Arrow cursor path — tip at (5,3) */}
        <path
          d="M5 3 L5 27 L11 20 L16 30 L19.5 28 L14.5 18 L22 18 Z"
          fill="#2563eb"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
