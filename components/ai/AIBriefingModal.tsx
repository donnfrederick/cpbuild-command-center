"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, X, Copy, Check, Printer, Loader2 } from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AIBriefingModalProps {
  projectId: string;
  projectName: string;
}

// ── Lightweight markdown renderer ─────────────────────────────────────────────
// Converts headings, bold, bullet lists to HTML without extra dependencies.

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headings
    .replace(/^## (.+)$/gm, '<h2 style="font-size:var(--text-subheading);font-weight:600;color:var(--neutral-900);margin:1.2em 0 0.4em">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:var(--text-body);font-weight:600;color:var(--neutral-700);margin:1em 0 0.3em">$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Bullet lists — wrap consecutive li into ul
    .replace(/^[*-] (.+)$/gm, '<li style="margin-bottom:4px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (block) => `<ul style="padding-left:20px;margin:0.4em 0">${block}</ul>`)
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom:6px">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--neutral-200);margin:1em 0">')
    // Paragraphs — double newlines become <p>
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[h|u|l|h|p])(.+)$/gm, (line) => line.trim() ? line : "");
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AIBriefingModal({ projectId, projectName }: AIBriefingModalProps) {
  const t = useTranslations("ai");

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOpen(true);

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "briefing", projectId }),
      });
      const data = await res.json() as { briefing?: string; error?: string };

      if (!res.ok || !data.briefing) {
        const code = data.error ?? "GENERIC";
        if (code === "AI_DISABLED") setError(t("errorDisabled"));
        else if (code === "RATE_LIMITED") setError(t("errorRateLimit"));
        else if (code === "No unit data available to analyze.") setError(t("errorNoData"));
        else setError(t("errorGeneric"));
      } else {
        setBriefing(data.briefing);
      }
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  const copyToClipboard = useCallback(async () => {
    if (!briefing) return;
    await navigator.clipboard.writeText(briefing);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [briefing]);

  const print = useCallback(() => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Site Briefing — ${projectName}</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1f24; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .subtitle { font-size: 12px; color: #6e7781; margin-bottom: 24px; }
            h2 { font-size: 16px; font-weight: 600; margin: 20px 0 8px; }
            h3 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; }
            ul { padding-left: 20px; }
            li { margin-bottom: 4px; }
            hr { border: none; border-top: 1px solid #c9d1d9; margin: 16px 0; }
            p { line-height: 1.6; margin: 8px 0; }
            @media print { body { margin: 1rem; } }
          </style>
        </head>
        <body>
          <h1>Site Briefing — ${projectName}</h1>
          <p class="subtitle">Generated ${new Date().toLocaleString()} · CP Build Field Tracker</p>
          <div>${renderMarkdown(briefing ?? "")}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }, [briefing, projectName]);

  const close = useCallback(() => {
    setOpen(false);
    setBriefing(null);
    setError(null);
  }, []);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={generate}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          height: "var(--button-height)",
          padding: "0 var(--space-4)",
          background: "var(--neutral-0)",
          color: "var(--primary-700)",
          border: "1px solid var(--primary-500)",
          borderRadius: "var(--radius-md)",
          fontWeight: 600,
          fontSize: "var(--text-body)",
          cursor: "pointer",
        }}
        aria-label={t("generateBriefing")}
      >
        <Sparkles size={15} aria-hidden />
        {t("generateBriefing")}
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-4)",
          }}
        >
          <div
            style={{
              background: "var(--neutral-0)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              width: "100%",
              maxWidth: 720,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--space-4) var(--space-6)",
                borderBottom: "1px solid var(--neutral-200)",
                background: "var(--primary-100)",
                flexShrink: 0,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <Sparkles size={16} color="var(--primary-700)" aria-hidden />
                  <h2 style={{ margin: 0, fontSize: "var(--text-subheading)", fontWeight: 600, color: "var(--primary-700)" }}>
                    {t("briefingTitle")}
                  </h2>
                </div>
                <p style={{ margin: "2px 0 0", fontSize: "var(--text-caption)", color: "var(--secondary-500)" }}>
                  {t("briefingSubtitle", { projectName })}
                </p>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                {briefing && (
                  <>
                    <button
                      onClick={copyToClipboard}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "var(--text-caption)",
                        color: copied ? "var(--success-600)" : "var(--primary-500)",
                        background: "none",
                        border: "1px solid currentColor",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        padding: "var(--space-1) var(--space-2)",
                      }}
                      aria-label={t("copyBriefing")}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? t("briefingCopied") : t("copyBriefing")}
                    </button>
                    <button
                      onClick={print}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "var(--text-caption)",
                        color: "var(--neutral-600)",
                        background: "none",
                        border: "1px solid var(--neutral-300)",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        padding: "var(--space-1) var(--space-2)",
                      }}
                      aria-label={t("print")}
                    >
                      <Printer size={12} />
                      {t("print")}
                    </button>
                  </>
                )}
                <button
                  onClick={close}
                  aria-label="Close briefing"
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
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div
              ref={contentRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "var(--space-6)",
              }}
            >
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--neutral-500)" }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} aria-hidden />
                  <span style={{ fontSize: "var(--text-body)" }}>{t("generatingBriefing")}</span>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {error && (
                <p style={{ fontSize: "var(--text-body)", color: "var(--error-600)", margin: 0 }}>{error}</p>
              )}

              {briefing && !loading && (
                <div
                  style={{
                    fontSize: "var(--text-body)",
                    lineHeight: 1.7,
                    color: "var(--neutral-800)",
                  }}
                  dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(briefing)}</p>` }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
