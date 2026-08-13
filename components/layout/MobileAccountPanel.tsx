"use client";

/**
 * MobileAccountPanel — layered slide-out panel for mobile.
 *
 * Tap the account icon → Panel 1 (menu) slides in from right.
 * Tap a menu row → Panel 2 (sub-panel) slides over Panel 1.
 * Tap ← Back → sub-panel slides back out to menu.
 *
 * Hosts: Notifications, Submit Feedback, Account Profile.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  User, Bell, MessageSquareHeart, ChevronRight, ArrowLeft,
  X, LogOut, GraduationCap, Globe, CheckCheck, Loader2, SlidersHorizontal,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { NotificationCard, type NotificationItem } from "@/components/notifications/NotificationCard";
import { useFeedbackRecording } from "@/components/feedback/FeedbackRecordingContext";
import { TOUR_USER_UI_ENABLED } from "@/lib/tour-user-ui";

// ── Feedback form inline ──────────────────────────────────────────────────────
// We embed just the form fields, not the full FeedbackModal dialog shell.
import { FeedbackFormInline } from "@/components/feedback/FeedbackFormInline";

const POLL_INTERVAL_MS = 60_000;

async function loadNotifications(): Promise<NotificationItem[]> {
  const res = await fetch("/api/notifications");
  if (!res.ok) return [];
  return res.json() as Promise<NotificationItem[]>;
}

type View = "closed" | "menu" | "notifications" | "feedback" | "profile";

interface MobileAccountPanelProps {
  name: string;
  role: string;
  locale?: string;
  theme?: "light" | "dark";
  /** When true, shows a "Dev Tools" row that opens the dev tools panel. */
  canUseDevTools?: boolean;
}

const ANIM_MS = 220;

const CSS = `
  @keyframes map-slide-in  { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes map-slide-out { from { transform: translateX(0); }    to { transform: translateX(100%); } }
  .map-panel {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: min(340px, 100vw);
    background: var(--color-surface);
    box-shadow: var(--shadow-modal);
    display: flex; flex-direction: column;
    z-index: 600;
    overflow: hidden;
  }
  .map-panel.map-in  { animation: map-slide-in  ${ANIM_MS}ms cubic-bezier(0.32,0.72,0,1) both; }
  .map-panel.map-out { animation: map-slide-out ${ANIM_MS}ms cubic-bezier(0.32,0.72,0,1) both; }
  .map-menu-row {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 20px; border: none; background: transparent;
    width: 100%; cursor: pointer; text-align: left;
    border-bottom: 1px solid var(--color-divider);
    color: var(--color-text-primary); font-size: 15px; font-weight: 700;
    letter-spacing: var(--tracking-ui);
    transition: background-color 0.12s;
  }
  .map-menu-row:hover  { background: var(--color-surface-sunken); }
  .map-sub-header {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--color-divider);
    flex-shrink: 0;
  }
  .map-notif-list { flex: 1; overflow-y: auto; }
`;


export function MobileAccountPanel({ name, role, locale, theme = "light", canUseDevTools = false }: MobileAccountPanelProps) {
  const t = useTranslations("projects");
  const tAuth = useTranslations("auth");
  const tTour = useTranslations("tour");
  const tFeedback = useTranslations("feedback");
  const tNotif = useTranslations("notifications");
  const tCommon = useTranslations("common");

  const isBrowser = useIsBrowser();
  const pathname = usePathname();

  const [view, setView] = useState<View>("closed");
  const [exiting, setExiting] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  /**
   * Read recording state from the global context so this component knows when
   * to hide the backdrop (allowing the user to navigate while recording).
   * The floating pill is rendered by FeedbackRecordingContext itself — not here.
   */
  const { recordingState, pendingFeedbackOpen, clearPendingFeedbackOpen } = useFeedbackRecording();
  const recordingActive = recordingState === "recording";

  // When recording stops (from the pill or OS stop), auto-open the feedback
  // sub-panel so the user can submit their recording immediately.
  // If this panel isn't mounted (e.g. user is on projects/[id]), the flag
  // persists in context and triggers on next mount.
  useEffect(() => {
    if (!pendingFeedbackOpen || !isBrowser) return;
    setView("feedback");
    clearPendingFeedbackOpen();
  }, [pendingFeedbackOpen, isBrowser, clearPendingFeedbackOpen]);

  const panelRef = useRef<HTMLDivElement>(null);

  // Release focus from the hidden dialog while recording so keyboard users aren't trapped.
  useEffect(() => {
    if (!recordingActive || !panelRef.current) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && panelRef.current.contains(active)) {
      active.blur();
    }
  }, [recordingActive]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Poll notifications
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await loadNotifications();
        if (!cancelled) setNotifications(data);
      } catch { /* ignore */ }
    }
    void poll();
    const timer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Refresh notifications when notifications sub-panel opens
  useEffect(() => {
    if (view !== "notifications") return;
    let cancelled = false;
    setNotifLoading(true);
    void loadNotifications()
      .then((d) => { if (!cancelled) setNotifications(d); })
      .catch(() => null)
      .finally(() => { if (!cancelled) setNotifLoading(false); });
    return () => { cancelled = true; };
  }, [view]);

  // Close on Escape
  useEffect(() => {
    if (view === "closed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const closeAll = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setView("closed");
      setExiting(false);
    }, ANIM_MS);
  }, []);

  const openTourPicker = useCallback(() => {
    closeAll();
    setTimeout(() => window.dispatchEvent(new CustomEvent("tour-picker:open")), ANIM_MS + 50);
  }, [closeAll]);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try { await fetch(`/api/notifications/${id}`, { method: "PATCH" }); } catch { /* ignore */ }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await fetch("/api/notifications/mark-all-read", { method: "POST" }); } catch { /* ignore */ }
  }

  // ── Trigger button ─────────────────────────────────────────────────────────
  const isDark = theme === "dark";
  const triggerBg = isDark ? "rgba(255,255,255,0.15)" : "var(--color-surface-sunken)";
  const triggerColor = isDark ? "var(--color-text-inverse)" : "var(--color-text-secondary)";

  const triggerBtn = (
    <button
      type="button"
      aria-label="Account menu"
      aria-haspopup="dialog"
      aria-expanded={view !== "closed"}
      onClick={() => setView("menu")}
      style={{
        width: 36, height: 36, borderRadius: "50%",
        backgroundColor: triggerBg, color: triggerColor,
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, position: "relative",
      }}
    >
      <User size={18} aria-hidden />
      {unreadCount > 0 && (
        <span
          aria-label={`${unreadCount} unread notifications`}
          style={{
            position: "absolute", top: -2, right: -2,
            minWidth: 16, height: 16, borderRadius: 8,
            backgroundColor: "var(--color-error)", color: "var(--color-text-inverse)",
            fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px",
            border: `2px solid ${isDark ? "var(--color-surface-dark)" : "var(--color-surface)"}`,
            lineHeight: 1,
          }}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );

  if (!isBrowser || view === "closed") {
    return triggerBtn;
  }

  const animClass = exiting ? "map-out" : "map-in";

  // ── Sub-panel back button ──────────────────────────────────────────────────
  function SubHeader({ title, extra }: { title: string; extra?: React.ReactNode }) {
    return (
      <div className="map-sub-header">
        <button
          type="button"
          aria-label="Back"
          onClick={() => setView("menu")}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--color-accent)", padding: 4 }}
        >
          <ArrowLeft size={20} />
        </button>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: "var(--color-text-primary)" }}>{title}</span>
        {extra}
      </div>
    );
  }

  // ── Panel content ──────────────────────────────────────────────────────────
  let panelContent: React.ReactNode;

  if (view === "notifications") {
    panelContent = (
      <>
        <SubHeader
          title={tNotif("title")}
          extra={
            unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                style={{ fontSize: 12, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 700, letterSpacing: "var(--tracking-ui)" }}
              >
                <CheckCheck size={14} />
                {tNotif("markAllRead")}
              </button>
            ) : null
          }
        />
        <div className="map-notif-list">
          {notifLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
              <Loader2 size={22} style={{ color: "var(--color-text-disabled)", animation: "map-slide-in 1s linear infinite" }} />
            </div>
          ) : notifications.length === 0 ? (
            <p style={{ textAlign: "center", padding: "32px 16px", fontSize: 14, color: "var(--color-text-disabled)" }}>
              {tNotif("empty")}
            </p>
          ) : (
            notifications.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onMarkRead={(id) => void markRead(id)}
                onClose={closeAll}
              />
            ))
          )}
        </div>
      </>
    );
  } else if (view === "feedback") {
    panelContent = (
      <>
        <SubHeader title={tFeedback("buttonLabel")} />
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <FeedbackFormInline
            pageUrl={typeof window !== "undefined" ? window.location.href : pathname}
            onSuccess={() => setView("menu")}
          />
        </div>
      </>
    );
  } else if (view === "profile") {
    // Account Profile sub-panel — stays inside the panel, no navigation away
    panelContent = (
      <>
        <SubHeader title={t("accountSettings")} />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Avatar + name + role */}
          <div style={{ padding: "28px 20px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent-hover)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 800, marginBottom: 12,
            }}>
              {name.slice(0, 2).toUpperCase()}
            </div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--color-text-primary)" }}>{name}</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>{role}</p>
          </div>
        </div>
      </>
    );
  } else {
    // view === "menu" — the main panel
    panelContent = (
      <>
        {/* Header: avatar + name + X */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
            backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent-hover)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800,
          }}>
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
            <p style={{ margin: "1px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>{role}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={closeAll}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-disabled)", display: "flex", padding: 4, flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Menu rows */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Notifications */}
          <button type="button" className="map-menu-row" onClick={() => setView("notifications")}>
            <Bell size={18} aria-hidden style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{tNotif("title")}</span>
            {unreadCount > 0 && (
              <span style={{ backgroundColor: "var(--color-error)", color: "var(--color-text-inverse)", borderRadius: 10, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "0 5px" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            <ChevronRight size={16} style={{ color: "var(--color-text-disabled)", flexShrink: 0 }} />
          </button>

          {/* Submit Feedback */}
          <button type="button" className="map-menu-row" onClick={() => setView("feedback")}>
            <MessageSquareHeart size={18} aria-hidden style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{tFeedback("buttonLabel")}</span>
            <ChevronRight size={16} style={{ color: "var(--color-text-disabled)", flexShrink: 0 }} />
          </button>

          {/* Account Profile */}
          <button type="button" className="map-menu-row" onClick={() => setView("profile")}>
            <User size={18} aria-hidden style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t("accountSettings")}</span>
            <ChevronRight size={16} style={{ color: "var(--color-text-disabled)", flexShrink: 0 }} />
          </button>

          {/* Language */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 700, letterSpacing: "var(--tracking-ui)", color: "var(--color-text-primary)" }}>
              <Globe size={18} aria-hidden style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
              {tCommon("language")}
            </span>
            <LocaleSwitcher />
          </div>

          {/* Take a tour */}
          {TOUR_USER_UI_ENABLED ? (
          <button type="button" className="map-menu-row" onClick={openTourPicker}>
            <GraduationCap size={18} aria-hidden style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{tTour("takeTour")}</span>
          </button>
          ) : null}

          {/* Dev Tools — admin/designer only */}
          {canUseDevTools && (
            <button
              type="button"
              className="map-menu-row"
              onClick={() => {
                closeAll();
                setTimeout(() => window.dispatchEvent(new CustomEvent("devtools:open")), ANIM_MS + 50);
              }}
            >
              <SlidersHorizontal size={18} aria-hidden style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
              <span style={{ flex: 1 }}>Dev Tools</span>
            </button>
          )}

          {/* Log out */}
          <button
            type="button"
            className="map-menu-row"
            style={{ color: "var(--color-error)" }}
            onClick={() => void signOut({ callbackUrl: `/${locale ?? "en"}/login` })}
          >
            <LogOut size={18} aria-hidden style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{tAuth("logout")}</span>
          </button>
        </div>
      </>
    );
  }

  return createPortal(
    <>
      <style>{CSS}</style>
      {/* Backdrop — hidden during recording so user can navigate the app freely */}
      <div
        aria-hidden
        onClick={closeAll}
        style={{
          position: "fixed", inset: 0, zIndex: 599,
          backgroundColor: exiting ? "rgba(16,18,43,0)" : "rgba(16,18,43,0.35)",
          transition: `background-color ${ANIM_MS}ms ease`,
          ...(recordingActive ? { visibility: "hidden", pointerEvents: "none" } : {}),
        }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className={`map-panel ${animClass}`}
        {...(recordingActive
          ? { "aria-hidden": true as const }
          : { role: "dialog" as const, "aria-modal": true as const, "aria-label": "Account menu" })}
        style={recordingActive ? { visibility: "hidden", pointerEvents: "none" } : undefined}
      >
        {panelContent}
      </div>
    </>,
    document.body
  );
}
