"use client";

/**
 * SubcontractorPicker
 *
 * Shows the assigned subcontractor as a tappable pill. Tapping opens a
 * searchable bottom sheet (mobile) or portalled dropdown (desktop) so the user
 * can filter and pick from the Unifier UNIFIER_UXSUB active-sub list.
 *
 * The sub list is fetched once per page load via a module-level singleton so all
 * picker instances share a single request.
 */

import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, forwardRef } from "react";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, Search, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { readSnapshotModule } from "@/lib/offline/snapshot-cache";

// ── Module-level fetch singleton ─────────────────────────────────────────────

export interface SubItem {
  id: string;
  name: string;
}

// ── Recent picks (localStorage) ───────────────────────────────────────────────

interface RecentEntry {
  id: string;
  name: string;
  pickedAt: number;
}

const RECENTS_MAX = 5;
const RECENTS_KEY_PREFIX = "cc-sub-recents";

function recentsStorageKey(userId: string, projectId: string): string {
  return `${RECENTS_KEY_PREFIX}:${userId}:${projectId}`;
}

/**
 * Returns up to RECENTS_MAX recent sub picks for the given user + project,
 * sorted by most recent first. Returns [] when localStorage is unavailable.
 */
export function readRecentSubs(userId: string | undefined, projectId: string | undefined): RecentEntry[] {
  if (!userId || !projectId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(recentsStorageKey(userId, projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as RecentEntry[])
      .filter((e) => typeof e.id === "string" && typeof e.name === "string" && typeof e.pickedAt === "number")
      .sort((a, b) => b.pickedAt - a.pickedAt)
      .slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

/**
 * Writes a sub pick to localStorage for the given user + project.
 * Deduplicates by id (most recent pick wins) and caps at RECENTS_MAX.
 * Safe to call when localStorage is unavailable.
 */
export function writeRecentSub(userId: string | undefined, projectId: string | undefined, item: SubItem): void {
  if (!userId || !projectId || typeof window === "undefined") return;
  try {
    const existing = readRecentSubs(userId, projectId).filter((e) => e.id !== item.id);
    const next: RecentEntry[] = [
      { id: item.id, name: item.name, pickedAt: Date.now() },
      ...existing,
    ].slice(0, RECENTS_MAX);
    localStorage.setItem(recentsStorageKey(userId, projectId), JSON.stringify(next));
  } catch {
    // localStorage may be full or unavailable (private browsing, quota exceeded)
  }
}

let _cachedSubs: SubItem[] | null = null;
let _fetchPromise: Promise<void> | null = null;

function ensureSubsFetched(): Promise<void> {
  if (_cachedSubs !== null) return Promise.resolve();
  if (_fetchPromise !== null) return _fetchPromise;
  _fetchPromise = fetch("/api/unifier/subcontractors")
    .then((r) => (r.ok ? r.json() : { subcontractors: [] }))
    .then((data: { subcontractors?: SubItem[] }) => {
      _cachedSubs = data.subcontractors ?? [];
    })
    .catch(async () => {
      try {
        const snapshot = await readSnapshotModule<SubItem[]>("subcontractors");
        _cachedSubs = snapshot?.data ?? [];
      } catch {
        _cachedSubs = [];
      }
      _fetchPromise = null;
    });
  return _fetchPromise;
}

/** Exposed for testing — resets the module-level cache. */
export function _resetSubcontractorCache() {
  _cachedSubs = null;
  _fetchPromise = null;
}

/**
 * Returns the currently-cached sub list (may be null if not yet fetched).
 * Use `ensureSubItemsFetched()` first to guarantee the list is populated.
 */
export function getCachedSubItems(): SubItem[] | null {
  return _cachedSubs;
}

/** Triggers the module-level singleton fetch and resolves when the cache is ready. */
export function ensureSubItemsFetched(): Promise<void> {
  return ensureSubsFetched();
}

// ── Browser / desktop hooks ──────────────────────────────────────────────────

function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => (typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false),
    () => false
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const SHEET_CSS = `
  .spkr-backdrop { position: fixed; inset: 0; z-index: 270; display: flex; align-items: flex-end; transition: background-color 0.26s ease; }
  .spkr-sheet { width: 100%; max-height: 80vh; border-radius: 16px 16px 0 0; background: var(--neutral-0); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 32px rgba(0,0,0,0.14); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .spkr-sheet.spkr-visible { transform: translateY(0); }
  .spkr-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 0; flex-shrink: 0; }
`;

// ── Props ────────────────────────────────────────────────────────────────────

export interface SubcontractorPickerRef {
  focus(): void;
}

export interface SubcontractorPickerProps {
  /** Current assigned Unifier sub ID, or null if unassigned. */
  value: string | null;
  /** When true, renders plain read-only text rather than an interactive pill. */
  readOnly?: boolean;
  /** Called with the new Unifier sub ID, or null to clear. Return false (or Promise<false>) to skip persisting to recents. */
  onChange?: (id: string | null, displayName?: string | null) => void | boolean | Promise<void | boolean>;
  /** Disables interaction while a PATCH is in flight. */
  disabled?: boolean;
  /** Shows a loading overlay on the pill while the assignment is saving. */
  saving?: boolean;
  /** Stretch the trigger to 100% of the container (form-field style vs compact pill). */
  fullWidth?: boolean;
  /** Called when Tab is pressed while the trigger is focused (without Shift). */
  onTabNext?: () => void;
  /** Called when Shift+Tab is pressed while the trigger is focused. */
  onTabPrev?: () => void;
  /** Project ID — used to scope recent picks per project in localStorage. */
  projectId?: string;
  /** Current user ID — used to scope recent picks per user in localStorage. */
  userId?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export const SubcontractorPicker = forwardRef<SubcontractorPickerRef, SubcontractorPickerProps>(
function SubcontractorPicker({
  value,
  readOnly = false,
  onChange,
  disabled = false,
  saving = false,
  fullWidth = false,
  onTabNext,
  onTabPrev,
  projectId,
  userId,
}, ref) {
  const t = useTranslations("units");
  const isBrowser = useIsBrowser();
  const isDesktop = useIsDesktop();

  const [subs, setSubs] = useState<SubItem[]>(_cachedSubs ?? []);
  const [loading, setLoading] = useState(_cachedSubs === null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Desktop dropdown positioning
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const titleId = useId();
  const recentsLabelId = useId();

  useImperativeHandle(ref, () => ({ focus: () => triggerRef.current?.focus() }), []);

  // Fetch sub list
  useEffect(() => {
    if (_cachedSubs !== null) return;
    let cancelled = false;
    ensureSubsFetched().then(() => {
      if (!cancelled && _cachedSubs !== null) {
        setSubs(_cachedSubs);
        setLoading(false);
      } else if (!cancelled) {
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Position desktop dropdown when opened
  useEffect(() => {
    if (!open || !isDesktop || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
  }, [open, isDesktop]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  // Close desktop dropdown on outside click
  useEffect(() => {
    if (!open || !isDesktop) return;
    function onDown(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) handleClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, isDesktop, handleClose]);

  const handlePick = useCallback(
    (id: string | null) => {
      handleClose();
      void (async () => {
        try {
          const sub = id !== null ? subs.find((s) => s.id === id) : null;
          const persist = (await Promise.resolve(onChange?.(id, sub?.name ?? null))) !== false;
          if (persist && id !== null && sub) {
            writeRecentSub(userId, projectId, sub);
          }
        } catch {
          // onChange failed — skip persisting to recents
        }
      })();
    },
    [onChange, handleClose, subs, userId, projectId]
  );

  const fallbackNameFromRecents =
    value && userId && projectId
      ? readRecentSubs(userId, projectId).find((r) => r.id === value)?.name ?? null
      : null;

  const resolvedName = value
    ? (subs.find((s) => s.id === value)?.name ?? fallbackNameFromRecents)
    : null;
  const hasValue = resolvedName !== null;

  const displayLabel =
    loading && !resolvedName ? t("subcontractorLoading") : resolvedName ?? t("unassigned");

  const filtered = search.trim()
    ? subs.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : subs;

  // Recents: read from localStorage on every render when the picker is open.
  // Synchronous localStorage read avoids the need for a setState-in-effect pattern.
  // Cross-reference with live subs list so stale Unifier entries never appear.
  // Only shown when not searching.
  const recentSubs = useMemo<SubItem[]>(() => {
    if (!open) return [];
    return readRecentSubs(userId, projectId)
      .map((r) => subs.find((s) => s.id === r.id))
      .filter((s): s is SubItem => s !== undefined);
  }, [open, userId, projectId, subs]);
  const recentIds = new Set(recentSubs.map((s) => s.id));
  const showRecents = !search.trim() && recentSubs.length > 0;
  // When recents are visible, exclude them from the main list to avoid duplication.
  const mainListSubs = showRecents ? filtered.filter((s) => !recentIds.has(s.id)) : filtered;

  // ── Read-only ────────────────────────────────────────────────────────────
  if (readOnly) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Users
          size={13}
          style={{ flexShrink: 0, color: hasValue ? "var(--neutral-500)" : "var(--neutral-300)" }}
          aria-hidden
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: hasValue ? "var(--neutral-600)" : "var(--neutral-400)",
            fontStyle: hasValue ? "normal" : "italic",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayLabel}
        </span>
      </div>
    );
  }

  // ── Tappable pill ─────────────────────────────────────────────────────────
  const pillContent = (
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled || loading}
      aria-label={`${t("subcontractorLabel")}: ${displayLabel}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => { if (!disabled && !loading) { setOpen(true); setSearch(""); } }}
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          const handler = e.shiftKey ? onTabPrev : onTabNext;
          if (handler) {
            e.preventDefault();
            handler();
          }
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: fullWidth ? 8 : 5,
        padding: fullWidth ? "10px 12px" : "4px 8px",
        borderRadius: fullWidth ? 8 : "var(--radius-pill)",
        border: fullWidth ? "1px solid var(--neutral-200)" : "none",
        backgroundColor: hasValue ? "var(--control-active-bg)" : "var(--control-bg)",
        cursor: disabled || loading ? "default" : "pointer",
        transition: "background-color 0.15s, color 0.15s",
        maxWidth: "100%",
        minWidth: 0,
        width: "100%",
        flexShrink: 1,
        boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    >
      <Users
        size={12}
        style={{ flexShrink: 0, color: hasValue ? "var(--control-active-fg)" : "var(--control-icon)" }}
        aria-hidden
      />
      <span
        style={{
          fontSize: fullWidth ? 13 : "var(--text-caption)",
          fontWeight: hasValue ? "var(--font-weight-semibold)" : "var(--font-weight-medium)",
          color: hasValue ? "var(--control-active-fg)" : "var(--control-fg)",
          fontStyle: hasValue ? "normal" : "italic",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {displayLabel}
      </span>
      {!loading && (
        <ChevronDown
          size={11}
          style={{ flexShrink: 0, color: hasValue ? "var(--control-active-fg)" : "var(--control-icon)" }}
          aria-hidden
        />
      )}
    </button>
  );

  // ── Shared list content (reused in both sheet and dropdown) ───────────────
  const listContent = (
    <>
      {/* Search input */}
      <div
        style={{
          padding: "8px 12px 0",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--neutral-200)",
            backgroundColor: "var(--neutral-50)",
          }}
        >
          <Search size={13} style={{ flexShrink: 0, color: "var(--neutral-400)" }} aria-hidden />
          <input
            type="text"
            placeholder={t("subcontractorSearchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              fontSize: 13,
              border: "none",
              background: "transparent",
              outline: "none",
              color: "var(--neutral-900)",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--neutral-400)", display: "flex" }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8, marginTop: 4 }}>
        {/* Unassigned clear option */}
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          onClick={() => handlePick(null)}
          style={{
            width: "100%",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: value === null ? 600 : 400,
            color: value === null ? "var(--neutral-900)" : "var(--neutral-500)",
            fontStyle: "italic",
            backgroundColor: value === null ? "var(--neutral-50)" : "transparent",
            border: "none",
            cursor: "pointer",
            borderBottom: "1px solid var(--neutral-100)",
          }}
        >
          <span style={{ flex: 1 }}>{t("unassigned")}</span>
          {value === null && <span style={{ fontSize: 11, color: "var(--primary-500)", fontWeight: 600, fontStyle: "normal" }}>✓</span>}
        </button>

        {/* Recent picks section */}
        {showRecents && (
          <div role="group" aria-labelledby={recentsLabelId}>
            <p id={recentsLabelId} style={{ margin: "8px 16px 4px", fontSize: 10, fontWeight: 700, color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t("recentSubcontractors")}
            </p>
            {recentSubs.map((s) => (
              <button
                key={`recent-${s.id}`}
                type="button"
                role="option"
                aria-selected={value === s.id}
                onClick={() => handlePick(s.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: value === s.id ? 600 : 400,
                  color: value === s.id ? "var(--neutral-900)" : "var(--neutral-700)",
                  backgroundColor: value === s.id ? "var(--primary-50)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                {value === s.id && <span style={{ fontSize: 11, color: "var(--primary-500)", fontWeight: 600, flexShrink: 0 }}>✓</span>}
              </button>
            ))}
            <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "4px 0" }} aria-hidden />
          </div>
        )}

        {filtered.length === 0 && search ? (
          <p style={{ padding: "12px 16px", fontSize: 13, color: "var(--neutral-400)", fontStyle: "italic", margin: 0 }}>
            {t("subcontractorNoResults")}
          </p>
        ) : (
          mainListSubs.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={value === s.id}
              onClick={() => handlePick(s.id)}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: value === s.id ? 600 : 400,
                color: value === s.id ? "var(--neutral-900)" : "var(--neutral-700)",
                backgroundColor: value === s.id ? "var(--primary-50)" : "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              {value === s.id && <span style={{ fontSize: 11, color: "var(--primary-500)", fontWeight: 600, flexShrink: 0 }}>✓</span>}
            </button>
          ))
        )}
      </div>
    </>
  );

  const pillWithSavingOverlay = (
    <div
      style={{
        position: "relative",
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        maxWidth: "100%",
      }}
    >
      {pillContent}
      {saving && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: fullWidth ? 8 : "var(--radius-pill)",
            backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.45))",
            zIndex: 1,
          }}
        >
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--neutral-0)" }} />
        </div>
      )}
    </div>
  );

  if (!isBrowser) return pillWithSavingOverlay;

  return (
    <>
      {pillWithSavingOverlay}

      {/* ── Desktop: portalled dropdown ──────────────────────────────────── */}
      {open && isDesktop && dropPos && createPortal(
        <div
          ref={dropRef}
          role="listbox"
          aria-label={t("subcontractorLabel")}
          style={{
            position: "fixed",
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            zIndex: 300,
            backgroundColor: "var(--neutral-0)",
            border: "1px solid var(--neutral-200)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            maxHeight: 320,
            overflow: "hidden",
          }}
        >
          {listContent}
        </div>,
        document.body
      )}

      {/* ── Mobile: bottom sheet ─────────────────────────────────────────── */}
      {open && !isDesktop && createPortal(
        <>
          <style>{SHEET_CSS}</style>
          <div
            role="presentation"
            className="spkr-backdrop"
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="spkr-sheet spkr-visible"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="spkr-handle" aria-hidden />
              {/* Sheet header */}
              <div
                style={{
                  padding: "12px 20px 10px",
                  borderBottom: "1px solid var(--neutral-200)",
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h2
                  id={titleId}
                  style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--neutral-900)" }}
                >
                  {t("subcontractorLabel")}
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={t("pickerSheetClose")}
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    color: "var(--neutral-500)",
                  }}
                >
                  <X size={20} />
                </button>
              </div>
              {/* List with search */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {listContent}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
});
