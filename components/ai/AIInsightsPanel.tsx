"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, RefreshCw, X, AlertTriangle, CheckCircle2, Zap, TrendingUp } from "lucide-react";
import type { InsightReport, Risk, Bottleneck, RiskSeverity } from "@/lib/ai/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AIInsightsPanelProps {
  projectId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type FetchState = "idle" | "loading" | "success" | "error";

type ErrorCode = "AI_DISABLED" | "RATE_LIMITED" | "QUOTA_EXCEEDED" | "NO_DATA" | "GENERIC";

function classifyError(detail: string): ErrorCode {
  if (detail === "AI_DISABLED") return "AI_DISABLED";
  if (detail === "RATE_LIMITED") return "RATE_LIMITED";
  if (detail === "QUOTA_EXCEEDED") return "QUOTA_EXCEEDED";
  if (detail === "No unit data available to analyze.") return "NO_DATA";
  return "GENERIC";
}

const RISK_STYLES: Record<RiskSeverity, { label: string; bg: string; text: string; dot: string }> = {
  high:   { label: "riskHigh",   bg: "var(--error-100)",   text: "var(--error-600)",   dot: "var(--error-600)"   },
  medium: { label: "riskMedium", bg: "var(--warning-100)", text: "var(--warning-600)", dot: "var(--warning-600)" },
  low:    { label: "riskLow",    bg: "var(--neutral-100)", text: "var(--neutral-700)", dot: "var(--neutral-500)" },
};

const STAGE_LABEL: Record<string, string> = {
  STAGING:  "Staging",
  ASSEMBLY: "Assembly",
  INSTALL:  "Install",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function RiskPill({ risk, t }: { risk: Risk; t: ReturnType<typeof useTranslations> }) {
  const style = RISK_STYLES[risk.severity] ?? RISK_STYLES.low;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-2)",
        borderRadius: "var(--radius-sm)",
        background: style.bg,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: style.dot,
          flexShrink: 0,
          marginTop: 5,
        }}
      />
      <div>
        <span
          style={{
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            color: style.text,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {t(style.label)}
        </span>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)", margin: 0, marginTop: 2 }}>
          {risk.description}
        </p>
      </div>
    </div>
  );
}

function BottleneckRow({ bottleneck }: { bottleneck: Bottleneck }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-1) 0",
        borderBottom: "1px solid var(--neutral-100)",
      }}
    >
      <span
        style={{
          fontSize: "var(--text-caption)",
          fontWeight: 600,
          color: "var(--primary-700)",
          minWidth: 72,
        }}
      >
        {STAGE_LABEL[bottleneck.stage] ?? bottleneck.stage}
      </span>
      <span
        style={{
          fontSize: "var(--text-caption)",
          color: "var(--error-600)",
          fontWeight: 600,
          minWidth: 24,
        }}
      >
        ×{bottleneck.unitCount}
      </span>
      <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)", flex: 1 }}>
        {bottleneck.reason}
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-4)" }}>
      {[80, 60, 90, 50].map((w, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${w}%`,
            borderRadius: 4,
            background: "var(--neutral-100)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIInsightsPanel({ projectId }: AIInsightsPanelProps) {
  const t = useTranslations("ai");

  const [state, setState] = useState<FetchState>("idle");
  const [report, setReport] = useState<InsightReport | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [visible, setVisible] = useState(true);

  const analyze = useCallback(async () => {
    setState("loading");
    setErrorCode(null);

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "units", projectId }),
      });

      const data = await res.json() as { insights?: InsightReport; error?: string };

      if (!res.ok) {
        setErrorCode(classifyError(data.error ?? "GENERIC"));
        setState("error");
        return;
      }

      if (data.insights) {
        setReport(data.insights);
        setState("success");
        setVisible(true);
      }
    } catch {
      setErrorCode("GENERIC");
      setState("error");
    }
  }, [projectId]);

  // Hidden when AI is disabled (503 from initial render context is unknown here — we rely on first error)
  if (!visible && state !== "idle") return null;

  const errorMessageKey: Record<ErrorCode, string> = {
    AI_DISABLED:     "errorDisabled",
    RATE_LIMITED:    "errorRateLimit",
    QUOTA_EXCEEDED:  "errorQuota",
    NO_DATA:         "errorNoData",
    GENERIC:         "errorGeneric",
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--neutral-300)",
        background: "var(--neutral-0)",
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
        marginBottom: "var(--space-4)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-2) var(--space-4)",
          background: "var(--primary-100)",
          borderBottom: "1px solid var(--neutral-300)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Sparkles size={16} color="var(--primary-700)" aria-hidden />
          <span style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--primary-700)" }}>
            {t("analysisTitle")}
          </span>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--secondary-500)" }}>
            {t("analysisSubtitle")}
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          {state === "success" && (
            <button
              onClick={analyze}
              disabled={false}
              aria-label={t("refresh")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: "var(--text-caption)",
                color: "var(--primary-500)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <RefreshCw size={12} />
              {t("refresh")}
            </button>
          )}
          {state !== "idle" && (
            <button
              onClick={() => { setVisible(false); setState("idle"); setReport(null); }}
              aria-label={t("dismiss")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--neutral-500)",
                padding: "var(--space-1)",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {state === "idle" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            padding: "var(--space-4)",
          }}
        >
          <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", margin: 0, flex: 1 }}>
            Get an AI-powered health check: risks, bottlenecks, and highlights from your unit data.
          </p>
          <button
            onClick={analyze}
            style={{
              display: "flex",
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
              flexShrink: 0,
            }}
          >
            <Sparkles size={14} aria-hidden />
            {t("analyzeUnits")}
          </button>
        </div>
      )}

      {state === "loading" && <Skeleton />}

      {state === "error" && errorCode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-4)",
          }}
        >
          <AlertTriangle size={16} color="var(--warning-600)" aria-hidden />
          <span style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)" }}>
            {t(errorMessageKey[errorCode])}
          </span>
          {errorCode !== "AI_DISABLED" && (
            <button
              onClick={analyze}
              style={{
                marginLeft: "auto",
                fontSize: "var(--text-caption)",
                color: "var(--primary-500)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              {t("refresh")}
            </button>
          )}
        </div>
      )}

      {state === "success" && report && (
        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Completion + Summary */}
          <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: "3px solid var(--primary-500)",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "var(--text-subheading)", fontWeight: 700, color: "var(--primary-700)", lineHeight: 1 }}>
                {report.completionPct}%
              </span>
            </div>
            <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)", margin: 0, lineHeight: 1.6 }}>
              {report.summary}
            </p>
          </div>

          <div style={{ display: "grid", gap: "var(--space-4)", gridTemplateColumns: "1fr 1fr" }}>
            {/* Risks */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", marginBottom: "var(--space-2)" }}>
                <AlertTriangle size={14} color="var(--warning-600)" aria-hidden />
                <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--neutral-700)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("risks")}
                </span>
              </div>
              {report.risks.length === 0 ? (
                <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", margin: 0 }}>
                  {t("noRisks")}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                  {report.risks.map((r, i) => <RiskPill key={i} risk={r} t={t} />)}
                </div>
              )}
            </div>

            {/* Bottlenecks */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", marginBottom: "var(--space-2)" }}>
                <Zap size={14} color="var(--error-600)" aria-hidden />
                <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--neutral-700)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("bottlenecks")}
                </span>
              </div>
              {report.bottlenecks.length === 0 ? (
                <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", margin: 0 }}>
                  {t("noBottlenecks")}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {report.bottlenecks.map((b, i) => <BottleneckRow key={i} bottleneck={b} />)}
                </div>
              )}
            </div>
          </div>

          {/* Highlights */}
          {report.highlights.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", marginBottom: "var(--space-2)" }}>
                <TrendingUp size={14} color="var(--success-600)" aria-hidden />
                <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--neutral-700)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("highlights")}
                </span>
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {report.highlights.map((h, i) => (
                  <li key={i} style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)" }}>
                    <CheckCircle2 size={11} color="var(--success-600)" style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
