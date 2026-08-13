"use client";

/**
 * TourPicker — slide-out panel listing all available tours.
 *
 * Shows the Site Tour first (always available), then release tours from
 * GET /api/releases/tour-history. Supports:
 *   - Search by title
 *   - Role-based filtering (hide tours not relevant to the user's role)
 *   - "Show all roles" toggle for admins / curious users
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { X, Play, ChevronDown, Loader2, GraduationCap, Search, Clock } from "lucide-react";

interface TourSummary {
  id: string;
  steps: { order: number; pageUrl: string; title: string }[];
  targetRoles?: string[];
}

interface ReleaseItem {
  id: string;
  title: string;
  prNumber: number | null;
  branch: string | null;
  environment: string;
  mergedAt: string;
  tour: TourSummary | null;
}

interface TourHistoryResponse {
  items: ReleaseItem[];
  nextCursor: string | null;
  total: number;
}

interface TourPickerProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
  isAdmin?: boolean;
}

function envBadgeKey(env: string): string {
  switch (env) {
    case "development": return "envBadgeDev";
    case "staging":     return "envBadgeStaging";
    case "production":  return "envBadgeProd";
    default:            return "envBadgeAll";
  }
}

function envBadgeColor(env: string): string {
  switch (env) {
    case "production": return "var(--green-600)";
    case "staging":    return "var(--amber-700)";
    default:           return "var(--color-text-tertiary)";
  }
}

export function TourPicker({ isOpen, onClose, userRole }: TourPickerProps) {
  const t = useTranslations("tour");
  const tHistory = useTranslations("tourHistory");

  const [items, setItems] = useState<ReleaseItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllRoles, setShowAllRoles] = useState(false);

  const fetchPage = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(false);
    try {
      const url = cursor
        ? `/api/releases/tour-history?limit=10&cursor=${cursor}`
        : "/api/releases/tour-history?limit=10";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as TourHistoryResponse;
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && items.length === 0) {
      void fetchPage();
    }
  }, [isOpen, items.length, fetchPage]);

  const startSiteTour = useCallback(() => {
    onClose();
    window.dispatchEvent(
      new CustomEvent("tour:request", {
        detail: { siteTour: true, autoPlay: false },
      })
    );
  }, [onClose]);

  const handleWatchRelease = useCallback(
    (item: ReleaseItem) => {
      if (!item.tour?.steps.length) return;
      onClose();
      window.dispatchEvent(
        new CustomEvent("tour:request", {
          detail: { releaseId: item.id, autoPlay: false },
        })
      );
    },
    [onClose]
  );

  // Filter items by role and search query
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Role filter
      const roles = item.tour?.targetRoles ?? [];
      if (!showAllRoles && roles.length > 0 && userRole && !roles.includes(userRole)) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        return item.title.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [items, userRole, showAllRoles, searchQuery]);

  // Whether there are any tours beyond the user's role (to show "show all" toggle)
  const hasBeyondRole = useMemo(
    () =>
      items.some((item) => {
        const roles = item.tour?.targetRoles ?? [];
        return roles.length > 0 && userRole && !roles.includes(userRole);
      }),
    [items, userRole]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("tourPickerTitle")}
      aria-hidden={!isOpen}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 55,
        pointerEvents: isOpen ? "auto" : "none",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(16,18,43,0.35)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 0.26s ease",
        }}
      />

      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(380px, 90vw)",
          height: "100%",
          backgroundColor: "var(--color-surface)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.32,0.72,0,1)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-modal)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-divider)",
            flexShrink: 0,
          }}
        >
          <GraduationCap size={18} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
              {t("tourPickerTitle")}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>
              {t("tourPickerSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tour picker"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
              padding: 4,
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-disabled)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tours…"
              style={{
                width: "100%",
                padding: "6px 10px 6px 30px",
                border: "none",
                borderRadius: "var(--radius-pill)",
                fontSize: 13,
                color: "var(--color-text-primary)",
                backgroundColor: "var(--color-surface-sunken)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          {hasBeyondRole && (
            <button
              type="button"
              onClick={() => setShowAllRoles((v) => !v)}
              style={{
                marginTop: 6,
                background: "none",
                border: "none",
                fontSize: 11,
                color: "var(--color-accent)",
                cursor: "pointer",
                padding: 0,
                fontWeight: 700,
                letterSpacing: "var(--tracking-ui)",
              }}
            >
              {showAllRoles ? "Show my role only" : "Show all roles"}
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {/* Site Tour — shown but temporarily disabled while content is being updated */}
          <div
            aria-disabled="true"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 20px",
              borderBottom: "1px solid var(--color-divider)",
              cursor: "not-allowed",
              opacity: 0.55,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>
                {t("siteTourTitle")}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>
                {t("siteTourDescription")}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-disabled)", fontStyle: "italic" }}>
                {t("siteTourPausedNotice")}
              </p>
            </div>
            <Clock size={16} style={{ color: "var(--color-text-disabled)", flexShrink: 0, marginTop: 2 }} />
          </div>

          {/* Release tours */}
          {releaseToursSection()}
        </div>
      </div>
    </div>
  );

  function releaseToursSection() {
    if (loading && items.length === 0) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "24px 20px", color: "var(--color-text-tertiary)", fontSize: 13 }}>
          <Loader2 size={14} className="animate-spin" />
          {tHistory("loading")}
        </div>
      );
    }

    if (error) {
      return (
        <p style={{ margin: "24px 20px", fontSize: 13, color: "var(--color-error)" }}>
          {tHistory("loadError")}
        </p>
      );
    }

    if (items.length === 0) {
      return (
        <div style={{ padding: "16px 20px" }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)" }}>
            {tHistory("noTours")}
          </p>
        </div>
      );
    }

    if (filteredItems.length === 0) {
      return (
        <div style={{ padding: "16px 20px" }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-disabled)" }}>
            No tours match your filter.
          </p>
        </div>
      );
    }

    return (
      <div style={{ padding: "8px 0" }}>
        {filteredItems.map((item) => {
          const stepCount = item.tour?.steps.length ?? 0;
          const mergedDate = new Date(item.mergedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
          const canWatch = item.tour && stepCount > 0;

          return (
            <div
              key={item.id}
              role={canWatch ? "button" : undefined}
              tabIndex={canWatch ? 0 : undefined}
              onClick={canWatch ? () => handleWatchRelease(item) : undefined}
              onKeyDown={canWatch ? (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleWatchRelease(item); }
              } : undefined}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 20px",
                borderBottom: "1px solid var(--color-divider)",
                cursor: canWatch ? "pointer" : "default",
              }}
              onMouseEnter={canWatch ? (e) => { e.currentTarget.style.backgroundColor = "var(--color-surface-sunken)"; } : undefined}
              onMouseLeave={canWatch ? (e) => { e.currentTarget.style.backgroundColor = "transparent"; } : undefined}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </p>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--tracking-label)", color: envBadgeColor(item.environment), backgroundColor: "var(--color-surface-sunken)", borderRadius: "var(--radius-sm)", padding: "2px 6px" }}>
                    {tHistory(envBadgeKey(item.environment) as Parameters<typeof tHistory>[0])}
                  </span>
                  {item.prNumber && (
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      {tHistory("prBadge", { number: item.prNumber })}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {tHistory("mergedOn", { date: mergedDate })}
                  </span>
                  {stepCount > 0 && (
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      · {stepCount === 1 ? tHistory("stepsCount", { count: stepCount }) : tHistory("stepsCountPlural", { count: stepCount })}
                    </span>
                  )}
                  {/* Role tags */}
                  {(item.tour?.targetRoles ?? []).length > 0 && (
                    <span style={{ fontSize: 10, color: "var(--color-accent)", fontWeight: 700 }}>
                      {(item.tour?.targetRoles ?? []).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              {canWatch && (
                <Play size={16} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }} />
              )}
            </div>
          );
        })}

        {/* Load more */}
        {nextCursor && (
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => void fetchPage(nextCursor)}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 14px",
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text-secondary)",
                backgroundColor: "var(--color-surface-sunken)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "var(--tracking-ui)",
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
              {tHistory("loadMore")}
            </button>
          </div>
        )}
      </div>
    );
  }
}
