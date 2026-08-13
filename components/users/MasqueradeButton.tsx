"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
}

/**
 * MasqueradeButton — shown in the user row on the Users page for ADMIN only.
 * Calls POST /api/admin/masquerade to start the session, then refreshes the page
 * so the layout re-renders with the target user's identity.
 */
export function MasqueradeButton({ userId, userName, userEmail }: Props) {
  const t = useTranslations("masquerade");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleMasquerade() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/masquerade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[MasqueradeButton] failed to start:", data);
        return;
      }

      // Refresh to trigger layout re-render with masquerade context
      router.refresh();
    } catch (err) {
      console.error("[MasqueradeButton] error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const displayName = userName ?? userEmail;

  return (
    <button
      onClick={handleMasquerade}
      disabled={isLoading}
      title={t("maskAsTitle", { name: displayName })}
      aria-label={t("maskAsTitle", { name: displayName })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        fontSize: "var(--text-caption)",
        fontWeight: "var(--font-weight-semibold)",
        padding: "var(--space-1) var(--space-2)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--warning-600)",
        backgroundColor: "var(--warning-100)",
        color: "var(--warning-600)",
        cursor: isLoading ? "not-allowed" : "pointer",
        opacity: isLoading ? 0.6 : 1,
        whiteSpace: "nowrap",
        transition: "background-color 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!isLoading) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--warning-600)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--neutral-0)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--warning-100)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--warning-600)";
      }}
    >
      {/* Mask icon */}
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      {isLoading ? "…" : t("maskAsButton")}
    </button>
  );
}
