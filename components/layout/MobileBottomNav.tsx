"use client";

// IMPORTANT — PRODUCT INVARIANT (Hannah, repeatedly):
// The Feedback page ("Submit Feedback" / /feedback) MUST NOT appear in the
// mobile bottom nav. It lives ONLY in the profile-icon menu in the top-right
// (MobileAccountPanel). Do not add a feedback item back here — no matter
// how small, no matter what permission gate. See
// docs/design/NAV_INVARIANTS.md and .cursor/rules/nav-invariants.mdc.

import { useTranslations } from "next-intl";
import { NavLink } from "@/components/navigation/nav-link";
import { usePathname } from "@/i18n/navigation";
import { FolderKanban, Users, ClipboardList, BarChart3 } from "lucide-react";
import { useReportsOfflineBlock } from "@/hooks/use-reports-offline-block";

interface MobileBottomNavProps {
  canViewUsers?: boolean;
  /**
   * Kept in the props API for backwards compat with the layout, but the
   * feedback page is never rendered in the bottom nav — it lives in the
   * profile-icon menu only. See header comment above.
   */
  canViewFeedback?: boolean;
  canManageForms?: boolean;
}

export function MobileBottomNav({
  canViewUsers = true,
  canManageForms = false,
}: MobileBottomNavProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { isReportsNavBlocked, onReportsNavClick } = useReportsOfflineBlock();

  const NAV_ITEMS = [
    { id: "projects", labelKey: "projects" as const, icon: FolderKanban, href: "/projects" as const, exact: false },
    { id: "reports", labelKey: "reports" as const, icon: BarChart3, href: "/reports" as const, exact: false },
    ...(canManageForms
      ? [{ id: "forms", labelKey: "forms" as const, icon: ClipboardList, href: "/forms" as const, exact: false }]
      : []),
    ...(canViewUsers
      ? [{ id: "users", labelKey: "users" as const, icon: Users, href: "/users" as const, exact: false }]
      : []),
  ];

  return (
    // Fixed wrapper: the pill floats over page content without a full-width frame.
    <nav
      id="mobile-bottom-nav"
      aria-label={t("mainNav")}
      style={{
        display: "none", // shown via CSS on mobile
        position: "fixed",
        left: 16,
        right: 16,
        bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        zIndex: 80,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "transparent",
        padding: 0,
        flexShrink: 0,
        width: "auto",
        pointerEvents: "none",
      }}
    >
      {/* White pill */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-pill)",
          padding: "8px 4px",
          boxShadow: "0 8px 32px rgba(16,18,43,0.14)",
          pointerEvents: "auto",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          const reportsBlocked = item.id === "reports" && isReportsNavBlocked;

          return (
            <NavLink
              key={item.id}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-disabled={reportsBlocked || undefined}
              data-tour={`nav-${item.id}`}
              onClick={item.id === "reports" ? onReportsNavClick : undefined}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                textDecoration: "none",
                padding: "6px 12px",
                position: "relative",
                color: isActive ? "var(--color-accent)" : "var(--color-text-disabled)",
                opacity: reportsBlocked ? 0.45 : 1,
                cursor: reportsBlocked ? "not-allowed" : undefined,
              }}
            >
              {/* Orange dot indicator above active icon */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: "var(--color-accent)",
                  opacity: isActive ? 1 : 0,
                  transition: "opacity 150ms",
                }}
              />
              <Icon size={20} aria-hidden style={{ flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: "0.04em",
                }}
              >
                {t(item.labelKey)}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
