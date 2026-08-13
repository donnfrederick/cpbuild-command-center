import type { CSSProperties, ReactNode } from "react";

interface ProjectHubSectionProps {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function ProjectHubSection({ title, children, style }: ProjectHubSectionProps) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        ...style,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "var(--text-caption)",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--neutral-500)",
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>{children}</div>
    </section>
  );
}
