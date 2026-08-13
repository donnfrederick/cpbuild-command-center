"use client";

import React, { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { FileDown, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LevelScopeReportData } from "@/lib/level-scope-report";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import { LevelScopeReportGrid } from "@/components/projects/LevelScopeReportGrid";

// ─── Trigger ──────────────────────────────────────────────────────────────────

export function LevelScopeReportTrigger({
  report,
  projectName,
  projectId,
}: {
  report: LevelScopeReportData;
  projectName: string;
  projectId: string;
}) {
  const t = useTranslations("levelScopeReport");
  const [open, setOpen] = useState(false);
  if (report.levels.length === 0 || report.scopes.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "5px 12px",
          borderRadius: 8,
          border: "none",
          backgroundColor: "var(--primary-100)",
          color: "var(--primary-700)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {t("triggerLabel")}
      </button>
      <LevelScopeReportModal
        open={open}
        onClose={() => setOpen(false)}
        report={report}
        projectName={projectName}
        projectId={projectId}
      />
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function LevelScopeReportModal({
  open,
  onClose,
  report,
  projectName,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  report: LevelScopeReportData;
  projectName: string;
  projectId: string;
}) {
  const t = useTranslations("levelScopeReport");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/level-scope-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(formatPdfExportErrorToast(errBody, t("exportFailed")));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `progress-report-${projectId}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [projectId, projectName, t]);

  const { grandTotalPct } = report;

  const exportedAt = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        style={{
          width: "min(92vw, 640px)",
          maxWidth: "none",
          maxHeight: "88dvh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          borderRadius: 12,
        }}
      >
        {/* Header */}
        <DialogHeader style={{ padding: "16px 44px 14px 16px", borderBottom: "1px solid var(--neutral-150, #ececec)", flexShrink: 0, textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--neutral-400)", marginBottom: 3 }}>
                {t("modalBrand")}
              </div>
              <DialogTitle style={{ fontSize: 17, fontWeight: 700, color: "var(--neutral-900)", margin: 0 }}>
                {t("modalTitle")}
              </DialogTitle>
              <div style={{ fontSize: 12, color: "var(--neutral-400)", marginTop: 3 }}>
                {projectName} · {exportedAt}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: grandTotalPct > 0 ? "var(--success-600)" : "var(--neutral-300)", fontVariantNumeric: "tabular-nums" }}>
                {grandTotalPct}%
              </div>
              <div style={{ fontSize: 10, color: "var(--neutral-400)", marginTop: 2 }}>{t("overallLabel")}</div>
            </div>
          </div>
        </DialogHeader>

        {/* Pill grid */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "10px 14px 6px" }}>
          <LevelScopeReportGrid report={report} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--neutral-150, #ececec)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexShrink: 0,
            gap: 8,
          }}
        >
          {exportError && (
            <span style={{ fontSize: 12, color: "var(--error-600)" }}>{exportError}</span>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              backgroundColor: exporting ? "var(--neutral-200)" : "var(--neutral-900)",
              color: exporting ? "var(--neutral-500)" : "var(--neutral-0)",
              fontSize: 13,
              fontWeight: 600,
              cursor: exporting ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {exporting ? (
              <Loader2 size={14} strokeWidth={2.5} className="animate-spin" aria-hidden />
            ) : (
              <FileDown size={14} strokeWidth={2.5} aria-hidden />
            )}
            {exporting ? t("generatingPdf") : t("exportPdf")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
