"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { GraduationCap } from "lucide-react";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { usePathname } from "@/i18n/navigation";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MobileAccountPanel } from "@/components/layout/MobileAccountPanel";
import { TOUR_USER_UI_ENABLED } from "@/lib/tour-user-ui";

interface TopBarProps {
  name?: string;
  role?: string;
  locale?: string;
  canUseDevTools?: boolean;
}

export function TopBar({ name, role, locale, canUseDevTools = false }: TopBarProps) {
  const t = useTranslations("projects");
  const tTour = useTranslations("tour");
  const pathname = usePathname();

  const openTourPicker = useCallback(() => {
    window.dispatchEvent(new CustomEvent("tour-picker:open"));
  }, []);

  return (
    <header
      className="w-full flex items-center justify-between flex-shrink-0 top-bar"
      style={{
        height: "calc(var(--top-bar-height) + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "var(--space-4)",
        paddingRight: "var(--space-4)",
        backgroundColor: "#FFFFFF",
      }}
    >
      {/* Left — always present as flex spacer; content visible on mobile only */}
      <div className="flex items-center">
        <div className="flex items-center mobile-only" style={{ gap: 6 }}>
          <div style={{ lineHeight: 1.15 }}>
            <span style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#9CA0B3" }}>
              CP Build
            </span>
            <span style={{ display: "block", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", color: "#10122B", whiteSpace: "nowrap" as const }}>
              Field Tracker
            </span>
          </div>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <span className="desktop-only" data-tour="locale-switcher">
          <LocaleSwitcher />
        </span>

        {/* Desktop-only actions — hidden on mobile */}
        <div className="desktop-only items-center gap-2">
          {TOUR_USER_UI_ENABLED ? (
          <button
            type="button"
            aria-label={tTour("takeTourAriaLabel")}
            title={tTour("takeTour")}
            onClick={openTourPicker}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "var(--input-height)",
              height: "var(--input-height)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--neutral-100)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <GraduationCap style={{ width: "var(--icon-size)", height: "var(--icon-size)", color: "var(--neutral-700)" }} />
          </button>
          ) : null}

          {/* Feedback — all users */}
          <FeedbackButton variant="inline" theme="light" />
        </div>

        {/* Bell — desktop only (live NotificationBell with unread count) */}
        <div className="desktop-only" data-tour="notification-bell">
          <NotificationBell />
        </div>

        {/* Mobile: layered account panel (replaces the old avatar dropdown) */}
        {name && (
          <div className="mobile-only">
            <MobileAccountPanel
              name={name}
              role={role ?? ""}
              locale={locale}
              theme="light"
              canUseDevTools={canUseDevTools}
            />
          </div>
        )}
      </div>
    </header>
  );
}
