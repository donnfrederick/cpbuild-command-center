"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Key, Plus, Trash2, Copy, Check, X, Shield } from "lucide-react";
import { BI_SCOPES } from "@/lib/bi-scopes";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  allowedProjectIds: string[];
  party: "INTERNAL" | "SUBCONTRACTOR" | "GENERAL_CONTRACTOR";
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: "active" | "revoked" | "expired";
  createdBy: { id: string; name: string | null; email: string } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
}

interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

interface CreatedKey extends ApiKeyRow {
  rawKey: string;
}

const SCOPE_KEY_MAP: Record<string, string> = {
  "bi:projects": "scopeProjects",
  "bi:units": "scopeUnits",
  "bi:issues": "scopeIssues",
  "bi:observations": "scopeObservations",
  "bi:comments": "scopeComments",
  "bi:inspections": "scopeInspections",
  "bi:subscopes": "scopeSubscopes",
  "bi:media": "scopeMedia",
  "bi:feedback": "scopeFeedback",
  "bi:team": "scopeTeam",
  "bi:activity": "scopeActivity",
};

const STATUS_COLORS: Record<string, string> = {
  active: "var(--success-700)",
  revoked: "var(--error-700)",
  expired: "var(--neutral-500)",
};

// ─── Reveal Modal ──────────────────────────────────────────────────────────────

function RevealModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const t = useTranslations("apiKeys");
  // `justCopied` drives the transient "Copied ✓" button label (resets after 3s).
  // `hasCopied` stays true once the user copies — it gates the "Done" button so
  // the modal can't be dismissed before the key has been seen.
  const [justCopied, setJustCopied] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Escape key closes the modal (copy must happen first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && hasCopied) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasCopied, onClose]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setHasCopied(true);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 3000);
  };

  return (
    <div
      onClick={hasCopied ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "var(--space-4)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reveal-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--neutral-0)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          width: "100%",
          maxWidth: 560,
          boxShadow: "var(--shadow-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <Shield style={{ color: "var(--warning-600)", width: 24, height: 24 }} />
          <h2 id="reveal-modal-title" style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--neutral-900)" }}>
            {t("revealTitle")}
          </h2>
        </div>

        <p style={{ margin: "0 0 var(--space-4)", fontSize: "var(--text-body)", color: "var(--error-700)", fontWeight: "var(--font-weight-medium)" }}>
          {t("revealWarning")}
        </p>

        <div
          style={{
            backgroundColor: "var(--neutral-100)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3) var(--space-4)",
            fontFamily: "monospace",
            fontSize: "var(--text-body-sm)",
            wordBreak: "break-all",
            color: "var(--neutral-900)",
            marginBottom: "var(--space-4)",
          }}
        >
          {rawKey}
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-4)",
              backgroundColor: justCopied ? "var(--success-600)" : "var(--primary-600)",
              color: "var(--neutral-0)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
            }}
          >
            {justCopied ? <Check size={16} /> : <Copy size={16} />}
            {justCopied ? t("copied") : t("copyButton")}
          </button>
          <button
            onClick={onClose}
            disabled={!hasCopied}
            style={{
              flex: 1,
              padding: "var(--space-2) var(--space-4)",
              backgroundColor: hasCopied ? "var(--neutral-900)" : "var(--neutral-200)",
              color: hasCopied ? "var(--neutral-0)" : "var(--neutral-400)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-medium)",
              cursor: hasCopied ? "pointer" : "not-allowed",
            }}
          >
            {t("doneButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ──────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated, users }: { onClose: () => void; onCreated: (key: CreatedKey) => void; users: UserOption[] }) {
  const t = useTranslations("apiKeys");

  // Escape key closes the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [name, setName] = useState("");
  const [party, setParty] = useState<"INTERNAL" | "SUBCONTRACTOR" | "GENERAL_CONTRACTOR">("INTERNAL");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([...BI_SCOPES]);
  const [expiresAt, setExpiresAt] = useState("");
  const [projectIds, setProjectIds] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) { setError("Name is required."); return; }
    if (selectedScopes.length === 0) { setError("At least one scope is required."); return; }

    setSubmitting(true);
    try {
      const allowedProjectIds = projectIds
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          party,
          scopes: selectedScopes,
          allowedProjectIds,
          // datetime-local yields "YYYY-MM-DDTHH:mm" (no tz) — convert to UTC ISO string
          // so the server's z.string().datetime() validates correctly.
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          assignedToId: assignedToId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? t("createErrorGeneric"));
        return;
      }

      const created = await res.json() as CreatedKey;
      onCreated(created);
    } catch {
      setError(t("createErrorUnexpected"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "var(--space-4)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--neutral-0)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          width: "100%",
          maxWidth: 560,
          boxShadow: "var(--shadow-2)",
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)" }}>
          <h2 id="create-modal-title" style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--neutral-900)" }}>
            {t("createTitle")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("cancelButton")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--neutral-500)" }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <p style={{ color: "var(--error-700)", fontSize: "var(--text-body-sm)", marginBottom: "var(--space-3)" }}>{error}</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Name */}
          <div>
            <label style={{ display: "block", fontSize: "var(--text-body-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--neutral-700)", marginBottom: "var(--space-1)" }}>
              {t("nameLabel")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-body)",
                color: "var(--neutral-900)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Party */}
          <div>
            <label style={{ display: "block", fontSize: "var(--text-body-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--neutral-700)", marginBottom: "var(--space-1)" }}>
              {t("partyLabel")}
            </label>
            <select
              value={party}
              onChange={(e) => setParty(e.target.value as typeof party)}
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-body)",
                color: "var(--neutral-900)",
                backgroundColor: "var(--neutral-0)",
              }}
            >
              <option value="INTERNAL">{t("partyInternal")}</option>
              <option value="SUBCONTRACTOR">{t("partySubcontractor")}</option>
              <option value="GENERAL_CONTRACTOR">{t("partyGC")}</option>
            </select>
          </div>

          {/* Scopes */}
          <div>
            <label style={{ display: "block", fontSize: "var(--text-body-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--neutral-700)", marginBottom: "var(--space-1)" }}>
              {t("scopesLabel")}
            </label>
            <p style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", margin: "0 0 var(--space-2)" }}>
              {t("scopesHint")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {BI_SCOPES.map((scope) => (
                <label
                  key={scope}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    padding: "var(--space-1) var(--space-2)",
                    border: `1px solid ${selectedScopes.includes(scope) ? "var(--primary-400)" : "var(--neutral-300)"}`,
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: selectedScopes.includes(scope) ? "var(--primary-50)" : "var(--neutral-0)",
                    cursor: "pointer",
                    fontSize: "var(--text-body-sm)",
                    color: selectedScopes.includes(scope) ? "var(--primary-700)" : "var(--neutral-600)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    style={{ margin: 0 }}
                  />
                  {t(SCOPE_KEY_MAP[scope] as Parameters<typeof t>[0]) ?? scope}
                </label>
              ))}
            </div>
          </div>

          {/* Assign to user */}
          {users.length > 0 && (
            <div>
              <label style={{ display: "block", fontSize: "var(--text-body-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--neutral-700)", marginBottom: "var(--space-1)" }}>
                {t("assignToLabel")}
              </label>
              <p style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", margin: "0 0 var(--space-2)" }}>
                {t("assignToHint")}
              </p>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-body)",
                  color: "var(--neutral-900)",
                  backgroundColor: "var(--neutral-0)",
                }}
              >
                <option value="">{t("noAssignedUser")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Expiry */}
          <div>
            <label style={{ display: "block", fontSize: "var(--text-body-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--neutral-700)", marginBottom: "var(--space-1)" }}>
              {t("expiryLabel")}
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-body)",
                color: "var(--neutral-900)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Project scope */}
          <div>
            <label style={{ display: "block", fontSize: "var(--text-body-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--neutral-700)", marginBottom: "var(--space-1)" }}>
              {t("projectScopeLabel")}
            </label>
            <p style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", margin: "0 0 var(--space-2)" }}>
              {t("projectScopeHint")}
            </p>
            <textarea
              value={projectIds}
              onChange={(e) => setProjectIds(e.target.value)}
              placeholder={t("projectScopePlaceholder")}
              rows={3}
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-body)",
                color: "var(--neutral-900)",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "var(--space-2) var(--space-4)",
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-700)",
              fontSize: "var(--text-body)",
              cursor: "pointer",
            }}
          >
            {t("cancelButton")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              flex: 1,
              padding: "var(--space-2) var(--space-4)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--primary-600)",
              color: "var(--neutral-0)",
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-medium)",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? t("creating") : t("submitButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ApiKeysManager() {
  const t = useTranslations("apiKeys");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys");
      if (res.ok) {
        const data = await res.json() as ApiKeyRow[];
        setKeys(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/team");
      if (res.ok) {
        const json = await res.json() as { data: UserOption[] } | UserOption[];
        const data = Array.isArray(json) ? json : (json as { data: UserOption[] }).data ?? [];
        setUsers(data);
      }
    } catch {
      // Non-critical — assign-to dropdown just won't be populated
    }
  }, []);

  useEffect(() => { void fetchKeys(); void fetchUsers(); }, [fetchKeys, fetchUsers]);

  const handleCreated = (created: CreatedKey) => {
    setShowCreate(false);
    setRevealKey(created.rawKey);
    void fetchKeys();
  };

  const handleRevoke = async (id: string) => {
    if (!confirm(t("revokeConfirm"))) return;
    setRevoking(id);
    try {
      await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
      void fetchKeys();
    } finally {
      setRevoking(null);
    }
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : null;

  const partyLabel = (p: string) => {
    if (p === "INTERNAL") return t("partyInternal");
    if (p === "SUBCONTRACTOR") return t("partySubcontractor");
    return t("partyGC");
  };

  return (
    <>
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} users={users} />
      )}
      {revealKey && (
        <RevealModal rawKey={revealKey} onClose={() => setRevealKey(null)} />
      )}

      <div style={{ padding: "var(--space-6)", maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "var(--space-6)", gap: "var(--space-4)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
              <Key style={{ color: "var(--primary-600)", width: 24, height: 24 }} />
              <h1 style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--neutral-900)" }}>
                {t("pageTitle")}
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-body)", color: "var(--neutral-600)", maxWidth: 600 }}>
              {t("pageDescription")}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-4)",
              backgroundColor: "var(--primary-600)",
              color: "var(--neutral-0)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus size={16} />
            {t("createButton")}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ color: "var(--neutral-500)", fontSize: "var(--text-body)" }}>{t("loading")}</p>
        ) : keys.length === 0 ? (
          <p style={{ color: "var(--neutral-500)", fontSize: "var(--text-body)" }}>{t("noKeys")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-body-sm)" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--neutral-200)" }}>
                  {[
                    t("columnName"),
                    t("columnParty"),
                    t("columnScopes"),
                    t("columnStatus"),
                    t("columnLastUsed"),
                    t("columnCreatedBy"),
                    t("columnAssignedTo"),
                    t("columnActions"),
                  ].map((col) => (
                    <th
                      key={col}
                      style={{
                        textAlign: "left",
                        padding: "var(--space-2) var(--space-3)",
                        color: "var(--neutral-600)",
                        fontWeight: "var(--font-weight-semibold)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
                    <td style={{ padding: "var(--space-3)", color: "var(--neutral-900)", fontWeight: "var(--font-weight-medium)" }}>
                      <div>{key.name}</div>
                      <div style={{ fontFamily: "monospace", fontSize: "0.75em", color: "var(--neutral-400)" }}>{key.keyPrefix}…</div>
                    </td>
                    <td style={{ padding: "var(--space-3)", color: "var(--neutral-700)" }}>
                      {partyLabel(key.party)}
                    </td>
                    <td style={{ padding: "var(--space-3)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
                        {key.scopes.map((s) => (
                          <span
                            key={s}
                            style={{
                              padding: "2px 6px",
                              backgroundColor: "var(--primary-50)",
                              color: "var(--primary-700)",
                              borderRadius: "var(--radius-xs)",
                              fontSize: "0.75em",
                              fontWeight: "var(--font-weight-medium)",
                            }}
                          >
                            {t(SCOPE_KEY_MAP[s] as Parameters<typeof t>[0]) ?? s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "var(--space-3)" }}>
                      <span style={{ color: STATUS_COLORS[key.status] ?? "var(--neutral-700)", fontWeight: "var(--font-weight-medium)" }}>
                        {key.status === "active" ? t("statusActive") : key.status === "revoked" ? t("statusRevoked") : t("statusExpired")}
                      </span>
                    </td>
                    <td style={{ padding: "var(--space-3)", color: "var(--neutral-500)" }}>
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : t("never")}
                    </td>
                    <td style={{ padding: "var(--space-3)", color: "var(--neutral-600)" }}>
                      {key.createdBy?.name ?? key.createdBy?.email ?? "—"}
                    </td>
                    <td style={{ padding: "var(--space-3)", color: "var(--neutral-600)" }}>
                      {key.assignedTo ? (key.assignedTo.name ?? key.assignedTo.email) : "—"}
                    </td>
                    <td style={{ padding: "var(--space-3)" }}>
                      {key.status === "active" && (
                        <button
                          onClick={() => void handleRevoke(key.id)}
                          disabled={revoking === key.id}
                          aria-label={`${t("revokeButton")} ${key.name}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-1)",
                            padding: "var(--space-1) var(--space-2)",
                            border: "1px solid var(--error-300)",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "var(--neutral-0)",
                            color: "var(--error-600)",
                            fontSize: "var(--text-body-sm)",
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={14} />
                          {revoking === key.id ? t("revoking") : t("revokeButton")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
