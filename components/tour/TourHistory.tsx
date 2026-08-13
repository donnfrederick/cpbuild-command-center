"use client";

/**
 * TourHistory — slide-in panel listing all past release tours.
 *
 * Users can replay any tour by clicking "Watch". The panel uses the same
 * sessionStorage("pendingTour") handoff that the banner and TourPlayer already use.
 *
 * Pagination: loads 10 items at a time via GET /api/releases/tour-history.
 */

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { X, Play, ChevronDown, Loader2, History } from "lucide-react";

const PENDING_KEY = "pendingTour";

interface TourStep {
  order: number;
  pageUrl: string;
  title: string;
}

interface TourSummary {
  id: string;
  steps: TourStep[];
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

interface TourHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

function envBadgeKey(env: string): string {
  switch (env) {
    case "development": return "envBadgeDev";
    case "staging": return "envBadgeStaging";
    case "production": return "envBadgeProd";
    default: return "envBadgeAll";
  }
}

function envBadgeColor(env: string): string {
  switch (env) {
    case "production": return "var(--success-600)";
    case "staging": return "var(--warning-600)";
    default: return "var(--neutral-500)";
  }
}

export function TourHistory({ isOpen, onClose }: TourHistoryProps) {
  const t = useTranslations("tourHistory");
  const router = useRouter();

  const [items, setItems] = useState<ReleaseItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

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
      setItems((prev) => cursor ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      setTotal(data.total);
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

  const handleWatch = useCallback((item: ReleaseItem) => {
    if (!item.tour?.steps.length) return;
    onClose();
    const firstStep = [...item.tour.steps].sort((a, b) => a.order - b.order)[0];
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ releaseId: item.id }));
    router.push(firstStep.pageUrl as Parameters<typeof router.push>[0]);
  }, [onClose, router]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 55,
          background: "rgba(0,0,0,0.35)",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label={t("title")}
        aria-modal="true"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(520px, calc(100vw - 16px))",
          maxHeight: "70vh",
          background: "var(--neutral-900)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.45)",
          border: "1px solid var(--neutral-700)",
          borderBottom: "none",
          zIndex: 56,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--neutral-700)",
            flexShrink: 0,
          }}
        >
          <History size={16} style={{ color: "var(--primary-400)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--neutral-50)" }}>
              {t("title")}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--neutral-400)" }}>
              {t("subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("title")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--neutral-400)",
              padding: 4,
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {loading && items.length === 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "24px 16px",
                color: "var(--neutral-400)",
                fontSize: 13,
              }}
            >
              <Loader2 size={14} className="animate-spin" />
              {t("loading")}
            </div>
          )}

          {error && (
            <p style={{ margin: "24px 16px", fontSize: 13, color: "var(--error-400)" }}>
              {t("loadError")}
            </p>
          )}

          {!loading && !error && items.length === 0 && (
            <p style={{ margin: "24px 16px", fontSize: 13, color: "var(--neutral-400)" }}>
              {t("noTours")}
            </p>
          )}

          {items.map((item) => {
            const stepCount = item.tour?.steps.length ?? 0;
            const mergedDate = new Date(item.mergedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });

            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--neutral-800)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: "0 0 3px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--neutral-100)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.title}
                  </p>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: envBadgeColor(item.environment),
                        border: `1px solid ${envBadgeColor(item.environment)}`,
                        borderRadius: "var(--radius-sm)",
                        padding: "1px 5px",
                      }}
                    >
                      {t(envBadgeKey(item.environment) as Parameters<typeof t>[0])}
                    </span>
                    {item.prNumber && (
                      <span style={{ fontSize: 11, color: "var(--neutral-500)" }}>
                        {t("prBadge", { number: item.prNumber })}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--neutral-500)" }}>
                      {t("mergedOn", { date: mergedDate })}
                    </span>
                    {stepCount > 0 && (
                      <span style={{ fontSize: 11, color: "var(--neutral-500)" }}>
                        ·{" "}
                        {stepCount === 1
                          ? t("stepsCount", { count: stepCount })
                          : t("stepsCountPlural", { count: stepCount })}
                      </span>
                    )}
                  </div>
                </div>

                {item.tour && stepCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleWatch(item)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 10px",
                      backgroundColor: "var(--primary-600)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Play size={11} />
                    {t("watch")}
                  </button>
                )}
              </div>
            );
          })}

          {/* Load more */}
          {nextCursor && (
            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "center" }}>
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
                  border: "1px solid var(--neutral-600)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--neutral-300)",
                  fontSize: 12,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                {loading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ChevronDown size={12} />
                )}
                {t("loadMore")}
              </button>
            </div>
          )}
        </div>

        {/* Footer — total count */}
        {total > 0 && (
          <div
            style={{
              padding: "8px 16px",
              borderTop: "1px solid var(--neutral-800)",
              flexShrink: 0,
              fontSize: 11,
              color: "var(--neutral-500)",
              textAlign: "center",
            }}
          >
            {total === 1
              ? t("stepsCount", { count: total })
              : t("stepsCountPlural", { count: total })}{" "}
            {t("title").toLowerCase()}
          </div>
        )}
      </div>
    </>
  );
}

// Keep the icon import available
void ChevronDown;
