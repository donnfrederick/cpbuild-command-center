"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckCircle,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Zap,
  Rocket,
  Sparkles,
  RefreshCw,
  Sun,
  ExternalLink,
  Clock,
  ArrowRight,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Archive,
} from "lucide-react";
import type {
  DailyBriefingReport,
  OptimizationItem,
  ChallengeItem,
  ROILineItem,
  TechPulseItem,
  SprintItem,
  ShippedItem,
} from "@/lib/ai/types";
import { BriefingCardFeedback } from "@/components/admin/BriefingCardFeedback";
import { BriefingArchiveTab } from "@/components/admin/BriefingArchiveTab";
import { BriefingAnalysisTab } from "@/components/admin/BriefingAnalysisTab";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  aiEnabled: boolean;
}

interface BriefingState {
  id: string | null;
  briefing: DailyBriefingReport | null;
  dateFor: string | null;
  generatedAt: string | null;
}

type Tab = "today" | "archive" | "analysis";

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonCard({ height = "h-40" }: { height?: string }) {
  return (
    <div
      className={`rounded-lg ${height} animate-pulse`}
      style={{ backgroundColor: "var(--neutral-200)" }}
    />
  );
}

function GeneratingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonCard height="h-32" />
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonCard height="h-48" />
        <SkeletonCard height="h-48" />
      </div>
      <SkeletonCard height="h-40" />
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonCard height="h-56" />
        <SkeletonCard height="h-56" />
      </div>
      <SkeletonCard height="h-48" />
      <SkeletonCard height="h-28" />
    </div>
  );
}

// ── Priority badge ────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const colors: Record<string, string> = {
    high: "var(--error-100)",
    medium: "var(--warning-100)",
    low: "var(--success-100)",
  };
  const text: Record<string, string> = {
    high: "var(--error-600)",
    medium: "var(--warning-600)",
    low: "var(--success-600)",
  };
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize"
      style={{ backgroundColor: colors[priority], color: text[priority] }}
    >
      {priority}
    </span>
  );
}

function ResolutionBadge({ resolution }: { resolution: "resolved" | "open" | "monitoring" }) {
  const t = useTranslations("morningBriefing");
  const colors: Record<string, { bg: string; fg: string }> = {
    resolved: { bg: "var(--success-100)", fg: "var(--success-600)" },
    open: { bg: "var(--error-100)", fg: "var(--error-600)" },
    monitoring: { bg: "var(--warning-100)", fg: "var(--warning-600)" },
  };
  const labels: Record<string, string> = {
    resolved: t("resolutionResolved"),
    open: t("resolutionOpen"),
    monitoring: t("resolutionMonitoring"),
  };
  const { bg, fg } = colors[resolution] ?? colors.open;
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      {labels[resolution]}
    </span>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  bg,
  fg,
  iconFg,
  children,
}: {
  title: string;
  icon: React.ElementType;
  bg: string;
  fg: string;
  iconFg?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: bg, border: "1px solid var(--neutral-200)" }}
    >
      <div
        className="flex items-center gap-2 px-5 py-4 border-b"
        style={{ borderColor: "var(--neutral-200)" }}
      >
        <Icon
          style={{
            width: 18,
            height: 18,
            color: iconFg ?? fg,
            flexShrink: 0,
          }}
        />
        <h2 style={{ fontSize: "var(--text-subheading)", fontWeight: 600, color: fg, margin: 0 }}>
          {title}
        </h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// ── Section: Yesterday's Work ─────────────────────────────────────────────────

function YesterdaysWorkSection({
  data,
  briefingId,
  dateFor,
  narrative,
}: {
  data: DailyBriefingReport["yesterdaysWork"];
  briefingId: string;
  dateFor: string;
  narrative: string;
}) {
  const t = useTranslations("morningBriefing");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? data.shipped : data.shipped.slice(0, 3);

  return (
    <SectionCard
      title={t("sectionYesterdaysWork")}
      icon={CheckCircle}
      bg="var(--neutral-0)"
      fg="var(--neutral-900)"
      iconFg="var(--success-600)"
    >
      <p
        className="mb-4 leading-relaxed"
        style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)" }}
      >
        {data.narrative}
      </p>

      {data.shipped.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          <p
            className="font-medium uppercase tracking-wide"
            style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}
          >
            {t("labelShipped")}
          </p>
          {visible.map((item: ShippedItem, i: number) => (
            <BriefingCardFeedback
              key={i}
              briefingId={briefingId}
              section="SHIPPED_ITEM"
              itemKey={`shipped-${i}`}
              itemData={item as unknown as Record<string, unknown>}
              briefingContext={{ dateFor, narrative }}
            >
              <div
                className="flex items-start gap-3 rounded-md p-3"
                style={{ backgroundColor: "var(--neutral-100)" }}
              >
                <ArrowRight
                  style={{ width: 14, height: 14, color: "var(--primary-500)", marginTop: 2, flexShrink: 0 }}
                />
                <div className="min-w-0">
                  <p
                    className="font-medium leading-tight"
                    style={{ fontSize: "var(--text-body)", color: "var(--neutral-900)" }}
                  >
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline inline-flex items-center gap-1"
                        style={{ color: "var(--primary-700)" }}
                      >
                        {item.title}
                        <ExternalLink style={{ width: 11, height: 11 }} />
                      </a>
                    ) : (
                      item.title
                    )}
                  </p>
                  <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)", marginTop: 2 }}>
                    {item.description}
                  </p>
                </div>
              </div>
            </BriefingCardFeedback>
          ))}
          {data.shipped.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-1 self-start"
              style={{ fontSize: "var(--text-caption)", color: "var(--primary-600)" }}
            >
              {showAll ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
              {showAll ? "Show less" : `Show ${data.shipped.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {data.dbHighlights && (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", marginTop: 8 }}>
          {data.dbHighlights}
        </p>
      )}
    </SectionCard>
  );
}

// ── Section: Optimizations ────────────────────────────────────────────────────

function OptimizationsSection({
  items,
  briefingId,
  dateFor,
  narrative,
}: {
  items: OptimizationItem[];
  briefingId: string;
  dateFor: string;
  narrative: string;
}) {
  const t = useTranslations("morningBriefing");
  return (
    <SectionCard
      title={t("sectionOptimizations")}
      icon={Lightbulb}
      bg="var(--primary-100)"
      fg="var(--primary-700)"
    >
      {items.length === 0 ? (
        <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)" }}>
          No optimizations identified for this period.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => (
            <BriefingCardFeedback
              key={i}
              briefingId={briefingId}
              section="OPTIMIZATION"
              itemKey={`opt-${i}`}
              itemData={item as unknown as Record<string, unknown>}
              briefingContext={{ dateFor, narrative }}
            >
              <div
                className="rounded-md p-3"
                style={{ backgroundColor: "var(--neutral-0)", border: "1px solid var(--primary-100)" }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p
                    className="font-semibold leading-tight"
                    style={{ fontSize: "var(--text-body)", color: "var(--neutral-900)" }}
                  >
                    {item.title}
                  </p>
                  <PriorityBadge priority={item.priority} />
                </div>
                <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)", marginBottom: 6 }}>
                  {item.description}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--success-600)" }}
                  >
                    {t("labelEstROI")}: {item.estimatedROI}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      backgroundColor: "var(--neutral-100)",
                      color: "var(--neutral-600)",
                      padding: "1px 6px",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    {item.category}
                  </span>
                </div>
              </div>
            </BriefingCardFeedback>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Section: Issues & Challenges ──────────────────────────────────────────────

function IssuesSection({
  items,
  briefingId,
  dateFor,
  narrative,
}: {
  items: ChallengeItem[];
  briefingId: string;
  dateFor: string;
  narrative: string;
}) {
  const t = useTranslations("morningBriefing");
  return (
    <SectionCard
      title={t("sectionIssues")}
      icon={AlertTriangle}
      bg="var(--warning-100)"
      fg="var(--warning-600)"
    >
      {items.length === 0 ? (
        <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)" }}>
          No issues or challenges recorded.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => (
            <BriefingCardFeedback
              key={i}
              briefingId={briefingId}
              section="ISSUE"
              itemKey={`issue-${i}`}
              itemData={item as unknown as Record<string, unknown>}
              briefingContext={{ dateFor, narrative }}
            >
              <div
                className="rounded-md p-3"
                style={{ backgroundColor: "var(--neutral-0)", border: "1px solid var(--warning-100)" }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p
                    style={{
                      fontSize: "var(--text-body)",
                      color: "var(--neutral-900)",
                      fontWeight: 500,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.description}
                  </p>
                  <ResolutionBadge resolution={item.resolution} />
                </div>
                <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)", marginBottom: 4 }}>
                  {item.impact}
                </p>
                {item.suggestedAction && (
                  <p
                    className="flex items-start gap-1"
                    style={{ fontSize: "var(--text-caption)", color: "var(--primary-600)" }}
                  >
                    <ArrowRight style={{ width: 12, height: 12, marginTop: 2, flexShrink: 0 }} />
                    {item.suggestedAction}
                  </p>
                )}
              </div>
            </BriefingCardFeedback>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Section: ROI Analysis ─────────────────────────────────────────────────────

function ROISection({
  data,
  briefingId,
  dateFor,
  narrative,
}: {
  data: DailyBriefingReport["roiAnalysis"];
  briefingId: string;
  dateFor: string;
  narrative: string;
}) {
  const t = useTranslations("morningBriefing");
  return (
    <SectionCard
      title={t("sectionROI")}
      icon={TrendingUp}
      bg="var(--success-100)"
      fg="var(--success-600)"
    >
      <p
        className="mb-4 leading-relaxed"
        style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)" }}
      >
        {data.summary}
      </p>
      <div className="flex flex-col gap-2 mb-4">
        {data.items.map((item: ROILineItem, i: number) => (
          <BriefingCardFeedback
            key={i}
            briefingId={briefingId}
            section="ROI_ITEM"
            itemKey={`roi-${i}`}
            itemData={item as unknown as Record<string, unknown>}
            briefingContext={{ dateFor, narrative }}
          >
            <div
              className="flex items-start justify-between gap-4 py-2 border-b"
              style={{ borderColor: "var(--neutral-200)" }}
            >
              <div className="min-w-0">
                <p
                  className="font-medium"
                  style={{ fontSize: "var(--text-body)", color: "var(--neutral-900)" }}
                >
                  {item.area}
                </p>
                <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                  {item.reasoning}
                </p>
              </div>
              <span
                className="font-semibold whitespace-nowrap"
                style={{ fontSize: "var(--text-body)", color: "var(--success-600)", flexShrink: 0 }}
              >
                {item.value}
              </span>
            </div>
          </BriefingCardFeedback>
        ))}
      </div>
      <div
        className="rounded-md px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: "var(--success-600)" }}
      >
        <span style={{ fontSize: "var(--text-body)", color: "white", fontWeight: 600 }}>
          {t("labelROITotal")}
        </span>
        <span style={{ fontSize: "var(--text-subheading)", color: "white", fontWeight: 700 }}>
          {data.totalEstimatedValue}
        </span>
      </div>
    </SectionCard>
  );
}

// ── Section: Tech Pulse ───────────────────────────────────────────────────────

function TechPulseSection({ data }: { data: DailyBriefingReport["techPulse"] }) {
  const t = useTranslations("morningBriefing");
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <SectionCard
      title={t("sectionTechPulse")}
      icon={Zap}
      bg="var(--secondary-100, #f0f4ff)"
      fg="var(--secondary-700, #3b4cb8)"
    >
      <p
        className="mb-4 leading-relaxed"
        style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)" }}
      >
        {data.summary}
      </p>
      <div className="flex flex-col gap-2">
        {data.items.map((item: TechPulseItem, i: number) => (
          <div
            key={i}
            className="rounded-md overflow-hidden"
            style={{ border: "1px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)" }}
          >
            <button
              className="w-full flex items-start justify-between gap-3 p-3 text-left"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="min-w-0">
                <p
                  className="font-medium leading-tight"
                  style={{ fontSize: "var(--text-body)", color: "var(--neutral-900)" }}
                >
                  {item.title}
                </p>
                <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", marginTop: 2 }}>
                  {t("labelSource")}: {item.source}
                </p>
              </div>
              {expanded === i ? (
                <ChevronUp style={{ width: 16, height: 16, color: "var(--neutral-400)", flexShrink: 0, marginTop: 2 }} />
              ) : (
                <ChevronDown style={{ width: 16, height: 16, color: "var(--neutral-400)", flexShrink: 0, marginTop: 2 }} />
              )}
            </button>
            {expanded === i && (
              <div
                className="px-3 pb-3 border-t"
                style={{ borderColor: "var(--neutral-100)" }}
              >
                <p
                  className="mt-2 leading-relaxed"
                  style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)" }}
                >
                  {item.relevance}
                </p>
                {item.opportunityAngle && (
                  <div
                    className="mt-2 rounded-md p-3 flex items-start gap-2"
                    style={{ backgroundColor: "var(--primary-100)" }}
                  >
                    <Sparkles style={{ width: 14, height: 14, color: "var(--primary-600)", marginTop: 1, flexShrink: 0 }} />
                    <p style={{ fontSize: "var(--text-caption)", color: "var(--primary-700)", lineHeight: 1.5 }}>
                      {item.opportunityAngle}
                    </p>
                  </div>
                )}
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1 text-xs"
                    style={{ color: "var(--primary-600)" }}
                  >
                    <ExternalLink style={{ width: 11, height: 11 }} />
                    Read article
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Section: Today's Sprint ───────────────────────────────────────────────────

function SprintSection({
  data,
  briefingId,
  dateFor,
  narrative,
}: {
  data: DailyBriefingReport["todaysSprint"];
  briefingId: string;
  dateFor: string;
  narrative: string;
}) {
  const t = useTranslations("morningBriefing");
  return (
    <SectionCard
      title={t("sectionSprint")}
      icon={Rocket}
      bg="var(--primary-700)"
      fg="white"
      iconFg="var(--primary-100)"
    >
      <div
        className="rounded-md px-4 py-2 mb-4 inline-block"
        style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
      >
        <span style={{ fontSize: "var(--text-caption)", color: "rgba(255,255,255,0.7)" }}>
          {t("sprintTheme")}:{" "}
        </span>
        <span style={{ fontSize: "var(--text-body)", color: "white", fontWeight: 600 }}>
          {data.theme}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {data.items.map((item: SprintItem) => (
          <BriefingCardFeedback
            key={item.priority}
            briefingId={briefingId}
            section="SPRINT_ITEM"
            itemKey={`sprint-${item.priority}`}
            itemData={item as unknown as Record<string, unknown>}
            briefingContext={{ dateFor, narrative }}
          >
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: item.priority === 1 ? "var(--warning-600)" : "rgba(255,255,255,0.2)",
                    fontSize: "var(--text-caption)",
                    color: "white",
                    fontWeight: 700,
                  }}
                >
                  {item.priority}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-semibold leading-tight"
                    style={{ fontSize: "var(--text-body)", color: "white", marginBottom: 4 }}
                  >
                    {item.task}
                  </p>
                  <p style={{ fontSize: "var(--text-caption)", color: "rgba(255,255,255,0.75)", marginBottom: 6, lineHeight: 1.4 }}>
                    {item.why}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="flex items-center gap-1"
                      style={{ fontSize: "var(--text-caption)", color: "rgba(255,255,255,0.6)" }}
                    >
                      <Clock style={{ width: 11, height: 11 }} />
                      {item.timeEstimate}
                    </span>
                    <span
                      className="flex items-center gap-1"
                      style={{ fontSize: "var(--text-caption)", color: "var(--success-100)" }}
                    >
                      <TrendingUp style={{ width: 11, height: 11 }} />
                      {item.estimatedImpact}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </BriefingCardFeedback>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Section: Morning Insight ──────────────────────────────────────────────────

function InsightSection({
  text,
  briefingId,
  dateFor,
  narrative,
}: {
  text: string;
  briefingId: string;
  dateFor: string;
  narrative: string;
}) {
  const t = useTranslations("morningBriefing");
  return (
    <SectionCard
      title={t("sectionInsight")}
      icon={Sparkles}
      bg="var(--neutral-0)"
      fg="var(--neutral-900)"
      iconFg="var(--primary-500)"
    >
      <BriefingCardFeedback
        briefingId={briefingId}
        section="INSIGHT"
        itemKey="morning-insight"
        itemData={{ text } as Record<string, unknown>}
        briefingContext={{ dateFor, narrative }}
      >
        <blockquote
          className="border-l-4 pl-4 italic leading-relaxed"
          style={{
            borderColor: "var(--primary-500)",
            fontSize: "var(--text-body)",
            color: "var(--neutral-700)",
            margin: 0,
          }}
        >
          {text}
        </blockquote>
      </BriefingCardFeedback>
    </SectionCard>
  );
}

// ── Full briefing layout ──────────────────────────────────────────────────────

export function BriefingLayout({
  report,
  generatedAt,
  dateFor,
  briefingId,
  onRegenerate,
  regenerating,
  showRegenerate = true,
}: {
  report: DailyBriefingReport;
  generatedAt: string;
  dateFor: string;
  briefingId: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
  showRegenerate?: boolean;
}) {
  const t = useTranslations("morningBriefing");
  const generatedDate = new Date(generatedAt);
  const narrative = report.yesterdaysWork?.narrative ?? "";

  return (
    <div>
      {/* Header bar */}
      <div
        className="flex items-center justify-between flex-wrap gap-3 mb-6 px-6 py-4 rounded-lg"
        style={{ backgroundColor: "var(--neutral-0)", border: "1px solid var(--neutral-200)" }}
      >
        <div>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
            {t("coversDate", {
              date: new Date(dateFor + "T12:00:00Z").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }),
            })}
          </p>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-400)" }}>
            {t("generatedAt", {
              time: generatedDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
            })}
          </p>
        </div>
        {showRegenerate && onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="flex items-center gap-2 rounded-md px-4 py-2 transition-opacity disabled:opacity-60"
            style={{
              backgroundColor: "var(--neutral-100)",
              color: "var(--neutral-700)",
              fontSize: "var(--text-body)",
              border: "1px solid var(--neutral-300)",
            }}
          >
            <RefreshCw
              style={{ width: 14, height: 14 }}
              className={regenerating ? "animate-spin" : ""}
            />
            {regenerating ? t("generating") : t("regenerate")}
          </button>
        )}
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-5">
        <YesterdaysWorkSection
          data={report.yesterdaysWork}
          briefingId={briefingId}
          dateFor={dateFor}
          narrative={narrative}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <OptimizationsSection
            items={report.optimizationsRecognized}
            briefingId={briefingId}
            dateFor={dateFor}
            narrative={narrative}
          />
          <IssuesSection
            items={report.issuesAndChallenges}
            briefingId={briefingId}
            dateFor={dateFor}
            narrative={narrative}
          />
        </div>
        <ROISection
          data={report.roiAnalysis}
          briefingId={briefingId}
          dateFor={dateFor}
          narrative={narrative}
        />
        <TechPulseSection data={report.techPulse} />
        <SprintSection
          data={report.todaysSprint}
          briefingId={briefingId}
          dateFor={dateFor}
          narrative={narrative}
        />
        <InsightSection
          text={report.morningInsight}
          briefingId={briefingId}
          dateFor={dateFor}
          narrative={narrative}
        />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  const t = useTranslations("morningBriefing");
  return (
    <div
      className="flex flex-col items-center justify-center text-center rounded-xl py-20 px-8"
      style={{ backgroundColor: "var(--neutral-0)", border: "1px solid var(--neutral-200)" }}
    >
      <div
        className="rounded-full flex items-center justify-center mb-5"
        style={{ width: 72, height: 72, backgroundColor: "var(--primary-100)" }}
      >
        <Sun style={{ width: 36, height: 36, color: "var(--primary-600)" }} />
      </div>
      <h2
        className="mb-2"
        style={{ fontSize: "var(--text-heading)", fontWeight: 700, color: "var(--neutral-900)" }}
      >
        {t("emptyTitle")}
      </h2>
      <p
        className="mb-8 max-w-md"
        style={{ fontSize: "var(--text-body)", color: "var(--neutral-600)", lineHeight: 1.6 }}
      >
        {t("emptyDescription")}
      </p>
      <button
        onClick={onGenerate}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-opacity disabled:opacity-60"
        style={{
          backgroundColor: "var(--primary-700)",
          color: "white",
          fontSize: "var(--text-body)",
        }}
      >
        {loading ? (
          <>
            <RefreshCw style={{ width: 16, height: 16 }} className="animate-spin" />
            {t("generating")}
          </>
        ) : (
          <>
            <Sparkles style={{ width: 16, height: 16 }} />
            {t("generate")}
          </>
        )}
      </button>
    </div>
  );
}

// ── AI not configured ─────────────────────────────────────────────────────────

function AINotConfiguredBanner() {
  const t = useTranslations("morningBriefing");
  return (
    <div
      className="flex items-start gap-3 rounded-lg p-4"
      style={{
        backgroundColor: "var(--warning-100)",
        border: "1px solid var(--warning-600)",
      }}
    >
      <AlertCircle style={{ width: 18, height: 18, color: "var(--warning-600)", flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-800)" }}>
        {t("aiNotConfigured")}
      </p>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "today", label: "Today", icon: Sun },
    { id: "archive", label: "Archive", icon: Archive },
    { id: "analysis", label: "Analysis", icon: BarChart2 },
  ];

  return (
    <div
      className="flex rounded-lg overflow-hidden mb-6"
      style={{ border: "1px solid var(--neutral-200)", width: "fit-content" }}
    >
      {tabs.map(({ id, label, icon: Icon }, idx) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
          style={{
            backgroundColor: active === id ? "var(--primary-700)" : "var(--neutral-0)",
            color: active === id ? "white" : "var(--neutral-600)",
            borderRight: idx < tabs.length - 1 ? "1px solid var(--neutral-200)" : undefined,
          }}
        >
          <Icon style={{ width: 14, height: 14 }} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MorningBriefingClient({ aiEnabled }: Props) {
  const t = useTranslations("morningBriefing");
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [state, setState] = useState<BriefingState>({
    id: null,
    briefing: null,
    dateFor: null,
    generatedAt: null,
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cached briefing on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/daily-briefing");
        if (res.ok) {
          const data = await res.json();
          setState({
            id: (data.id as string | null) ?? null,
            briefing: data.briefing,
            dateFor: data.dateFor,
            generatedAt: data.generatedAt ?? null,
          });
        }
      } catch {
        // Non-fatal — just show empty state
      } finally {
        setInitialLoading(false);
      }
    })();
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-briefing", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        const msg = (data.error as string) ?? "Generation failed";
        setError(msg);
        toast.error(t("errorTitle"), { description: msg });
        return;
      }

      setState({
        id: (data.id as string | null) ?? null,
        briefing: data.briefing,
        dateFor: data.dateFor,
        generatedAt: data.generatedAt,
      });
      toast.success(t("title"), { description: "Briefing generated successfully." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      toast.error(t("errorTitle"), { description: msg });
    } finally {
      setGenerating(false);
    }
  }, [t]);

  // ── Page header ─────────────────────────────────────────────────────────
  const pageHeader = (
    <div className="mb-6">
      <h1
        style={{
          fontSize: "var(--text-heading)",
          fontWeight: 700,
          color: "var(--neutral-900)",
          margin: 0,
          marginBottom: 4,
        }}
      >
        {t("title")}
      </h1>
      <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", margin: 0 }}>
        {t("subtitle")}
      </p>
    </div>
  );

  // ── Render states ────────────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <div style={{ padding: "var(--space-6)" }}>
        {pageHeader}
        <GeneratingSkeleton />
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--space-6)" }}>
      {pageHeader}

      {!aiEnabled && <AINotConfiguredBanner />}

      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* ── Today tab ── */}
      {activeTab === "today" && (
        <>
          {error && !state.briefing && (
            <div
              className="flex items-start gap-3 rounded-lg p-4 mb-4"
              style={{ backgroundColor: "var(--error-100)", border: "1px solid var(--error-600)" }}
            >
              <AlertCircle style={{ width: 18, height: 18, color: "var(--error-600)", flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--neutral-900)" }}>
                  {t("errorTitle")}
                </p>
                <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)", marginTop: 2 }}>
                  {error}
                </p>
                <button
                  onClick={handleGenerate}
                  className="mt-3 rounded-md px-3 py-1.5"
                  style={{
                    backgroundColor: "var(--error-600)",
                    color: "white",
                    fontSize: "var(--text-caption)",
                    fontWeight: 600,
                  }}
                >
                  {t("errorRetry")}
                </button>
              </div>
            </div>
          )}

          {generating && !state.briefing && (
            <div className="mb-4">
              <div
                className="flex items-center gap-3 rounded-lg px-5 py-4 mb-4"
                style={{ backgroundColor: "var(--primary-100)", border: "1px solid var(--primary-500)" }}
              >
                <RefreshCw style={{ width: 16, height: 16, color: "var(--primary-600)" }} className="animate-spin" />
                <p style={{ fontSize: "var(--text-body)", color: "var(--primary-700)", fontWeight: 500 }}>
                  {t("generating")} This takes 15–30 seconds.
                </p>
              </div>
              <GeneratingSkeleton />
            </div>
          )}

          {!state.briefing && !generating && (
            <EmptyState onGenerate={handleGenerate} loading={generating} />
          )}

          {state.briefing && state.dateFor && state.generatedAt && (
            <BriefingLayout
              report={state.briefing}
              generatedAt={state.generatedAt}
              dateFor={state.dateFor}
              briefingId={state.id ?? "unknown"}
              onRegenerate={handleGenerate}
              regenerating={generating}
              showRegenerate
            />
          )}
        </>
      )}

      {/* ── Archive tab ── */}
      {activeTab === "archive" && (
        <BriefingArchiveTab
          renderBriefing={({ id, briefing, dateFor, generatedAt }) => (
            <BriefingLayout
              report={briefing}
              generatedAt={generatedAt}
              dateFor={dateFor}
              briefingId={id}
              showRegenerate={false}
            />
          )}
        />
      )}

      {/* ── Analysis tab ── */}
      {activeTab === "analysis" && <BriefingAnalysisTab />}
    </div>
  );
}
