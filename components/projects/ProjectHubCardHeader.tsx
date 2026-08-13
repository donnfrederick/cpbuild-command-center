import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export const PROJECT_HUB_CARD_STYLE: CSSProperties = {
  padding: "var(--space-3)",
  backgroundColor: "var(--color-surface)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
};

interface ProjectHubCardHeaderProps {
  icon: LucideIcon;
  title: string;
  actions?: ReactNode;
  marginBottom?: number | string;
}

export function ProjectHubCardHeader({
  icon: Icon,
  title,
  actions,
  marginBottom = 10,
}: ProjectHubCardHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom }}>
      <Icon size={18} aria-hidden style={{ color: "var(--primary-600)", flexShrink: 0 }} />
      <h3
        style={{
          flex: 1,
          margin: 0,
          fontSize: "var(--text-body)",
          fontWeight: 600,
          color: "var(--neutral-900)",
          minWidth: 0,
          lineHeight: 1.25,
        }}
      >
        {title}
      </h3>
      {actions ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>{actions}</div>
      ) : null}
    </div>
  );
}
