"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, X, ChevronDown, ChevronUp } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnomalyRow {
  id: string;
  building: string;
  level: string;
  unit: string;
  description: string;
  scopeStage: string | null;
  scopeStatus: string | null;
  percentComplete: number | null;
  finishDate: string | null;
}

interface Anomaly {
  type: "duplicate" | "progressNoStage" | "inProgressNoDate";
  label: string;
  rows: string[];
}

interface AIAnomalyBadgeProps {
  rows: AnomalyRow[];
}

// ── Detection logic ───────────────────────────────────────────────────────────

function detectAnomalies(rows: AnomalyRow[], t: ReturnType<typeof useTranslations>): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // 1. Duplicate scope rows: same building+level+unit+description
  const seen = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.building}|${row.level}|${row.unit}|${row.description}`.toLowerCase();
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(`${row.building} L${row.level} U${row.unit}`);
  }
  const dupes = [...seen.values()].filter((v) => v.length > 1);
  if (dupes.length > 0) {
    anomalies.push({
      type: "duplicate",
      label: t("anomalyDuplicateScope"),
      rows: dupes.map((v) => v[0]),
    });
  }

  // 2. percentComplete > 0 but scopeStatus is NOT_STARTED or null
  const progressNoStage = rows.filter(
    (r) =>
      r.percentComplete != null &&
      r.percentComplete > 0 &&
      (r.scopeStatus === "NOT_STARTED" || r.scopeStatus === null)
  );
  if (progressNoStage.length > 0) {
    anomalies.push({
      type: "progressNoStage",
      label: t("anomalyProgressNoStage"),
      rows: progressNoStage.map((r) => `${r.building} L${r.level} U${r.unit}: ${r.description || "—"} (${r.percentComplete}%)`),
    });
  }

  // 3. IN_PROGRESS with no finishDate
  const inProgressNoDate = rows.filter(
    (r) => r.scopeStatus === "IN_PROGRESS" && !r.finishDate
  );
  if (inProgressNoDate.length > 0) {
    anomalies.push({
      type: "inProgressNoDate",
      label: t("anomalyInProgressNoDate"),
      rows: inProgressNoDate.map((r) => `${r.building} L${r.level} U${r.unit}: ${r.description || "—"}`),
    });
  }

  return anomalies;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AIAnomalyBadge({ rows }: AIAnomalyBadgeProps) {
  const t = useTranslations("ai");
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const anomalies = useMemo(() => detectAnomalies(rows, t), [rows, t]);
  const count = anomalies.reduce((n, a) => n + a.rows.length, 0);

  if (count === 0 || dismissed) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-1)",
          padding: "var(--space-1) var(--space-2)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--warning-600)",
          background: "var(--warning-100)",
          color: "var(--warning-600)",
          fontSize: "var(--text-caption)",
          fontWeight: 600,
          cursor: "pointer",
        }}
        aria-expanded={open}
        aria-label={count === 1 ? t("anomalyBadge", { count }) : t("anomalyBadgePlural", { count })}
      >
        <AlertCircle size={12} aria-hidden />
        {count === 1 ? t("anomalyBadge", { count }) : t("anomalyBadgePlural", { count })}
        {open ? <ChevronUp size={11} aria-hidden /> : <ChevronDown size={11} aria-hidden />}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 200,
            background: "var(--neutral-0)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-2)",
            padding: "var(--space-4)",
            minWidth: 320,
            maxWidth: 480,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--neutral-900)" }}>
              {t("anomaliesTitle")}
            </span>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                onClick={() => setDismissed(true)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}
              >
                {t("dismiss")}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--neutral-400)", display: "flex", alignItems: "center" }}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {anomalies.map((anomaly) => (
              <div key={anomaly.type}>
                <p style={{ margin: "0 0 4px", fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--warning-600)" }}>
                  {anomaly.label} ({anomaly.rows.length})
                </p>
                <ul style={{ margin: 0, padding: "0 0 0 var(--space-4)" }}>
                  {anomaly.rows.slice(0, 5).map((r, i) => (
                    <li key={i} style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)", marginBottom: 2 }}>{r}</li>
                  ))}
                  {anomaly.rows.length > 5 && (
                    <li style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                      +{anomaly.rows.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
