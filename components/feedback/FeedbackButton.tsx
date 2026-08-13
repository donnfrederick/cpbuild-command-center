"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { MessageSquareHeart } from "lucide-react";
import { FeedbackModal } from "./FeedbackModal";

interface FeedbackButtonProps {
  /**
   * "floating" (default) — fixed bottom-right corner pill button.
   * "inline" — icon button meant to be placed directly inside a top bar or toolbar.
   */
  variant?: "floating" | "inline";
  /**
   * Only applies when variant="inline".
   * "dark" (default) — white icon on transparent, for dark-background top bars (e.g. ProjectTopBar).
   * "light" — neutral-700 icon on transparent, for light-background top bars (e.g. TopBar).
   */
  theme?: "light" | "dark";
  /**
   * When true, renders the inline button at reduced opacity to signal it is a
   * secondary / tertiary action (e.g. when placed after a primary nav link).
   */
  secondary?: boolean;
}

/**
 * Feedback button + modal.
 *
 * variant="floating" (default): fixed to the bottom-right corner, visible
 *   across the entire app outside the layout scroll context.
 * variant="inline": renders as a plain icon button with no fixed positioning,
 *   intended to be placed directly inside a top bar or toolbar.
 */
export function FeedbackButton({ variant = "floating", theme = "dark", secondary = false }: FeedbackButtonProps) {
  const t = useTranslations("feedback");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "floating" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("buttonLabel")}
          title={t("buttonLabel")}
          data-tour="feedback-button"
          className={[
            "fixed bottom-20 right-4 z-40",
            "flex items-center gap-1.5",
            "rounded-full bg-[var(--primary-500)] text-white shadow-lg",
            "px-3 py-2 text-xs font-medium",
            "transition-all hover:bg-[var(--primary-700)] hover:shadow-xl active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-500)] focus-visible:ring-offset-2",
            // On desktop (sidebar present) keep it clear of nav — still bottom-right
            "md:bottom-6 md:right-6",
          ].join(" ")}
        >
          <MessageSquareHeart size={16} />
          <span className="hidden sm:inline">{t("buttonLabel")}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("buttonLabel")}
          title={t("buttonLabel")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: !secondary ? 6 : 0,
            height: 34,
            padding: !secondary ? "0 12px 0 10px" : "0 8px",
            borderRadius: "var(--radius-sm)",
            border: "none",
            backgroundColor: secondary
              ? "transparent"
              : theme === "light"
                ? "var(--color-secondary-subtle)"
                : "rgba(255,255,255,0.15)",
            color: secondary
              ? (theme === "light" ? "var(--neutral-350)" : "rgba(255,255,255,0.27)")
              : (theme === "light" ? "var(--blue-700)" : "#fff"),
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.01em",
            cursor: "pointer",
            transition: "background-color 0.15s, color 0.15s",
            boxShadow: "none",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            if (!secondary) {
              e.currentTarget.style.backgroundColor = theme === "light"
                ? "var(--blue-100)"
                : "rgba(255,255,255,0.25)";
              if (theme === "light")
                e.currentTarget.style.color = "var(--blue-700)";
            } else {
              e.currentTarget.style.color = theme === "light"
                ? "var(--neutral-500)"
                : "rgba(255,255,255,0.50)";
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.10)";
            }
          }}
          onMouseLeave={(e) => {
            if (!secondary) {
              e.currentTarget.style.backgroundColor = theme === "light"
                ? "var(--color-secondary-subtle)"
                : "rgba(255,255,255,0.15)";
              if (theme === "light")
                e.currentTarget.style.color = "var(--blue-700)";
            } else {
              e.currentTarget.style.color = theme === "light"
                ? "var(--neutral-350)"
                : "rgba(255,255,255,0.27)";
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <MessageSquareHeart size={15} aria-hidden />
          {!secondary && (
            <span style={{ lineHeight: 1 }}>{t("buttonLabel")}</span>
          )}
        </button>
      )}

      <FeedbackModal
        open={open}
        onOpenChange={setOpen}
        pageUrl={typeof window !== "undefined" ? window.location.href : pathname}
      />
    </>
  );
}
