"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatRole } from "@/lib/permissions";
import type { RolePreviewContext } from "@/lib/role-preview";

interface Props {
  rolePreview: RolePreviewContext;
}

/**
 * RolePreviewBanner — displayed when a privileged user is previewing the dashboard
 * as a different role (ADMIN, DESIGNER, or DEVELOPER only).
 *
 * Renders a prominent blue strip with the active preview role and an "Exit preview"
 * button. Calls DELETE /api/admin/role-preview on exit, then refreshes the page
 * so the layout re-renders with the real session role.
 */
export function RolePreviewBanner({ rolePreview }: Props) {
  const t = useTranslations("rolePreview");
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  async function handleExit() {
    setIsExiting(true);
    try {
      const res = await fetch("/api/admin/role-preview", { method: "DELETE" });
      if (!res.ok) {
        console.error("[RolePreviewBanner] exit failed", await res.text());
      }
    } catch (err) {
      console.error("[RolePreviewBanner] exit error", err);
    } finally {
      // Always refresh — cookie will be cleared server-side regardless
      router.refresh();
    }
  }

  return (
    <div
      role="status"
      aria-label={t("bannerLabel")}
      aria-live="polite"
      style={{
        backgroundColor: "var(--dev-purple)",
        color: "var(--neutral-0)",
        borderBottom: "3px solid var(--dev-purple-dark)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          padding: "var(--space-2) var(--space-6)",
          flexWrap: "wrap",
        }}
      >
        {/* Left: preview info */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          {/* Eye icon */}
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>

          <span style={{ fontSize: "var(--text-body)", fontWeight: "var(--font-weight-semibold)" }}>
            {t("previewingAs")}
          </span>

          {/* Role pill */}
          <span
            style={{
              fontSize: "var(--text-caption)",
              fontWeight: "var(--font-weight-semibold)",
              padding: "2px var(--space-2)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(255,255,255,0.20)",
              border: "1px solid rgba(255,255,255,0.35)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {formatRole(rolePreview.previewRole)}
          </span>

          <span
            style={{
              fontSize: "var(--text-caption)",
              opacity: 0.8,
              whiteSpace: "nowrap",
            }}
          >
            {t("yourRoleIs", { role: formatRole(rolePreview.realRole) })}
          </span>
        </div>

        {/* Right: exit button */}
        <button
          onClick={handleExit}
          disabled={isExiting}
          aria-label={isExiting ? t("exitingLabel") : t("exitPreview")}
          style={{
            fontSize: "var(--text-caption)",
            fontWeight: "var(--font-weight-semibold)",
            padding: "var(--space-1) var(--space-4)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(255,255,255,0.45)",
            backgroundColor: "rgba(255,255,255,0.12)",
            color: "var(--neutral-0)",
            cursor: isExiting ? "not-allowed" : "pointer",
            opacity: isExiting ? 0.6 : 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
            transition: "background-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!isExiting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.25)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.12)";
          }}
        >
          {isExiting ? t("exitingLabel") : t("exitPreview")}
        </button>
      </div>
    </div>
  );
}
