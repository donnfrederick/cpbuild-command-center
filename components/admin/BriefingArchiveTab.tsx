"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Calendar, TrendingUp, Lightbulb, AlertTriangle, ChevronRight, ArrowLeft, Loader2, Archive, Sparkles } from "lucide-react";
import type { DailyBriefingReport } from "@/lib/ai/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoryItem {
  id: string;
  dateFor: string;
  generatedAt: string;
  roiSummary: string;
  totalEstimatedValue: string;
  optimizationCount: number;
  issueCount: number;
  shippedCount: number;
}

interface FullBriefing {
  id: string;
  briefing: DailyBriefingReport;
  dateFor: string;
  generatedAt: string;
}

// ── HistoryCard ───────────────────────────────────────────────────────────────

function HistoryCard({
  item,
  onSelect,
}: {
  item: HistoryItem;
  onSelect: (item: HistoryItem) => void;
}) {
  const t = useTranslations("morningBriefing");
  const locale = useLocale();
  const date = new Date(item.dateFor + "T12:00:00Z");
  const displayDate = date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="w-full text-left rounded-lg p-4 transition-colors hover:bg-[var(--neutral-100)]"
      style={{
        backgroundColor: "var(--neutral-0)",
        border: "1px solid var(--neutral-200)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="rounded-md p-2 flex-shrink-0 mt-0.5"
            style={{ backgroundColor: "var(--primary-100)" }}
          >
            <Calendar style={{ width: 14, height: 14, color: "var(--primary-600)" }} />
          </div>
          <div className="min-w-0">
            <p
              className="font-semibold leading-tight"
              style={{ fontSize: "var(--text-body)", color: "var(--neutral-900)" }}
            >
              {displayDate}
            </p>
            {item.roiSummary && (
              <p
                className="mt-1 line-clamp-2 leading-snug"
                style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}
              >
                {item.roiSummary}
              </p>
            )}
          </div>
        </div>
        <ChevronRight
          style={{ width: 16, height: 16, color: "var(--neutral-400)", flexShrink: 0, marginTop: 2 }}
        />
      </div>

      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {item.totalEstimatedValue && (
          <span className="flex items-center gap-1" style={{ fontSize: "var(--text-caption)" }}>
            <TrendingUp style={{ width: 11, height: 11, color: "var(--success-600)" }} />
            <span style={{ color: "var(--success-700)", fontWeight: 600 }}>
              {item.totalEstimatedValue}
            </span>
          </span>
        )}
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{
            fontSize: "11px",
            backgroundColor: "var(--primary-100)",
            color: "var(--primary-700)",
          }}
        >
          <Lightbulb style={{ width: 10, height: 10 }} />
          {t("archiveOptimizations", { count: item.optimizationCount })}
        </span>
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{
            fontSize: "11px",
            backgroundColor: item.issueCount > 0 ? "var(--warning-100)" : "var(--neutral-100)",
            color: item.issueCount > 0 ? "var(--warning-700)" : "var(--neutral-500)",
          }}
        >
          <AlertTriangle style={{ width: 10, height: 10 }} />
          {t("archiveIssues", { count: item.issueCount })}
        </span>
      </div>
    </button>
  );
}

// ── BackfillPanel ─────────────────────────────────────────────────────────────

function BackfillPanel({
  date,
  onDateChange,
  onGenerate,
  generating,
  t,
}: {
  date: string;
  onDateChange: (d: string) => void;
  onGenerate: () => void;
  generating: boolean;
  t: ReturnType<typeof useTranslations<"morningBriefing">>;
}) {
  const yesterday = yesterdayLocal();

  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: "var(--neutral-0)", border: "1px solid var(--neutral-200)" }}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="rounded-md p-2 flex-shrink-0"
          style={{ backgroundColor: "var(--primary-100)" }}
        >
          <Sparkles style={{ width: 14, height: 14, color: "var(--primary-600)" }} />
        </div>
        <div className="min-w-0">
          <p
            className="font-semibold"
            style={{ fontSize: "var(--text-body)", color: "var(--neutral-900)" }}
          >
            {t("backfillTitle")}
          </p>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", marginTop: 2 }}>
            {t("backfillDescription")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="sr-only" htmlFor="backfill-date">
          {t("backfillDateLabel")}
        </label>
        <input
          id="backfill-date"
          type="date"
          value={date}
          max={yesterday}
          onChange={(e) => onDateChange(e.target.value)}
          className="rounded-md px-3 py-2"
          style={{
            fontSize: "var(--text-body)",
            color: "var(--neutral-800)",
            backgroundColor: "var(--neutral-100)",
            border: "1px solid var(--neutral-300)",
          }}
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || !date}
          className="flex items-center gap-2 rounded-md px-4 py-2 font-medium transition-opacity disabled:opacity-60"
          style={{
            backgroundColor: "var(--primary-700)",
            color: "var(--neutral-0)",
            fontSize: "var(--text-body)",
          }}
        >
          {generating ? (
            <>
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
              {t("backfillGenerating")}
            </>
          ) : (
            <>
              <Sparkles style={{ width: 14, height: 14 }} />
              {t("backfillGenerate")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── BriefingArchiveTab ────────────────────────────────────────────────────────

interface Props {
  /** Render function for the full briefing — accepts a briefing + its ID */
  renderBriefing: (full: FullBriefing) => ReactNode;
}

/** Returns yesterday's date as YYYY-MM-DD using local calendar (avoids UTC off-by-one around midnight). */
function yesterdayLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BriefingArchiveTab({ renderBriefing }: Props) {
  const t = useTranslations("morningBriefing");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [fullBriefing, setFullBriefing] = useState<FullBriefing | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backfill state
  const [backfillDate, setBackfillDate] = useState<string>(yesterdayLocal());
  const [backfilling, setBackfilling] = useState(false);

  // Load history list on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/daily-briefing/history");
        if (!res.ok) {
          setError(t("archiveLoadError"));
          return;
        }
        const data = await res.json();
        setItems(data.items as HistoryItem[]);
      } catch {
        setError(t("archiveLoadError"));
      } finally {
        setLoading(false);
      }
    })();
  // t is stable from useTranslations — safe dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load full briefing when a card is selected
  async function handleSelect(item: HistoryItem) {
    setSelected(item);
    setFullBriefing(null);
    setError(null);
    setLoadingFull(true);
    try {
      const res = await fetch(`/api/daily-briefing?date=${item.dateFor}`);
      if (!res.ok) {
        const msg = t("briefingLoadError");
        setError(msg);
        toast.error(t("errorTitle"), { description: msg });
        return;
      }
      const data = await res.json();
      setFullBriefing({
        id: data.id as string,
        briefing: data.briefing as DailyBriefingReport,
        dateFor: data.dateFor as string,
        generatedAt: data.generatedAt as string,
      });
    } catch {
      const msg = t("briefingLoadError");
      setError(msg);
      toast.error(t("errorTitle"), { description: msg });
    } finally {
      setLoadingFull(false);
    }
  }

  function handleBack() {
    setSelected(null);
    setFullBriefing(null);
    setLoadingFull(false);
  }

  async function handleBackfill() {
    if (!backfillDate) return;
    setBackfilling(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: backfillDate }),
      });
      const data = await res.json() as { briefing?: DailyBriefingReport; id?: string; dateFor?: string; generatedAt?: string; error?: string };
      if (!res.ok) {
        const msg = data.error ?? t("backfillErrorFallback");
        setError(msg);
        toast.error(t("errorTitle"), { description: msg });
        return;
      }
      // Reload history list so the new/updated item appears
      const histRes = await fetch("/api/daily-briefing/history");
      let freshItems: HistoryItem[] = items;
      if (histRes.ok) {
        const histData = await histRes.json() as { items: HistoryItem[] };
        freshItems = histData.items;
        setItems(freshItems);
      }
      // Auto-navigate into the freshly generated briefing
      if (data.briefing && data.id && data.dateFor && data.generatedAt) {
        setFullBriefing({
          id: data.id,
          briefing: data.briefing,
          dateFor: data.dateFor,
          generatedAt: data.generatedAt,
        });
        const matched = (freshItems.find((i) => i.dateFor === data.dateFor)) ?? {
          id: data.id,
          dateFor: data.dateFor,
          generatedAt: data.generatedAt,
          roiSummary: "",
          totalEstimatedValue: "",
          optimizationCount: 0,
          issueCount: 0,
          shippedCount: 0,
        };
        setSelected(matched);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("backfillNetworkError");
      setError(msg);
      toast.error(t("errorTitle"), { description: msg });
    } finally {
      setBackfilling(false);
    }
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2
          style={{ width: 24, height: 24, color: "var(--primary-600)" }}
          className="animate-spin"
        />
      </div>
    );
  }

  if (error && !selected) {
    return (
      <div
        className="rounded-lg p-4 text-center"
        style={{ backgroundColor: "var(--error-100)", color: "var(--error-700)" }}
      >
        {error}
      </div>
    );
  }

  // Full briefing viewer
  if (selected) {
    return (
      <div>
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 mb-6 rounded-md px-3 py-2 transition-colors"
          style={{
            fontSize: "var(--text-body)",
            color: "var(--neutral-600)",
            backgroundColor: "var(--neutral-100)",
            border: "1px solid var(--neutral-200)",
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          {t("archiveBack")}
        </button>

        {loadingFull && (
          <div className="flex items-center justify-center py-20">
            <Loader2
              style={{ width: 24, height: 24, color: "var(--primary-600)" }}
              className="animate-spin"
            />
          </div>
        )}

        {error && !loadingFull && !fullBriefing && (
          <div
            className="rounded-lg p-4 text-center"
            style={{ backgroundColor: "var(--error-100)", color: "var(--error-700)" }}
          >
            {error}
          </div>
        )}

        {fullBriefing && renderBriefing(fullBriefing)}
      </div>
    );
  }

  // Empty state — still show the backfill panel so user can generate for past dates
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <BackfillPanel
          date={backfillDate}
          onDateChange={setBackfillDate}
          onGenerate={() => void handleBackfill()}
          generating={backfilling}
          t={t}
        />
        <div
          className="flex flex-col items-center justify-center text-center rounded-xl py-20 px-8"
          style={{ backgroundColor: "var(--neutral-0)", border: "1px solid var(--neutral-200)" }}
        >
          <div
            className="rounded-full flex items-center justify-center mb-5"
            style={{ width: 72, height: 72, backgroundColor: "var(--neutral-100)" }}
          >
            <Archive style={{ width: 36, height: 36, color: "var(--neutral-400)" }} />
          </div>
          <h2
            className="mb-2"
            style={{ fontSize: "var(--text-heading)", fontWeight: 700, color: "var(--neutral-900)" }}
          >
            {t("archiveEmptyTitle")}
          </h2>
          <p
            style={{ fontSize: "var(--text-body)", color: "var(--neutral-600)", maxWidth: 360 }}
          >
            {t("archiveEmptyDescription")}
          </p>
        </div>
      </div>
    );
  }

  // History list
  return (
    <div className="flex flex-col gap-6">
      <BackfillPanel
        date={backfillDate}
        onDateChange={setBackfillDate}
        onGenerate={() => void handleBackfill()}
        generating={backfilling}
        t={t}
      />

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2
              style={{ fontSize: "var(--text-subheading)", fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}
            >
              {t("archiveHeading")}
            </h2>
            <p
              style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", marginTop: 2 }}
            >
              {t("archiveCount", { count: items.length })}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <HistoryCard key={item.id} item={item} onSelect={(i) => void handleSelect(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}
