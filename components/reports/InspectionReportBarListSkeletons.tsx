"use client";

import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const ROW_COUNT = 8;
const NAME_WIDTHS = [72, 58, 85, 64, 78, 55, 70, 62];
const BAR_WIDTHS = [68, 45, 82, 55, 70, 38, 60, 75];

const headerCaptionStyle: CSSProperties = {
  fontSize: "var(--text-caption, 12px)",
  fontWeight: 600,
  color: "var(--neutral-500)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

function BarListHeader({
  nameColumnLabel,
  ratesColumnLabel,
  nameFlex = "1 1 120px",
  ratesFlex = "1 1 280px",
  ratesMinWidth = 180,
}: {
  nameColumnLabel: string;
  ratesColumnLabel: string;
  nameFlex?: string;
  ratesFlex?: string;
  ratesMinWidth?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 0 6px",
        borderBottom: "1px solid var(--neutral-200)",
      }}
    >
      <div style={{ ...headerCaptionStyle, flex: nameFlex, minWidth: 0 }}>{nameColumnLabel}</div>
      <div
        style={{
          ...headerCaptionStyle,
          flex: ratesFlex,
          minWidth: ratesMinWidth,
          textAlign: "center",
        }}
      >
        {ratesColumnLabel}
      </div>
    </div>
  );
}

function PassFailSkeletonRow({ index }: { index: number }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid var(--neutral-200)",
      }}
    >
      <div style={{ flex: "1 1 120px", minWidth: 0 }}>
        <Skeleton style={{ width: `${NAME_WIDTHS[index]}%`, height: 14, maxWidth: 200 }} />
        <Skeleton style={{ width: `${BAR_WIDTHS[index]}%`, height: 12, maxWidth: 140, marginTop: 6 }} />
      </div>
      <div
        style={{
          flex: "1 1 280px",
          minWidth: 180,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Skeleton style={{ flexShrink: 0, width: 52, height: 12 }} />
        <Skeleton
          style={{
            flex: 1,
            height: 8,
            borderRadius: "var(--radius-sm, 6px)",
            minWidth: 48,
          }}
        />
        <Skeleton style={{ flexShrink: 0, width: 52, height: 12 }} />
      </div>
    </li>
  );
}

function DeficiencySkeletonRow({ index }: { index: number }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid var(--neutral-200)",
      }}
    >
      <div style={{ flex: "1 1 140px", minWidth: 0 }}>
        <Skeleton style={{ width: `${NAME_WIDTHS[index]}%`, height: 14, maxWidth: 220 }} />
        <Skeleton style={{ width: `${BAR_WIDTHS[(index + 3) % BAR_WIDTHS.length]}%`, height: 12, maxWidth: 120, marginTop: 6 }} />
      </div>
      <div
        style={{
          flex: "1 1 240px",
          minWidth: 160,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Skeleton style={{ flexShrink: 0, width: 36, height: 12 }} />
        <Skeleton
          style={{
            flex: 1,
            height: 8,
            borderRadius: "var(--radius-sm, 6px)",
            minWidth: 48,
          }}
        />
      </div>
    </li>
  );
}

interface InspectionPassFailBarListSkeletonProps {
  nameColumnLabel: string;
  ratesColumnLabel: string;
  loadingLabel: string;
}

export function InspectionPassFailBarListSkeleton({
  nameColumnLabel,
  ratesColumnLabel,
  loadingLabel,
}: InspectionPassFailBarListSkeletonProps) {
  return (
    <div aria-busy="true" aria-label={loadingLabel} style={{ flex: 1, minHeight: 240 }}>
      <BarListHeader nameColumnLabel={nameColumnLabel} ratesColumnLabel={ratesColumnLabel} />
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {Array.from({ length: ROW_COUNT }).map((_, i) => (
          <PassFailSkeletonRow key={i} index={i} />
        ))}
      </ul>
    </div>
  );
}

function DeficiencyAccordionSkeletonRow({ index }: { index: number }) {
  return (
    <li
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-md, 8px)",
        overflow: "hidden",
        backgroundColor: "var(--neutral-0)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
        }}
      >
        <Skeleton style={{ width: 16, height: 16, flexShrink: 0 }} />
        <Skeleton style={{ flex: 1, height: 14, maxWidth: `${NAME_WIDTHS[index]}%` }} />
        <Skeleton style={{ flexShrink: 0, width: 48, height: 12 }} />
      </div>
    </li>
  );
}

interface InspectionDeficiencyReportSkeletonProps {
  sectionColumnLabel: string;
  deficienciesColumnLabel: string;
  loadingLabel: string;
  variant?: "overview" | "grouped";
}

export function InspectionDeficiencyReportSkeleton({
  sectionColumnLabel,
  deficienciesColumnLabel,
  loadingLabel,
  variant = "overview",
}: InspectionDeficiencyReportSkeletonProps) {
  if (variant === "grouped") {
    return (
      <div aria-busy="true" aria-label={loadingLabel} style={{ flex: 1, minHeight: 240 }}>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <DeficiencyAccordionSkeletonRow key={i} index={i} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div aria-busy="true" aria-label={loadingLabel} style={{ flex: 1, minHeight: 240 }}>
      <Skeleton style={{ width: 280, height: 12, marginBottom: 10 }} />

      <div style={{ marginBottom: 12 }}>
        <Skeleton style={{ width: 120, height: 12, marginBottom: 6 }} />
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
              }}
            >
              <Skeleton style={{ flex: "0 0 88px", height: 12 }} />
              <Skeleton
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: "var(--radius-sm, 6px)",
                  minWidth: 48,
                }}
              />
              <Skeleton style={{ flexShrink: 0, width: 32, height: 12 }} />
            </li>
          ))}
        </ul>
      </div>

      <BarListHeader
        nameColumnLabel={sectionColumnLabel}
        ratesColumnLabel={deficienciesColumnLabel}
        nameFlex="1 1 140px"
        ratesFlex="1 1 240px"
        ratesMinWidth={160}
      />
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {Array.from({ length: ROW_COUNT }).map((_, i) => (
          <DeficiencySkeletonRow key={i} index={i} />
        ))}
      </ul>
    </div>
  );
}
