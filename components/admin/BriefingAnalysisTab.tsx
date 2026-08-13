"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  RefreshCw,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  BarChart2,
  BookOpen,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Check,
  X,
} from "lucide-react";
import type { BriefingSynthesisReport } from "@/lib/ai/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Window = "30" | "90" | "all";

interface HistoryItem {
  dateFor: string;
  totalEstimatedValue: string;
  optimizationCount: number;
  issueCount: number;
  shippedCount: number;
}

interface BriefingRule {
  id: string;
  text: string;
  source: string;
  active: boolean;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseROIValue(val: string): number {
  if (!val || val.startsWith("N/A")) return 0;
  const match = val.replace(/,/g, "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

// ── ROI Trend Chart ───────────────────────────────────────────────────────────

function ROITrendChart({ items }: { items: HistoryItem[] }) {
  const data = [...items].reverse().map((item) => ({
    date: new Date(item.dateFor + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    roi: parseROIValue(item.totalEstimatedValue),
  }));

  return (
    <div>
      <p
        className="font-semibold mb-3"
        style={{ fontSize: "var(--text-body)", color: "var(--neutral-800)" }}
      >
        ROI Trend (estimated value per briefing)
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--neutral-200)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--neutral-500)" }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--neutral-500)" }} tickLine={false} />
          <Tooltip
            formatter={(value) => [`${value}`, "ROI value"]}
            contentStyle={{
              fontSize: 12,
              border: "1px solid var(--neutral-200)",
              borderRadius: 6,
            }}
          />
          <Line
            type="monotone"
            dataKey="roi"
            stroke="var(--success-600)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--success-600)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Activity Bar Chart ────────────────────────────────────────────────────────

function ActivityBarChart({ items }: { items: HistoryItem[] }) {
  const data = [...items].reverse().map((item) => ({
    date: new Date(item.dateFor + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    optimizations: item.optimizationCount,
    issues: item.issueCount,
    shipped: item.shippedCount,
  }));

  return (
    <div>
      <p
        className="font-semibold mb-3"
        style={{ fontSize: "var(--text-body)", color: "var(--neutral-800)" }}
      >
        Activity per Briefing
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--neutral-200)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--neutral-500)" }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--neutral-500)" }} tickLine={false} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              border: "1px solid var(--neutral-200)",
              borderRadius: 6,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="shipped" name="Shipped" fill="var(--primary-400)" radius={[3, 3, 0, 0]} />
          <Bar
            dataKey="optimizations"
            name="Optimizations"
            fill="var(--primary-600)"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="issues"
            name="Issues"
            fill="var(--warning-400)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── AI Synthesis Panel ────────────────────────────────────────────────────────

function SynthesisPanel({
  window,
  onWindowChange,
}: {
  window: Window;
  onWindowChange: (w: Window) => void;
}) {
  const [synthesis, setSynthesis] = useState<BriefingSynthesisReport | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSynthesis = useCallback(
    async (w: Window) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/daily-briefing/analysis?window=${w}`);
        if (!res.ok) throw new Error("Failed to load analysis");
        const data = await res.json();
        setSynthesis(data.synthesis as BriefingSynthesisReport | null);
        setGeneratedAt(data.generatedAt as string | null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadSynthesis(window);
  }, [window, loadSynthesis]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-briefing/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ window }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error as string) ?? "Generation failed");
      setSynthesis(data.synthesis as BriefingSynthesisReport);
      setGeneratedAt(data.generatedAt as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const windowLabels: Record<Window, string> = {
    "30": "Last 30 days",
    "90": "Last 90 days",
    all: "All time",
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--neutral-200)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between flex-wrap gap-3 px-5 py-4 border-b"
        style={{
          borderColor: "var(--neutral-200)",
          backgroundColor: "var(--neutral-0)",
        }}
      >
        <div className="flex items-center gap-2">
          <BookOpen style={{ width: 16, height: 16, color: "var(--primary-600)" }} />
          <h3
            style={{ fontSize: "var(--text-subheading)", fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}
          >
            AI Long-Term Synthesis
          </h3>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Window selector */}
          <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--neutral-300)" }}>
            {(["30", "90", "all"] as Window[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onWindowChange(w)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: window === w ? "var(--primary-700)" : "white",
                  color: window === w ? "white" : "var(--neutral-600)",
                  borderRight: w !== "all" ? "1px solid var(--neutral-300)" : undefined,
                }}
              >
                {windowLabels[w]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || loading}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-60"
            style={{
              backgroundColor: "var(--primary-700)",
              color: "white",
            }}
          >
            {generating ? (
              <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
            ) : (
              <RefreshCw style={{ width: 12, height: 12 }} />
            )}
            {generating ? "Analyzing..." : synthesis ? "Regenerate" : "Generate Analysis"}
          </button>
        </div>
      </div>

      <div className="px-5 py-5" style={{ backgroundColor: "var(--neutral-0)" }}>
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 style={{ width: 20, height: 20, color: "var(--primary-600)" }} className="animate-spin" />
          </div>
        )}

        {generating && !synthesis && (
          <div
            className="flex items-center gap-3 rounded-lg px-5 py-4 mb-4"
            style={{ backgroundColor: "var(--primary-100)", border: "1px solid var(--primary-500)" }}
          >
            <Loader2 style={{ width: 16, height: 16, color: "var(--primary-600)" }} className="animate-spin" />
            <p style={{ fontSize: "var(--text-body)", color: "var(--primary-700)", fontWeight: 500 }}>
              Analyzing briefings... This takes 15–30 seconds.
            </p>
          </div>
        )}

        {error && (
          <div
            className="rounded-lg p-4 mb-4"
            style={{ backgroundColor: "var(--error-100)", color: "var(--error-700)" }}
          >
            {error}
          </div>
        )}

        {!loading && !synthesis && !generating && (
          <div className="text-center py-12">
            <BarChart2
              style={{ width: 40, height: 40, color: "var(--neutral-300)", margin: "0 auto 12px" }}
            />
            <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)" }}>
              No analysis yet for this window. Click &quot;Generate Analysis&quot; to create one.
            </p>
          </div>
        )}

        {synthesis && (
          <div className="flex flex-col gap-6">
            {generatedAt && (
              <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-400)" }}>
                Generated {new Date(generatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })} · {synthesis.briefingCount} briefings · {synthesis.dateRangeStart} to {synthesis.dateRangeEnd}
              </p>
            )}

            {/* Summary */}
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: "var(--primary-100)", border: "1px solid var(--primary-200)" }}
            >
              <p style={{ fontSize: "var(--text-body)", color: "var(--primary-900)", lineHeight: 1.6 }}>
                {synthesis.summary}
              </p>
            </div>

            {/* ROI Trend */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp style={{ width: 14, height: 14, color: "var(--success-600)" }} />
                <h4 style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}>
                  ROI Trend
                </h4>
              </div>
              <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)", lineHeight: 1.6 }}>
                {synthesis.roiTrend}
              </p>
            </div>

            {/* Recurring Issues */}
            {synthesis.recurringIssues.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle style={{ width: 14, height: 14, color: "var(--warning-600)" }} />
                  <h4 style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}>
                    Recurring Issues
                  </h4>
                </div>
                <div className="flex flex-col gap-2">
                  {synthesis.recurringIssues.map((issue, i) => (
                    <div
                      key={i}
                      className="rounded-md p-3"
                      style={{
                        backgroundColor: "var(--warning-50, #fffbeb)",
                        border: "1px solid var(--warning-200)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p
                          className="font-medium"
                          style={{ fontSize: "var(--text-body)", color: "var(--neutral-900)" }}
                        >
                          {issue.description}
                        </p>
                        <span
                          className="rounded-full px-2 py-0.5 flex-shrink-0 text-xs font-medium"
                          style={{
                            backgroundColor: "var(--warning-200)",
                            color: "var(--warning-700)",
                          }}
                        >
                          {issue.occurrences}×
                        </span>
                      </div>
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)", marginBottom: 4 }}>
                        Last seen: {issue.lastSeen}
                      </p>
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--primary-700)" }}>
                        → {issue.suggestedAction}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Optimization Categories */}
            {synthesis.topOptimizationCategories.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb style={{ width: 14, height: 14, color: "var(--primary-600)" }} />
                  <h4 style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}>
                    Top Optimization Categories
                  </h4>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {synthesis.topOptimizationCategories.map((cat, i) => (
                    <div
                      key={i}
                      className="rounded-md p-3"
                      style={{
                        backgroundColor: "var(--primary-50, #f5f7ff)",
                        border: "1px solid var(--primary-200)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p
                          className="font-semibold"
                          style={{ fontSize: "var(--text-body)", color: "var(--primary-700)" }}
                        >
                          {cat.category}
                        </p>
                        <span
                          className="text-xs font-medium rounded-full px-2 py-0.5"
                          style={{ backgroundColor: "var(--primary-100)", color: "var(--primary-600)" }}
                        >
                          {cat.count}×
                        </span>
                      </div>
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)", marginBottom: 4 }}>
                        {cat.totalROISummary}
                      </p>
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", fontStyle: "italic" }}>
                        e.g. {cat.topExample}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Velocity observations */}
            <div>
              <p
                className="font-semibold mb-2"
                style={{ fontSize: "var(--text-body)", color: "var(--neutral-800)" }}
              >
                Velocity Observations
              </p>
              <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-700)", lineHeight: 1.6 }}>
                {synthesis.velocityObservations}
              </p>
            </div>

            {/* Recommendations */}
            {synthesis.recommendations.length > 0 && (
              <div>
                <p
                  className="font-semibold mb-3"
                  style={{ fontSize: "var(--text-body)", color: "var(--neutral-800)" }}
                >
                  Recommendations
                </p>
                <div className="flex flex-col gap-2">
                  {synthesis.recommendations.map((rec, i) => {
                    const colors: Record<string, { bg: string; fg: string }> = {
                      high: { bg: "var(--error-100)", fg: "var(--error-600)" },
                      medium: { bg: "var(--warning-100)", fg: "var(--warning-600)" },
                      low: { bg: "var(--success-100)", fg: "var(--success-600)" },
                    };
                    const c = colors[rec.priority] ?? colors.medium;
                    return (
                      <div
                        key={i}
                        className="rounded-md p-3 flex items-start gap-3"
                        style={{ backgroundColor: "var(--neutral-0)", border: "1px solid var(--neutral-200)" }}
                      >
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 mt-0.5 capitalize"
                          style={{ backgroundColor: c.bg, color: c.fg }}
                        >
                          {rec.priority}
                        </span>
                        <div>
                          <p
                            className="font-medium"
                            style={{ fontSize: "var(--text-body)", color: "var(--neutral-900)" }}
                          >
                            {rec.title}
                          </p>
                          <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)", marginTop: 2 }}>
                            {rec.rationale}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Briefing Rules Manager ────────────────────────────────────────────────────

function BriefingRulesManager() {
  const [rules, setRules] = useState<BriefingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/daily-briefing/rules");
        if (!res.ok) throw new Error("Failed to load rules");
        const data = await res.json();
        setRules(data.rules as BriefingRule[]);
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-briefing/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error as string) ?? "Failed to add rule");
      setRules((prev) => [data.rule as BriefingRule, ...prev]);
      setNewText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(rule: BriefingRule) {
    const res = await fetch(`/api/daily-briefing/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    if (res.ok) {
      const data = await res.json();
      setRules((prev) => prev.map((r) => (r.id === rule.id ? (data.rule as BriefingRule) : r)));
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/daily-briefing/rules/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editText.trim()) return;
    const res = await fetch(`/api/daily-briefing/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editText.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setRules((prev) => prev.map((r) => (r.id === id ? (data.rule as BriefingRule) : r)));
      setEditingId(null);
    }
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--neutral-200)" }}
    >
      <div
        className="flex items-center gap-2 px-5 py-4 border-b"
        style={{ borderColor: "var(--neutral-200)", backgroundColor: "var(--neutral-0)" }}
      >
        <BookOpen style={{ width: 16, height: 16, color: "var(--primary-600)" }} />
        <div>
          <h3
            style={{ fontSize: "var(--text-subheading)", fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}
          >
            Briefing Rules
          </h3>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", marginTop: 2 }}>
            Active rules are injected into every briefing generation prompt. Add rules to correct recurring mistakes.
          </p>
        </div>
      </div>

      <div className="px-5 py-4" style={{ backgroundColor: "var(--neutral-0)" }}>
        {/* Add rule form */}
        <form onSubmit={(e) => void handleAdd(e)} className="flex gap-2 mb-4">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder='Add a rule, e.g. "Never estimate user acquisition ROI — this is an internal tool"'
            rows={2}
            maxLength={2000}
            className="flex-1 rounded-md px-3 py-2 resize-none"
            style={{
              fontSize: "var(--text-caption)",
              border: "1px solid var(--neutral-300)",
              color: "var(--neutral-800)",
            }}
          />
          <button
            type="submit"
            disabled={adding || !newText.trim()}
            aria-label="Add rule"
            className="flex items-center gap-1.5 rounded-md px-3 py-2 font-medium text-xs disabled:opacity-50 self-end"
            style={{ backgroundColor: "var(--primary-700)", color: "white" }}
          >
            {adding ? (
              <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
            ) : (
              <Plus style={{ width: 12, height: 12 }} />
            )}
            Add
          </button>
        </form>

        {error && (
          <p className="mb-3 text-xs" style={{ color: "var(--error-600)" }}>
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 style={{ width: 20, height: 20, color: "var(--neutral-400)" }} className="animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-400)", textAlign: "center", padding: "16px 0" }}>
            No rules yet. The default internal-tool context is built into the prompt.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="rounded-md p-3"
                style={{
                  backgroundColor: rule.active ? "var(--neutral-0)" : "var(--neutral-50, #f8f9fa)",
                  border: `1px solid ${rule.active ? "var(--neutral-200)" : "var(--neutral-150, #e8e8e8)"}`,
                  opacity: rule.active ? 1 : 0.6,
                }}
              >
                {editingId === rule.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      className="w-full rounded-md px-2 py-1.5 resize-none"
                      style={{
                        fontSize: "var(--text-caption)",
                        border: "1px solid var(--neutral-300)",
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(rule.id)}
                        aria-label="Save edit"
                        className="rounded px-2 py-1 text-xs flex items-center gap-1"
                        style={{ backgroundColor: "var(--success-600)", color: "white" }}
                      >
                        <Check style={{ width: 11, height: 11 }} />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel edit"
                        className="rounded px-2 py-1 text-xs"
                        style={{ color: "var(--neutral-500)" }}
                      >
                        <X style={{ width: 11, height: 11 }} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        style={{
                          fontSize: "var(--text-caption)",
                          color: rule.active ? "var(--neutral-800)" : "var(--neutral-500)",
                          lineHeight: 1.5,
                        }}
                      >
                        {rule.text}
                      </p>
                      <p
                        className="mt-1"
                        style={{ fontSize: "10px", color: "var(--neutral-400)" }}
                      >
                        {rule.source === "FEEDBACK_DERIVED" ? "Auto-derived from feedback" : "Manual"} ·{" "}
                        {new Date(rule.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Toggle active */}
                      <button
                        type="button"
                        onClick={() => void handleToggle(rule)}
                        aria-label={rule.active ? "Deactivate rule" : "Activate rule"}
                        aria-pressed={rule.active}
                      >
                        {rule.active ? (
                          <ToggleRight style={{ width: 18, height: 18, color: "var(--success-600)" }} />
                        ) : (
                          <ToggleLeft style={{ width: 18, height: 18, color: "var(--neutral-400)" }} />
                        )}
                      </button>
                      {/* Edit */}
                      <button
                        type="button"
                        onClick={() => { setEditingId(rule.id); setEditText(rule.text); }}
                        aria-label="Edit rule"
                      >
                        <Pencil style={{ width: 13, height: 13, color: "var(--neutral-400)" }} />
                      </button>
                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => void handleDelete(rule.id)}
                        aria-label="Delete rule"
                      >
                        <Trash2 style={{ width: 13, height: 13, color: "var(--neutral-400)" }} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── BriefingAnalysisTab ───────────────────────────────────────────────────────

export function BriefingAnalysisTab() {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [synthesisWindow, setSynthesisWindow] = useState<Window>("30");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/daily-briefing/history");
        if (!res.ok) return;
        const data = await res.json();
        setHistoryItems(data.items as HistoryItem[]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Visual Dashboard */}
      {!historyLoading && historyItems.length >= 2 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--neutral-200)" }}
        >
          <div
            className="flex items-center gap-2 px-5 py-4 border-b"
            style={{ borderColor: "var(--neutral-200)", backgroundColor: "var(--neutral-0)" }}
          >
            <BarChart2 style={{ width: 16, height: 16, color: "var(--primary-600)" }} />
            <h3
              style={{ fontSize: "var(--text-subheading)", fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}
            >
              Visual Dashboard
            </h3>
            <span
              className="ml-2 text-xs rounded-full px-2 py-0.5"
              style={{ backgroundColor: "var(--neutral-100)", color: "var(--neutral-500)" }}
            >
              {historyItems.length} briefings
            </span>
          </div>
          <div
            className="px-5 py-5 grid gap-8 md:grid-cols-2"
            style={{ backgroundColor: "var(--neutral-0)" }}
          >
            <ROITrendChart items={historyItems} />
            <ActivityBarChart items={historyItems} />
          </div>
        </div>
      )}

      {!historyLoading && historyItems.length < 2 && (
        <div
          className="rounded-lg px-5 py-8 text-center"
          style={{
            backgroundColor: "var(--neutral-0)",
            border: "1px solid var(--neutral-200)",
          }}
        >
          <BarChart2
            style={{ width: 32, height: 32, color: "var(--neutral-300)", margin: "0 auto 8px" }}
          />
          <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)" }}>
            Charts appear once you have 2 or more briefings in the archive.
          </p>
        </div>
      )}

      {/* AI Synthesis */}
      <SynthesisPanel
        window={synthesisWindow}
        onWindowChange={setSynthesisWindow}
      />

      {/* Briefing Rules Manager */}
      <BriefingRulesManager />
    </div>
  );
}
