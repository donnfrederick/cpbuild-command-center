import type { ReactNode } from "react";

/**
 * Nested scroll container for project workspace pages.
 * #main-content uses overflow:hidden + 100dvh; child routes must scroll here
 * (see UnitsPageClient / MediaPageClient and globals.css [data-project-scroll-root]).
 */
export function ProjectPageScrollArea({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        data-project-scroll-root
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}
