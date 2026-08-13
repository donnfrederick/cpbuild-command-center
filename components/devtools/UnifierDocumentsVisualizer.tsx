"use client";

import { useState, useEffect } from "react";
import { RefreshCw, FileText, AlertCircle, CheckCircle2 } from "lucide-react";

interface DiagnosticResult {
  yourUnifierPid: string | null;
  note: string;
  dataModel: {
    description: string;
    tables: { name: string; role: string }[];
    keyFields: { field: string; description: string }[];
  };
  attempts: { tableName: string; status: string; error?: string; rowCount?: number }[];
  success: {
    tableName: string;
    columns: string[];
    totalRows: number;
    distinctProjectIds: string[];
    projectIdCount: number;
    sampleRows: Record<string, unknown>[];
    yourPidInData: boolean | null;
    projectIdSample: string[];
  } | null;
}

export function UnifierDocumentsVisualizer() {
  const [pid, setPid] = useState("1455");
  const [data, setData] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = pid ? `?pid=${encodeURIComponent(pid)}` : "";
      const res = await fetch(`/api/devtools/unifier-documents${params}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-auto" style={{ padding: "var(--space-6)", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        <FileText size={24} style={{ color: "var(--primary-600)" }} aria-hidden />
        <div>
          <h3 style={{ margin: 0, fontSize: "var(--text-subheading)", fontWeight: 600 }}>Unifier Document Manager</h3>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
            Diagnostic view of where documents live and how project_id relates to unifierPid
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        <input
          type="text"
          value={pid}
          onChange={(e) => setPid(e.target.value)}
          placeholder="Your unifierPid (e.g. 1455)"
          style={{
            padding: "8px 12px",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-caption)",
            width: 180,
          }}
        />
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            padding: "8px 16px",
            backgroundColor: "var(--primary-600)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-caption)",
            cursor: loading ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: "var(--space-4)", backgroundColor: "var(--error-100)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertCircle size={20} style={{ color: "var(--error-600)", flexShrink: 0 }} />
          <span style={{ color: "var(--error-700)" }}>{error}</span>
        </div>
      )}

      {data && (
        <>
          {/* Data model diagram */}
          <section style={{ marginBottom: "var(--space-6)" }}>
            <h4 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-body)", fontWeight: 600 }}>Data model</h4>
            <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
              {data.dataModel.description}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {data.dataModel.tables.map((t) => (
                <div key={t.name} style={{ padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--neutral-50)", borderRadius: "var(--radius-sm)", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  <strong>{t.name}</strong> — {t.role}
                </div>
              ))}
            </div>
            <div style={{ marginTop: "var(--space-3)" }}>
              {data.dataModel.keyFields.map((f) => (
                <div key={f.field} style={{ fontSize: "var(--text-caption)", marginBottom: 4 }}>
                  <code style={{ backgroundColor: "var(--neutral-100)", padding: "2px 6px", borderRadius: 4 }}>{f.field}</code> — {f.description}
                </div>
              ))}
            </div>
          </section>

          {/* Attempts */}
          <section style={{ marginBottom: "var(--space-6)" }}>
            <h4 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-body)", fontWeight: 600 }}>Table attempts</h4>
            <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
              Tried these table names in order. First successful one with data is used.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {data.attempts.map((a, i) => (
                <span
                  key={i}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 11,
                    fontFamily: "ui-monospace, monospace",
                    backgroundColor: a.status === "ok" ? "var(--success-100)" : "var(--neutral-100)",
                    color: a.status === "ok" ? "var(--success-700)" : "var(--neutral-600)",
                  }}
                  title={a.error}
                >
                  {a.tableName} {a.status === "ok" ? `✓ ${a.rowCount} rows` : "✗"}
                </span>
              ))}
            </div>
          </section>

          {/* Success */}
          {data.success ? (
            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-3)" }}>
                <CheckCircle2 size={20} style={{ color: "var(--success-600)" }} />
                <h4 style={{ margin: 0, fontSize: "var(--text-body)", fontWeight: 600 }}>
                  Data from {data.success.tableName}
                </h4>
              </div>

              <div style={{ marginBottom: "var(--space-4)" }}>
                <strong>Total rows:</strong> {data.success.totalRows} |
                <strong style={{ marginLeft: 8 }}>Distinct project_ids:</strong> {data.success.projectIdCount}
                {data.yourUnifierPid && (
                  <span style={{ marginLeft: 8 }}>
                    | Your PID <code>{data.yourUnifierPid}</code> in data:{" "}
                    {data.success.yourPidInData ? (
                      <span style={{ color: "var(--success-600)" }}>Yes ✓</span>
                    ) : (
                      <span style={{ color: "var(--error-600)" }}>No — project_id may use different format</span>
                    )}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "var(--space-4)" }}>
                <strong>Project ID sample (first 20):</strong>
                <pre style={{ margin: "8px 0 0", padding: "var(--space-2)", backgroundColor: "var(--neutral-50)", borderRadius: "var(--radius-sm)", fontSize: 11, overflow: "auto" }}>
                  {JSON.stringify(data.success.projectIdSample, null, 2)}
                </pre>
              </div>

              <div style={{ marginBottom: "var(--space-4)" }}>
                <strong>Columns:</strong> {data.success.columns.join(", ")}
              </div>

              <div>
                <strong>Sample rows (first 5):</strong>
                <div style={{ marginTop: 8, overflow: "auto", maxHeight: 300 }}>
                  <pre style={{ margin: 0, padding: "var(--space-2)", backgroundColor: "var(--neutral-50)", borderRadius: "var(--radius-sm)", fontSize: 11 }}>
                    {JSON.stringify(data.success.sampleRows, null, 2)}
                  </pre>
                </div>
              </div>
            </section>
          ) : (
            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "var(--space-4)", backgroundColor: "var(--warning-100)", borderRadius: "var(--radius-md)" }}>
                <AlertCircle size={20} style={{ color: "var(--warning-600)" }} />
                <div>
                  <strong>No document table found.</strong> All table variants failed. Check the attempts above for error messages.
                  Try <code style={{ backgroundColor: "var(--neutral-100)", padding: "2px 6px" }}>?tables=1</code> on /api/devtools/unifier-metadata to see the exact PDS table names.
                </div>
              </div>
            </section>
          )}

          <p style={{ marginTop: "var(--space-6)", fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
            {data.note}
          </p>
        </>
      )}
    </div>
  );
}
