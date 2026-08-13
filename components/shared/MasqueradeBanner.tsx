"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatRole } from "@/lib/permissions";
import type { MasqueradeContext } from "@/lib/masquerade";

interface Props {
  masquerade: MasqueradeContext;
}

/**
 * MasqueradeBanner — displayed when an ADMIN is actively masquerading.
 *
 * Renders a prominent amber strip with target user info and an "Exit Masquerade"
 * button. Calls DELETE /api/admin/masquerade on exit, then refreshes the page
 * so the layout re-renders with the real admin session.
 */
export function MasqueradeBanner({ masquerade }: Props) {
  const t = useTranslations("masquerade");
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  async function handleExit() {
    setIsExiting(true);
    try {
      const res = await fetch("/api/admin/masquerade", { method: "DELETE" });
      if (!res.ok) {
        console.error("[MasqueradeBanner] exit failed", await res.text());
      }
    } catch (err) {
      console.error("[MasqueradeBanner] exit error", err);
    } finally {
      // Always refresh — cookie will be cleared server-side regardless
      router.refresh();
    }
  }

  return (
    <div
      role="alert"
      aria-label={t("bannerLabel")}
      style={{
        backgroundColor: "var(--warning-600)",
        color: "var(--neutral-0)",
        borderBottom: "2px solid var(--warning-600)",
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
        {/* Left: masquerade info */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          {/* Warning icon */}
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
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>

          <span style={{ fontSize: "var(--text-body)", fontWeight: "var(--font-weight-semibold)" }}>
            {t("viewingAs")}
          </span>

          <span
            style={{
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-bold)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {masquerade.targetUserName ?? masquerade.targetUserEmail}
          </span>

          {/* Role pill */}
          <span
            style={{
              fontSize: "var(--text-caption)",
              fontWeight: "var(--font-weight-semibold)",
              padding: "2px var(--space-2)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(0,0,0,0.25)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {formatRole(masquerade.targetUserRole)}
          </span>

          <span
            style={{
              fontSize: "var(--text-caption)",
              opacity: 0.8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {masquerade.targetUserEmail}
          </span>
        </div>

        {/* Right: exit button */}
        <button
          onClick={handleExit}
          disabled={isExiting}
          aria-label={isExiting ? t("exitingLabel") : t("exitButton")}
          style={{
            fontSize: "var(--text-caption)",
            fontWeight: "var(--font-weight-semibold)",
            padding: "var(--space-1) var(--space-4)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(255,255,255,0.6)",
            backgroundColor: "rgba(0,0,0,0.2)",
            color: "var(--neutral-0)",
            cursor: isExiting ? "not-allowed" : "pointer",
            opacity: isExiting ? 0.6 : 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
            transition: "background-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!isExiting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(0,0,0,0.35)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(0,0,0,0.2)";
          }}
        >
          {isExiting ? t("exitingLabel") : t("exitButton")}
        </button>
      </div>
    </div>
  );
}
