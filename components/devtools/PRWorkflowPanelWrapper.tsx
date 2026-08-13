"use client";

/**
 * Client-only wrapper to avoid hydration mismatch.
 * PRWorkflowPanel is restricted to ADMIN in all environments.
 * Listens for the "pr-workflow:open" CustomEvent dispatched from TopBar.
 *
 * Wraps the panel in an error boundary so a crash inside it cannot
 * propagate to the main app and cause a full-page error.
 */

import { useSyncExternalStore, useState, useEffect, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { PRWorkflowPanel } from "./PRWorkflowPanel";

// subscribe is a no-op: mounted never changes after initial render
function subscribe() {
  return () => {};
}

// ── Minimal error boundary ────────────────────────────────────────────────────

interface BoundaryState { hasError: boolean; message: string }

class PRWorkflowErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, BoundaryState> {
  constructor(props: { children: ReactNode; onReset: () => void }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err: unknown): BoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }

  componentDidCatch(err: unknown, info: ErrorInfo) {
    console.error("[PRWorkflowPanel] Caught by error boundary:", err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            zIndex: 9990,
            backgroundColor: "#1a0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            padding: "12px 16px",
            maxWidth: 360,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
          role="alert"
        >
          <p style={{ margin: 0, fontSize: 13, color: "#fca5a5", fontWeight: 600 }}>
            PR Workflow panel crashed
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>
            {this.state.message}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, message: "" }); this.props.onReset(); }}
            style={{
              marginTop: 4,
              padding: "6px 12px",
              backgroundColor: "#7f1d1d",
              color: "#fecaca",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

interface Props {
  /** When true, render the panel. Should only be true for ADMIN. */
  isAdmin?: boolean;
}

export function PRWorkflowPanelWrapper({ isAdmin = false }: Props) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [isOpen, setIsOpen] = useState(false);

  const shouldShow = mounted && isAdmin;

  useEffect(() => {
    if (!shouldShow) return;

    const onOpen = () => setIsOpen((prev) => !prev);
    window.addEventListener("pr-workflow:open", onOpen);
    return () => window.removeEventListener("pr-workflow:open", onOpen);
  }, [shouldShow]);

  if (!shouldShow || !isOpen) return null;

  return (
    <PRWorkflowErrorBoundary onReset={() => setIsOpen(false)}>
      <PRWorkflowPanel onClose={() => setIsOpen(false)} />
    </PRWorkflowErrorBoundary>
  );
}
