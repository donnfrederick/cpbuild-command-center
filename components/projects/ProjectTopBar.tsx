"use client";

import { useTranslations } from "next-intl";
import { NavLink } from "@/components/navigation/nav-link";
import { ArrowLeft } from "lucide-react";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { MobileAccountPanel } from "@/components/layout/MobileAccountPanel";

interface ProjectTopBarProps {
  projectName: string;
  /** Authenticated user's display name (for mobile account panel) */
  name?: string;
  /** Authenticated user's formatted role (for mobile account panel) */
  role?: string;
  /** Current locale code, e.g. "en" or "es" */
  locale?: string;
  /** When true, shows a Dev Tools entry in the mobile profile panel. */
  canUseDevTools?: boolean;
}

export function ProjectTopBar({ projectName, name, role, locale, canUseDevTools = false }: ProjectTopBarProps) {
  const t = useTranslations("projects");

  return (
    <header
      style={{
        backgroundColor: "var(--color-surface-dark)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        height: "calc(var(--top-bar-height) + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
        flexShrink: 0,
        paddingLeft: "var(--page-padding-x)",
        paddingRight: "var(--page-padding-x)",
        boxShadow: "0 4px 16px rgba(16,18,43,0.22)",
        userSelect: "none",
        position: "relative",
        zIndex: 10,
      }}
      className="project-top-bar"
      aria-label={t("projectContextBarAria")}
    >
      {/* Left — back link + project name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        <NavLink
          href="/projects"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
            height: 32,
            padding: "0 10px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "rgba(255,255,255,0.6)",
            textDecoration: "none",
            borderRadius: 99,
            transition: "color 0.15s, background-color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,1)";
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.10)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.6)";
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <ArrowLeft size={13} aria-hidden />
          {t("backToProjects")}
        </NavLink>

        <span
          style={{
            fontSize: "var(--text-body)",
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--color-text-inverse)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {projectName}
        </span>
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", flexShrink: 0 }}>
        {/* Desktop: standalone feedback button */}
        <span className="desktop-only">
          <FeedbackButton variant="inline" theme="dark" />
        </span>

        {/* Mobile: account panel */}
        {name && (
          <span className="mobile-only">
            <MobileAccountPanel name={name} role={role ?? ""} locale={locale} theme="dark" canUseDevTools={canUseDevTools} />
          </span>
        )}
      </div>
    </header>
  );
}
