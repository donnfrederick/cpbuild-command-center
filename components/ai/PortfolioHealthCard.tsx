"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import type { PortfolioReport, PortfolioRisk, RiskSeverity } from "@/lib/ai/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<RiskSeverity, { text: string; bg: string }> = {
  high:   { text: "var(--error-600)",   bg: "var(--error-100)"   },
  medium: { text: "var(--warning-600)", bg: "var(--warning-100)" },
  low:    { text: "var(--neutral-500)", bg: "var(--neutral-100)" },
};

function RiskRow({ risk, t }: { risk: PortfolioRisk; t: ReturnType<typeof useTranslations> }) {
  const style = SEVERITY_COLORS[risk.severity] ?? SEVERITY_COLORS.low;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", padding: "var(--space-1) 0", borderBottom: "1px solid var(--neutral-100)" }}>
      <span style={{ fontSize: "var(--text-caption)", fontWeight: 700, color: style.text, background: style.bg, padding: "1px 6px", borderRadius: 99, whiteSpace: "nowrap", marginTop: 1 }}>
        {t(`risk${risk.severity.charAt(0).toUpperCase() + risk.severity.slice(1)}` as "riskHigh" | "riskMedium" | "riskLow")}
      </span>
      <div>
        <p style={{ margin: 0, fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--neutral-800)" }}>{risk.projectName}</p>
        <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>{risk.reason}</p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {[90, 70, 80, 60].map((w, i) => (
        <div key={i} style={{ height: 13, width: `${w}%`, borderRadius: 4, background: "var(--neutral-100)" }} />
      ))}
    </div>
  );
}

type FetchState = "idle" | "loading" | "success" | "error";

const ERROR_KEY_MAP: Record<string, "errorQuota" | "errorRateLimit" | "errorGeneric"> = {
  QUOTA_EXCEEDED: "errorQuota",
  RATE_LIMITED:   "errorRateLimit",
};

// ── Main Component ────────────────────────────────────────────────────────────

export function PortfolioHealthCard() {
  const t = useTranslations("ai");

  const [state, setState] = useState<FetchState>("idle");
  const [report, setReport] = useState<PortfolioReport | null>(null);
  const [errorKey, setErrorKey] = useState<"errorQuota" | "errorRateLimit" | "errorGeneric">("errorGeneric");

  const analyze = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "portfolio" }),
      });
      const data = await res.json() as { portfolio?: PortfolioReport; error?: string };

      if (!res.ok) {
        if (data.error === "AI_DISABLED") {
          // Silently stay idle — key not configured
          setState("idle");
          return;
        }
        setErrorKey(ERROR_KEY_MAP[data.error ?? ""] ?? "errorGeneric");
        setState("error");
        return;
      }

      if (data.portfolio) {
        setReport(data.portfolio);
        setState("success");
      }
    } catch {
      setErrorKey("errorGeneric");
      setState("error");
    }
  }, []);

  return (
    <div
      style={{
        backgroundColor: "var(--neutral-0)",
        border: "1px solid var(--neutral-300)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-4)",
          borderBottom: "1px solid var(--neutral-300)",
          background: "var(--primary-100)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Sparkles size={16} color="var(--primary-700)" aria-hidden />
          <h4 style={{ margin: 0, fontSize: "var(--text-subheading)", fontWeight: 500, color: "var(--neutral-900)" }}>
            {t("portfolioHealth")}
          </h4>
        </div>
        {state === "success" && (
          <button
            onClick={analyze}
            aria-label={t("refresh")}
            title={t("refresh")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--neutral-500)",
              display: "flex",
              alignItems: "center",
              padding: "var(--space-1)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "var(--space-4)", flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Idle state — show trigger button */}
        {state === "idle" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-3)", minHeight: 100 }}>
            <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-500)", textAlign: "center" }}>
              Scan all active projects for risks, blocks, and health indicators.
            </p>
            <button
              onClick={analyze}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                height: "var(--button-height)",
                padding: "0 var(--space-4)",
                background: "var(--primary-500)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontWeight: 600,
                fontSize: "var(--text-body)",
                cursor: "pointer",
              }}
            >
              <Sparkles size={14} aria-hidden />
              {t("analyzeUnits").replace("Units", "Portfolio")}
            </button>
          </div>
        )}

        {state === "loading" && <Skeleton />}

        {state === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--error-600)" }}>
              {t(errorKey)}
            </p>
            <button
              onClick={analyze}
              style={{
                alignSelf: "flex-start",
                fontSize: "var(--text-caption)",
                color: "var(--primary-500)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {t("refresh")}
            </button>
          </div>
        )}

        {state === "success" && report && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {/* Stats row */}
            <div style={{ display: "flex", gap: "var(--space-4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <ShieldAlert size={16} color="var(--error-600)" aria-hidden />
                <span style={{ fontSize: "var(--text-subheading)", fontWeight: 700, color: "var(--error-600)" }}>
                  {report.atRiskCount}
                </span>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>at risk</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <ShieldCheck size={16} color="var(--success-600)" aria-hidden />
                <span style={{ fontSize: "var(--text-subheading)", fontWeight: 700, color: "var(--success-600)" }}>
                  {report.healthyCount}
                </span>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>healthy</span>
              </div>
            </div>

            {/* Summary */}
            <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-700)", lineHeight: 1.6 }}>
              {report.summary}
            </p>

            {/* Top risks */}
            {report.topRisks.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {report.topRisks.map((risk, i) => (
                  <RiskRow key={i} risk={risk} t={t} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
