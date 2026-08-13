"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface CanonicalScope {
  id: string;
  code: string;
  displayName: string;
}

interface ScopeRow {
  scopeTypeId: string;
  code: string;
  name: string;
  globalCanonical: CanonicalScope | null;
  projectOverride: CanonicalScope | null;
}

interface ScopeSetupPanelProps {
  projectId: string;
  /** Called after any mapping change so the parent can re-fetch units. */
  onMappingChanged?: () => void;
}

export function ScopeSetupPanel({ projectId, onMappingChanged }: ScopeSetupPanelProps) {
  const t = useTranslations("scopeSetup");

  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [canonicals, setCanonicals] = useState<CanonicalScope[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const [showNewGlobal, setShowNewGlobal] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [addingGlobal, setAddingGlobal] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [scopesRes, canonicalsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/scope-overrides`),
        fetch("/api/canonical-scopes"),
      ]);
      if (!scopesRes.ok || !canonicalsRes.ok) {
        toast.error(t("loadError"));
        return;
      }
      const scopesData = (await scopesRes.json()) as { scopes: ScopeRow[] };
      const canonicalsData = (await canonicalsRes.json()) as {
        canonicalScopes: CanonicalScope[];
      };
      setScopes(scopesData.scopes ?? []);
      setCanonicals(canonicalsData.canonicalScopes ?? []);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /** Returns the effective canonical for a scope row (override takes priority). */
  function effectiveCanonical(row: ScopeRow): CanonicalScope | null {
    return row.projectOverride ?? row.globalCanonical ?? null;
  }

  async function handleMappingChange(scopeTypeId: string, canonicalScopeTypeId: string | null) {
    setSavingIds((prev) => new Set(prev).add(scopeTypeId));
    try {
      if (canonicalScopeTypeId === null) {
        const res = await fetch(
          `/api/projects/${projectId}/scope-overrides/${scopeTypeId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          toast.error(t("deleteError"));
          return;
        }
        toast.success(t("deleteSuccess"));
      } else {
        const res = await fetch(`/api/projects/${projectId}/scope-overrides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopeTypeId, canonicalScopeTypeId }),
        });
        if (!res.ok) {
          toast.error(t("saveError"));
          return;
        }
        toast.success(t("saveSuccess"));
      }
      // Refresh local state and notify parent
      await fetchData();
      onMappingChanged?.();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(scopeTypeId);
        return next;
      });
    }
  }

  async function handleAddGlobalScope() {
    const code = newCode.trim().toUpperCase();
    const displayName = newDisplayName.trim();
    if (!code || !displayName) return;

    setAddingGlobal(true);
    try {
      const res = await fetch("/api/canonical-scopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, displayName }),
      });
      if (!res.ok) {
        toast.error(t("addError"));
        return;
      }
      toast.success(t("addSuccess", { code }));
      setNewCode("");
      setNewDisplayName("");
      setShowNewGlobal(false);
      // Refresh canonicals list
      const canonicalsRes = await fetch("/api/canonical-scopes");
      if (canonicalsRes.ok) {
        const data = (await canonicalsRes.json()) as {
          canonicalScopes: CanonicalScope[];
        };
        setCanonicals(data.canonicalScopes ?? []);
      }
    } catch {
      toast.error(t("addError"));
    } finally {
      setAddingGlobal(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          padding: "var(--space-6) var(--space-4)",
          color: "var(--neutral-500)",
          fontSize: "var(--text-body)",
        }}
      >
        <span className="animate-spin" style={{ display: "inline-block", marginRight: "var(--space-2)" }}>⋯</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0, // required for flex children to shrink and allow inner scroll
        overflow: "hidden",
      }}
    >
      {/* Non-scrolling header section */}
      <div style={{ padding: "var(--space-4) var(--space-4) 0", display: "flex", flexDirection: "column", gap: "var(--space-4)", flexShrink: 0 }}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "var(--text-subheading)",
              fontWeight: 600,
              color: "var(--neutral-900)",
            }}
          >
            {t("title")}
          </h2>
          <p
            style={{
              margin: "var(--space-1) 0 0",
              fontSize: "var(--text-caption)",
              color: "var(--neutral-500)",
              maxWidth: 560,
            }}
          >
            {t("description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewGlobal((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-1)",
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--primary-600)",
            borderRadius: "var(--radius-sm)",
            background: "var(--neutral-0)",
            color: "var(--primary-600)",
            fontSize: "var(--text-caption)",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <Plus size={14} aria-hidden />
          {t("addNewGlobal")}
        </button>
      </div>

      {/* Inline new global scope form — 2 rows */}
      {showNewGlobal && (
        <div
          style={{
            border: "1px solid var(--primary-300)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            background: "var(--primary-50)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            maxWidth: 480,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-caption)",
              fontWeight: 600,
              color: "var(--primary-700)",
            }}
          >
            {t("newGlobalTitle")}
          </p>
          {/* Row 1 — inputs */}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder={t("codePlaceholder")}
              maxLength={8}
              style={{
                width: 110,
                flexShrink: 0,
                padding: "var(--space-2) var(--space-2)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                background: "var(--neutral-0)",
                fontFamily: "monospace",
              }}
            />
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder={t("displayNamePlaceholder")}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "var(--space-2) var(--space-2)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                background: "var(--neutral-0)",
              }}
            />
          </div>
          {/* Row 2 — actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={() => void handleAddGlobalScope()}
              disabled={addingGlobal || !newCode.trim() || !newDisplayName.trim()}
              style={{
                padding: "var(--space-1) var(--space-3)",
                background: addingGlobal || !newCode.trim() || !newDisplayName.trim()
                  ? "var(--neutral-300)"
                  : "var(--primary-600)",
                color: "var(--neutral-0)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                fontWeight: 500,
                cursor: addingGlobal || !newCode.trim() || !newDisplayName.trim() ? "not-allowed" : "pointer",
              }}
            >
              {addingGlobal ? t("adding") : t("addCanonical")}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewGlobal(false); setNewCode(""); setNewDisplayName(""); }}
              aria-label={t("cancelNew")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--neutral-500)",
                fontSize: "var(--text-caption)",
                padding: 0,
              }}
            >
              {t("cancelNew")}
            </button>
          </div>
        </div>
      )}

      </div>{/* end non-scrolling header section */}

      {/* Scope table — scrollable region */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 var(--space-4) var(--space-4)" }}>
      {scopes.length === 0 ? (
        <p style={{ color: "var(--neutral-500)", fontSize: "var(--text-body)", margin: 0 }}>
          {t("noScopesFound")}
        </p>
      ) : (
        <div
          style={{
            border: "1px solid var(--neutral-200)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "var(--text-body)",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--neutral-50)",
                  borderBottom: "1px solid var(--neutral-200)",
                }}
              >
                <th
                  style={{
                    textAlign: "left",
                    padding: "var(--space-2) var(--space-3)",
                    fontWeight: 600,
                    color: "var(--neutral-700)",
                    fontSize: "var(--text-caption)",
                  }}
                >
                  {t("colScopeInUPM")}
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "var(--space-2) var(--space-3)",
                    fontWeight: 600,
                    color: "var(--neutral-700)",
                    fontSize: "var(--text-caption)",
                  }}
                >
                  {t("colDisplaysAs")}
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "var(--space-2) var(--space-3)",
                    fontWeight: 600,
                    color: "var(--neutral-700)",
                    fontSize: "var(--text-caption)",
                    minWidth: 220,
                  }}
                >
                  {t("colChangeMapping")}
                </th>
              </tr>
            </thead>
            <tbody>
              {scopes.map((row) => {
                const effective = effectiveCanonical(row);
                const hasOverride = row.projectOverride !== null;
                const isUnlinked = effective === null;
                const isSaving = savingIds.has(row.scopeTypeId);

                return (
                  <tr
                    key={row.scopeTypeId}
                    style={{
                      borderBottom: "1px solid var(--neutral-100)",
                      background: isUnlinked ? "var(--warning-50, #fffbeb)" : "var(--neutral-0)",
                    }}
                  >
                    {/* Scope in UPM */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        verticalAlign: "middle",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 600,
                          color: "var(--neutral-800)",
                        }}
                      >
                        {row.code}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: "var(--text-caption)",
                          color: "var(--neutral-500)",
                          marginTop: 2,
                        }}
                      >
                        {row.name}
                      </span>
                    </td>

                    {/* Displays as */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        verticalAlign: "middle",
                      }}
                    >
                      {isUnlinked ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "var(--space-1)",
                            color: "var(--warning-600, #b45309)",
                            fontSize: "var(--text-caption)",
                          }}
                          title={t("warningUnlinked")}
                        >
                          <AlertTriangle size={14} aria-hidden />
                          {t("warningUnlinked")}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "var(--space-1)",
                            color: hasOverride ? "var(--primary-700)" : "var(--neutral-700)",
                          }}
                        >
                          {hasOverride && (
                            <CheckCircle
                              size={14}
                              aria-hidden
                              style={{ color: "var(--success-600, #15803d)" }}
                            />
                          )}
                          {effective!.displayName}
                          {hasOverride && (
                            <span
                              style={{
                                fontSize: "var(--text-caption)",
                                color: "var(--primary-600)",
                                fontStyle: "italic",
                              }}
                            >
                              ({effective!.code})
                            </span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* Change mapping dropdown */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        verticalAlign: "middle",
                      }}
                    >
                      <select
                        disabled={isSaving}
                        value={row.projectOverride?.id ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          void handleMappingChange(row.scopeTypeId, val === "" ? null : val);
                        }}
                        style={{
                          padding: "var(--space-1) var(--space-2)",
                          border: "1px solid var(--neutral-300)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "var(--text-caption)",
                          background: "var(--neutral-0)",
                          color: "var(--neutral-800)",
                          cursor: isSaving ? "not-allowed" : "pointer",
                          opacity: isSaving ? 0.6 : 1,
                          minWidth: 200,
                        }}
                        aria-label={`${t("colChangeMapping")}: ${row.code}`}
                      >
                        <option value="">{t("globalDefault")}</option>
                        {canonicals.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName} ({c.code})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>{/* end scrolling table region */}
    </div>
  );
}
