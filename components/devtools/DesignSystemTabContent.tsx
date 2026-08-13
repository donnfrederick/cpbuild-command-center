"use client";

import { useState } from "react";
import { DesignSystemEditor } from "./DesignSystemEditor";
import { TokenViewerPanel } from "@/components/dev/TokenViewer";

type SubTab = "editor" | "library";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "editor", label: "Editor" },
  { id: "library", label: "Library" },
];

/** Design System dev tab — token editor + live token/component library. */
export function DesignSystemTabContent() {
  const [subTab, setSubTab] = useState<SubTab>("library");

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
      <div
        role="tablist"
        aria-label="Design system sections"
        style={{
          display: "flex",
          gap: 2,
          padding: "8px var(--space-6)",
          borderBottom: "1px solid var(--color-divider)",
          flexShrink: 0,
          backgroundColor: "var(--neutral-0)",
        }}
      >
        {SUB_TABS.map((t) => {
          const isActive = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSubTab(t.id)}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                fontSize: "var(--text-caption)",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                backgroundColor: isActive ? "var(--color-accent-subtle)" : "transparent",
                color: isActive ? "var(--color-accent-hover)" : "var(--color-text-secondary)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden" role="tabpanel">
        {subTab === "editor" && <DesignSystemEditor />}
        {subTab === "library" && <TokenViewerPanel />}
      </div>
    </div>
  );
}
