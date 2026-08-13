"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, Pencil, CheckCircle2, Loader2, AlertTriangle, Split } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { unitTypeColor } from "@/components/projects/UnitCards";
import type { ScopeTypeOption } from "@/components/projects/UnitCards";
import type { SubScopeGroup, SubScopeDefinition } from "@/lib/sub-scopes";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubScopeManagementPanelProps {
  projectId: string;
  onClose: () => void;
  onChanged: () => void;
  /** All scope types keyed by unit type — used to show unconfigured scopes below each group. */
  scopeTypesByUnitType?: Record<string, ScopeTypeOption[]>;
}

// ── Confirm inline ────────────────────────────────────────────────────────────

function ConfirmInline({
  message,
  onConfirm,
  onCancel,
  confirming,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const t = useTranslations("units");
  return (
    <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 10 }} role="alert">
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <AlertTriangle size={14} style={{ color: "var(--error-600)", flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: "var(--error-800)", lineHeight: 1.4 }}>{message}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onCancel} disabled={confirming}
          style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid var(--error-300)",
            backgroundColor: "var(--neutral-0)", color: "var(--error-700)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
          {t("subScopesMgmtDeleteCancelBtn")}
        </button>
        <button type="button" onClick={onConfirm} disabled={confirming}
          style={{ flex: 1, height: 34, borderRadius: 8, border: "none",
            backgroundColor: confirming ? "var(--neutral-200)" : "var(--error-600)",
            color: confirming ? "var(--neutral-400)" : "var(--neutral-0)",
            fontSize: 13, fontWeight: 600, cursor: confirming ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {confirming ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {confirming ? t("subScopesMgmtDeleting") : t("subScopesMgmtDeleteConfirmBtn")}
        </button>
      </div>
    </div>
  );
}

// ── Sub-scope row ─────────────────────────────────────────────────────────────
// One row = one sub-scope.
// Read view shows: Name | Qty value | Edit button | Delete button
// Edit view shows: Name field + Qty field (when manual) clearly labeled — both in one place.

// Row height is fixed at 44px so the layout never jumps when toggling edit mode.
// In edit mode the name/qty text nodes become inputs in the same position;
// the pencil swaps for a save checkmark and the trash swaps for an X — exact
// same 30×30 slots, so nothing shifts.

function fmtQty(n: number): string {
  const s = n.toFixed(2);
  return s.endsWith(".00") ? String(Math.round(n)) : s.replace(/0+$/, "");
}

const ROW_INPUT_STYLE: React.CSSProperties = {
  height: 32, padding: "0 8px",
  border: "2px solid var(--primary-500)", borderRadius: 7,
  fontSize: 13, color: "var(--neutral-900)",
  backgroundColor: "var(--neutral-0)", outline: "none",
  boxSizing: "border-box", width: "100%",
  boxShadow: "0 0 0 3px var(--primary-100)",
  transition: "border-color 0.15s",
};

const ICON_BTN: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, border: "none", flexShrink: 0,
  backgroundColor: "transparent", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  transition: "color 0.15s, background-color 0.15s",
};

function SubScopeRow({
  def,
  projectId,
  isManual,
  evenSplitQty,
  batchQtyValue,
  onBatchQtyChange,
  batchMode,
  onStartBatchQtyEdit,
  onSaved,
  onDeleted,
}: {
  def: SubScopeDefinition;
  projectId: string;
  isManual: boolean;
  evenSplitQty?: number;
  /** When set, renders the qty cell as an editable input (batch mode). */
  batchQtyValue?: string;
  onBatchQtyChange?: (value: string) => void;
  /** True when batch qty editing is active — disables name pencil and trash. */
  batchMode?: boolean;
  /** Tap on the qty pencil calls this to start batch editing at the GroupCard level. */
  onStartBatchQtyEdit?: () => void;
  onSaved: (id: string, name: string) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("units");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(def.name);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setEditName(def.name);
  }, [def.name, editing]);

  function startEdit() {
    if (batchMode) return;
    setEditName(def.name);
    setEditing(true);
    queueMicrotask(() => nameRef.current?.focus());
  }

  function cancelEdit() {
    setEditing(false);
    setEditName(def.name);
  }

  async function handleSave() {
    const trimmedName = editName.trim();
    if (!trimmedName || trimmedName === def.name) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-scopes/${def.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!res.ok) { toast.error(t("subScopesErrorGeneric")); return; }
      onSaved(def.id, trimmedName);
      setEditing(false);
    } catch { toast.error(t("subScopesErrorGeneric")); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-scopes/${def.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) toast.error(t("subScopesErrorGeneric"));
      else onDeleted(def.id);
    } catch { toast.error(t("subScopesErrorGeneric")); }
    finally { setDeleting(false); setShowDeleteConfirm(false); }
  }

  const namePencilDisabled = batchMode || editing;
  const trashDisabled = batchMode || editing;
  const inBatchInput = batchQtyValue !== undefined;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", padding: "6px 12px 6px 16px",
        gap: 6, minHeight: 44,
        backgroundColor: editing ? "var(--primary-50)" : "transparent",
        transition: "background-color 0.15s",
      }}>

        {/* ── Name area: text + inline pencil ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 4 }}>
          {editing ? (
            <>
              <input
                ref={nameRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") cancelEdit(); }}
                style={{ ...ROW_INPUT_STYLE, flex: 1, minWidth: 0 }}
                aria-label="Sub-scope name"
              />
              <button type="button"
                onClick={() => void handleSave()}
                disabled={saving || !editName.trim()}
                aria-label="Save name"
                style={{ ...ICON_BTN, color: saving || !editName.trim() ? "var(--neutral-300)" : "var(--primary-600)" }}>
                {saving
                  ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                  : <CheckCircle2 size={13} />}
              </button>
              <button type="button" onClick={cancelEdit} disabled={saving} aria-label="Cancel"
                style={{ ...ICON_BTN, color: "var(--neutral-400)" }}>
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--neutral-800)",
                flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {def.name}
              </span>
              <button type="button" onClick={startEdit} disabled={namePencilDisabled}
                aria-label={`Rename ${def.name}`}
                style={{ ...ICON_BTN, color: namePencilDisabled ? "var(--neutral-200)" : "var(--neutral-400)",
                  cursor: namePencilDisabled ? "default" : "pointer" }}
                onMouseEnter={(e) => { if (!namePencilDisabled) { e.currentTarget.style.color = "var(--primary-600)"; e.currentTarget.style.backgroundColor = "var(--primary-50)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.color = namePencilDisabled ? "var(--neutral-200)" : "var(--neutral-400)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>

        {/* ── Qty area: value + pencil (or input in batch mode) ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {inBatchInput ? (
            <input
              type="number"
              min={0}
              step="any"
              value={batchQtyValue}
              onChange={(e) => onBatchQtyChange?.(e.target.value)}
              style={{ ...ROW_INPUT_STYLE, width: 64, textAlign: "center", MozAppearance: "textfield" } as React.CSSProperties}
              aria-label={`Qty for ${def.name}`}
            />
          ) : (
            <>
              <span style={{ width: 48, fontSize: 13, fontWeight: 600, textAlign: "center", display: "block",
                color: isManual ? "var(--neutral-700)" : "var(--neutral-400)" }}>
                {isManual
                  ? (def.qty != null ? fmtQty(def.qty) : "—")
                  : (evenSplitQty != null ? `~${fmtQty(evenSplitQty)}` : "auto")}
              </span>
              <button type="button"
                onClick={onStartBatchQtyEdit}
                aria-label="Edit quantities"
                style={{ ...ICON_BTN, color: "var(--neutral-400)", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary-600)"; e.currentTarget.style.backgroundColor = "var(--primary-50)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--neutral-400)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>

        {/* ── Trash ── */}
        <button type="button"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={trashDisabled}
          aria-label={`Delete ${def.name}`}
          style={{ ...ICON_BTN, color: trashDisabled ? "var(--neutral-200)" : "var(--neutral-400)",
            cursor: trashDisabled ? "default" : "pointer" }}
          onMouseEnter={(e) => { if (!trashDisabled) { e.currentTarget.style.color = "var(--error-600)"; e.currentTarget.style.backgroundColor = "var(--error-50)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.color = trashDisabled ? "var(--neutral-200)" : "var(--neutral-400)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
          <Trash2 size={13} />
        </button>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && !editing && (
        <div style={{ padding: "0 16px 6px" }}>
          <ConfirmInline
            message={t("subScopesMgmtDeleteSubScopeConfirm", { name: def.name })}
            onConfirm={() => void handleDelete()}
            onCancel={() => setShowDeleteConfirm(false)}
            confirming={deleting}
          />
        </div>
      )}
    </div>
  );
}

// ── Add sub-scope inline form ─────────────────────────────────────────────────

function AddSubScopeForm({
  projectId, group, onAdded,
}: {
  projectId: string;
  group: SubScopeGroup;
  onAdded: (def: SubScopeDefinition) => void;
}) {
  const t = useTranslations("units");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const isManual = group.distributionMode === "manual";

  // Budget remaining = scope total minus what's already assigned
  const currentAssigned = group.subScopes.reduce((s, d) => s + (d.qty ?? 0), 0);
  const remaining = group.unitScopeQty != null ? group.unitScopeQty - currentAssigned : null;

  // When remaining ≤ 0 we add with no qty and auto-open batch edit after
  const budgetFull = isManual && remaining != null && remaining <= 0.0001;

  async function handleAdd() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const parsedQty = qty !== "" ? parseFloat(qty) : null;
    const newQty = parsedQty != null && parsedQty > 0 ? parsedQty : null;

    // Only validate qty > remaining when budget is NOT already full and user entered a value
    if (!budgetFull && isManual && newQty != null && remaining != null && newQty > remaining + 0.0001) {
      setQtyError(`Max ${fmtQty(remaining)} remaining of ${fmtQty(group.unitScopeQty!)}/unit`);
      return;
    }
    setQtyError(null);

    setAdding(true);
    try {
      const body: Record<string, unknown> = {
        addToGroup: true,
        unitType: group.unitType,
        scopeTypeId: group.scopeTypeId,
        name: trimmedName,
      };
      if (isManual && newQty != null) body.qty = newQty;

      const res = await fetch(`/api/projects/${projectId}/sub-scopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        toast.error(typeof d.error === "string" ? d.error : t("subScopesErrorGeneric"));
        return;
      }

      const d = await res.json() as { subScope?: SubScopeDefinition };
      if (d.subScope) {
        onAdded({ ...d.subScope, scopeTypeName: group.scopeTypeName });
        setName(""); setQty(""); setQtyError(null); setOpen(false);
      }
    } catch { toast.error(t("subScopesErrorGeneric")); }
    finally { setAdding(false); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
          border: "none", width: "100%", backgroundColor: "transparent",
          color: "var(--primary-600)", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--primary-50)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
        <Plus size={13} style={{ flexShrink: 0 }} />
        Add sub-scope to {group.scopeTypeName}
      </button>
    );
  }

  return (
    <div style={{ padding: "12px 16px", borderTop: "1px solid var(--neutral-100)" }}>
      {/* Budget context */}
      {group.unitScopeQty != null && isManual && (
        budgetFull ? (
          /* Budget exhausted — inform user that redistribution will follow automatically */
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10,
            padding: "8px 10px", borderRadius: 8, backgroundColor: "var(--warning-50)" }}>
            <AlertTriangle size={13} style={{ color: "var(--warning-500)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "var(--warning-800)", lineHeight: 1.4 }}>
              All <strong>{fmtQty(group.unitScopeQty)}/unit</strong> is assigned — you&rsquo;ll
              redistribute quantities across all sub-scopes after adding.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10, padding: "6px 10px", borderRadius: 8, backgroundColor: "var(--neutral-50)" }}>
            <span style={{ fontSize: 11, color: "var(--neutral-600)", fontWeight: 500 }}>
              Scope total: <strong>{fmtQty(group.unitScopeQty)}/unit</strong>
            </span>
            <span style={{ fontSize: 11, fontWeight: 700,
              color: remaining != null && remaining < group.unitScopeQty
                ? "var(--warning-600)" : "var(--neutral-600)" }}>
              {remaining != null ? `${fmtQty(remaining)} remaining` : ""}
            </span>
          </div>
        )
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "var(--neutral-500)",
            textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Sub-scope name
          </label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") setOpen(false); }}
            placeholder={t("subScopesMgmtAddSubScopePlaceholder")}
            autoFocus
            style={{ height: 36, padding: "0 10px", border: "1.5px solid var(--neutral-300)", borderRadius: 8,
              fontSize: 14, color: "var(--neutral-900)", backgroundColor: "var(--neutral-0)", outline: "none",
              boxSizing: "border-box", width: "100%" }} />
        </div>
        {/* Hide qty input when budget is already full — redistribution happens via batch edit */}
        {isManual && !budgetFull && (
          <div style={{ width: 90, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "var(--neutral-500)",
              textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Qty / unit
            </label>
            <input type="number" min={0} step="any" value={qty}
              onChange={(e) => { setQty(e.target.value); setQtyError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") setOpen(false); }}
              placeholder="0"
              style={{ height: 36, padding: "0 10px", borderRadius: 8,
                border: qtyError ? "1.5px solid var(--error-400)" : "1.5px solid var(--neutral-300)",
                fontSize: 14, color: "var(--neutral-900)", backgroundColor: "var(--neutral-0)", outline: "none",
                boxSizing: "border-box", width: "100%" }} />
          </div>
        )}
      </div>

      {/* Qty validation error */}
      {qtyError && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
          <AlertTriangle size={12} style={{ color: "var(--error-500)", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--error-700)", fontWeight: 500 }}>{qtyError}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={() => void handleAdd()} disabled={adding || !name.trim()}
          style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none",
            backgroundColor: adding || !name.trim() ? "var(--neutral-200)" : "var(--primary-500)",
            color: adding || !name.trim() ? "var(--neutral-400)" : "var(--neutral-0)",
            fontSize: 13, fontWeight: 600, cursor: adding || !name.trim() ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 5 }}>
          {adding ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {adding ? t("subScopesMgmtAdding") : budgetFull ? "Add & redistribute" : t("subScopesMgmtAddBtn")}
        </button>
        <button type="button" onClick={() => { setOpen(false); setQtyError(null); }}
          style={{ height: 34, padding: "0 12px", borderRadius: 8,
            border: "1px solid var(--neutral-300)", backgroundColor: "transparent",
            color: "var(--neutral-600)", fontSize: 13, cursor: "pointer" }}>
          {t("subScopesMgmtRenameCancel")}
        </button>
      </div>
    </div>
  );
}

// ── Start group form (create new group for an unconfigured scope type) ─────────

function StartGroupForm({
  projectId,
  unitType,
  scopeType,
  onCreated,
}: {
  projectId: string;
  unitType: string;
  scopeType: ScopeTypeOption;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Array<{ id: string; name: string }>>([
    { id: Math.random().toString(36).slice(2), name: "" },
    { id: Math.random().toString(36).slice(2), name: "" },
  ]);
  const [mode, setMode] = useState<"even" | "manual">("even");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function addEntry() {
    setEntries((prev) => [...prev, { id: Math.random().toString(36).slice(2), name: "" }]);
  }

  function removeEntry(id: string) {
    if (entries.length <= 2) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setQtys((prev) => { const { [id]: _, ...rest } = prev; return rest; });
    setNameErrors((prev) => { const { [id]: _, ...rest } = prev; return rest; });
  }

  function setEntryName(id: string, name: string) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, name } : e));
    setNameErrors((prev) => { const { [id]: _, ...rest } = prev; return rest; });
  }

  // Qty totals for manual mode validation
  const scopeQty = scopeType.qtyPerUnit;
  const assignedTotal = entries.reduce((s, e) => s + (parseFloat(qtys[e.id] ?? "") || 0), 0);
  const showQtyValidation = mode === "manual" && !scopeType.qtyVaries && scopeQty != null;
  const qtyDiff = showQtyValidation ? assignedTotal - scopeQty! : 0;
  const qtyIsOver = showQtyValidation && qtyDiff > 0.001;
  const qtyIsUnder = showQtyValidation && qtyDiff < -0.001;
  const qtyIsMatch = showQtyValidation && !qtyIsOver && !qtyIsUnder;

  async function handleSubmit() {
    // Validate names
    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    for (const e of entries) {
      const trimmed = e.name.trim();
      if (!trimmed) { errors[e.id] = "Name is required"; continue; }
      if (seen.has(trimmed.toLowerCase())) { errors[e.id] = "Name must be unique"; continue; }
      seen.add(trimmed.toLowerCase());
    }
    if (Object.keys(errors).length > 0) { setNameErrors(errors); return; }
    if (mode === "manual" && showQtyValidation && !qtyIsMatch) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-scopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitType,
          scopeTypeId: scopeType.id,
          distributionMode: mode,
          subScopes: entries.map((e, i) => ({
            name: e.name.trim(),
            displayOrder: i,
            ...(mode === "manual" && qtys[e.id] ? { qty: parseFloat(qtys[e.id]) } : {}),
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        toast.error(typeof d.error === "string" ? d.error : "Something went wrong");
        return;
      }
      toast.success(`${scopeType.name} split into ${entries.length} sub-scopes`);
      onCreated();
    } catch { toast.error("Something went wrong"); }
    finally { setSubmitting(false); }
  }

  if (!open) {
    return (
      <div style={{ marginTop: 8, borderRadius: 10, border: "1.5px dashed var(--neutral-250)",
        backgroundColor: "var(--neutral-50)", overflow: "hidden" }}>
        <button type="button" onClick={() => setOpen(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "12px 16px", border: "none",
            backgroundColor: "transparent", cursor: "pointer", textAlign: "left" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--primary-50)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--neutral-700)" }}>
            {scopeType.name}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5,
            fontSize: 12, fontWeight: 600, color: "var(--primary-600)" }}>
            <Split size={13} />
            Split into sub-scopes
          </span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, borderRadius: 10, border: "1.5px solid var(--primary-300)",
      backgroundColor: "var(--neutral-0)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid var(--neutral-100)",
        backgroundColor: "var(--primary-50)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Split size={14} style={{ color: "var(--primary-500)", flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary-800)" }}>
            Split {scopeType.name} into sub-scopes
          </span>
        </div>
        <button type="button" onClick={() => setOpen(false)}
          aria-label="Cancel"
          style={{ width: 26, height: 26, borderRadius: 6, border: "none",
            backgroundColor: "transparent", color: "var(--neutral-500)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Name inputs */}
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "var(--neutral-500)",
          textTransform: "uppercase", letterSpacing: "0.06em" }}>Sub-scope names</p>
        {entries.map((entry, idx) => (
          <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            {/* Index badge */}
            <div style={{ width: 24, height: 36, borderRadius: 99, backgroundColor: "var(--neutral-100)",
              color: "var(--neutral-500)", fontSize: 11, fontWeight: 600, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              {idx + 1}
            </div>
            {/* Name input */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <input type="text" value={entry.name}
                onChange={(e) => setEntryName(entry.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
                placeholder={`Sub-scope ${idx + 1} name`}
                autoFocus={idx === 0 && open}
                style={{ height: 36, width: "100%", padding: "0 10px",
                  border: nameErrors[entry.id] ? "1.5px solid var(--error-400)" : "1.5px solid var(--neutral-300)",
                  borderRadius: 8, fontSize: 14, color: "var(--neutral-900)",
                  backgroundColor: "var(--neutral-0)", outline: "none", boxSizing: "border-box" }} />
              {nameErrors[entry.id] && (
                <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--error-600)" }}>
                  {nameErrors[entry.id]}
                </p>
              )}
            </div>
            {/* Qty input — manual mode only */}
            {mode === "manual" && (
              <input type="number" min={0} step="any" value={qtys[entry.id] ?? ""}
                onChange={(e) => setQtys((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                placeholder="Qty"
                style={{ width: 72, height: 36, padding: "0 8px", borderRadius: 8, flexShrink: 0,
                  border: "1.5px solid var(--neutral-300)", fontSize: 14, color: "var(--neutral-900)",
                  backgroundColor: "var(--neutral-0)", outline: "none", boxSizing: "border-box" }} />
            )}
            {/* Remove */}
            <button type="button" onClick={() => removeEntry(entry.id)}
              disabled={entries.length <= 2}
              aria-label="Remove"
              style={{ width: 36, height: 36, flexShrink: 0, border: "none", borderRadius: 8,
                backgroundColor: "transparent",
                color: entries.length <= 2 ? "var(--neutral-250)" : "var(--neutral-400)",
                cursor: entries.length <= 2 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => { if (entries.length > 2) e.currentTarget.style.color = "var(--error-500)"; }}
              onMouseLeave={(e) => { if (entries.length > 2) e.currentTarget.style.color = "var(--neutral-400)"; }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button type="button" onClick={addEntry}
          style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5,
            padding: "6px 12px", border: "1.5px dashed var(--neutral-300)", borderRadius: 8,
            backgroundColor: "transparent", color: "var(--primary-600)", fontSize: 12,
            fontWeight: 500, cursor: "pointer" }}>
          <Plus size={12} />
          Add another
        </button>

        {/* Distribution mode */}
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--neutral-500)",
            textTransform: "uppercase", letterSpacing: "0.06em" }}>Quantity split</p>
          {scopeQty != null && !scopeType.qtyVaries && (
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--neutral-500)" }}>
              Scope qty: <strong style={{ color: "var(--neutral-800)" }}>{fmtQty(scopeQty)}/unit</strong>
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {(["even", "manual"] as const).map((m) => {
              const active = mode === m;
              return (
                <button key={m} type="button" onClick={() => setMode(m)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                    border: active ? "2px solid var(--primary-500)" : "1.5px solid var(--neutral-250)",
                    backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
                    color: active ? "var(--primary-700)" : "var(--neutral-600)",
                    fontSize: 12, fontWeight: active ? 600 : 500, textAlign: "left" }}>
                  {m === "even" ? "Even split" : "Manual"}
                </button>
              );
            })}
          </div>
          {/* Manual qty total status */}
          {showQtyValidation && (
            <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
              backgroundColor: qtyIsMatch ? "var(--success-50)" : qtyIsOver ? "var(--error-50)" : "var(--warning-50)",
              color: qtyIsMatch ? "var(--success-700)" : qtyIsOver ? "var(--error-700)" : "var(--warning-700)",
              border: `1px solid ${qtyIsMatch ? "var(--success-200)" : qtyIsOver ? "var(--error-200)" : "var(--warning-200)"}` }}>
              {qtyIsOver
                ? `Over by ${fmtQty(qtyDiff)} — reduce quantities`
                : qtyIsUnder
                  ? `${fmtQty(-qtyDiff)} remaining of ${fmtQty(scopeQty!)}/unit`
                  : `✓ Assigned ${fmtQty(assignedTotal)} / ${fmtQty(scopeQty!)}`}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{ height: 36, padding: "0 18px", borderRadius: 8, border: "none",
              backgroundColor: submitting ? "var(--neutral-200)" : "var(--primary-500)",
              color: submitting ? "var(--neutral-400)" : "var(--neutral-0)",
              fontSize: 13, fontWeight: 600, cursor: submitting ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 6 }}>
            {submitting ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />}
            {submitting ? "Creating…" : "Create sub-scopes"}
          </button>
          <button type="button" onClick={() => setOpen(false)}
            style={{ height: 36, padding: "0 14px", borderRadius: 8,
              border: "1px solid var(--neutral-300)", backgroundColor: "transparent",
              color: "var(--neutral-600)", fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────────

function GroupCard({
  group: initialGroup,
  projectId,
  onChanged,
}: {
  group: SubScopeGroup;
  projectId: string;
  onChanged: () => void;
}) {
  const t = useTranslations("units");
  const [group, setGroup] = useState(initialGroup);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const { bg, text } = unitTypeColor(group.unitType);
  const isManual = group.distributionMode === "manual";

  function handleSaved(id: string, name: string) {
    setGroup((prev) => ({
      ...prev,
      subScopes: prev.subScopes.map((s) => s.id === id ? { ...s, name } : s),
    }));
    onChanged();
  }

  function handleDeleted(id: string) {
    setGroup((prev) => ({
      ...prev,
      subScopes: prev.subScopes.filter((s) => s.id !== id),
    }));
    onChanged();
  }

  // ── Batch qty editing ──────────────────────────────────────────────────────
  const [editingQtys, setEditingQtys] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [savingQtys, setSavingQtys] = useState(false);

  function handleAdded(def: SubScopeDefinition) {
    const updatedSubScopes = [...group.subScopes, def];
    setGroup((prev) => ({ ...prev, subScopes: updatedSubScopes }));
    onChanged();

    // If the new sub-scope has no qty and there's a scope total, auto-open batch qty edit
    // so the user can redistribute immediately without needing an extra tap.
    if (group.unitScopeQty != null && (def.qty == null || def.qty === 0)) {
      const draft: Record<string, string> = {};
      for (const ss of updatedSubScopes) {
        draft[ss.id] = ss.qty != null ? fmtQty(ss.qty) : "";
      }
      setQtyDraft(draft);
      setEditingQtys(true);
    }
  }

  function startQtyEdit() {
    const draft: Record<string, string> = {};
    for (const ss of group.subScopes) {
      draft[ss.id] = ss.qty != null ? fmtQty(ss.qty) : "";
    }
    setQtyDraft(draft);
    setEditingQtys(true);
  }

  function cancelQtyEdit() {
    setEditingQtys(false);
    setQtyDraft({});
  }

  // Parse the draft values for live total computation
  const draftParsed: Record<string, number | null> = {};
  let liveTotal = 0;
  for (const ss of group.subScopes) {
    const raw = qtyDraft[ss.id] ?? "";
    const v = raw !== "" ? parseFloat(raw) : null;
    draftParsed[ss.id] = v != null && v > 0 ? v : null;
    liveTotal += draftParsed[ss.id] ?? 0;
  }

  const scopeTotal = group.unitScopeQty;
  const atTarget = scopeTotal == null || Math.abs(liveTotal - scopeTotal) < 0.0001;
  const overTarget = scopeTotal != null && liveTotal > scopeTotal + 0.0001;
  const totalColor = overTarget ? "var(--error-600)"
    : atTarget && liveTotal > 0 ? "var(--success-600)"
    : "var(--warning-600)";

  async function handleBatchSaveQtys() {
    if (!atTarget && scopeTotal != null) return;
    setSavingQtys(true);
    try {
      for (const ss of group.subScopes) {
        const newQty = draftParsed[ss.id];
        if (newQty === ss.qty) continue;
        const res = await fetch(`/api/projects/${projectId}/sub-scopes/${ss.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qty: newQty }),
        });
        if (!res.ok) { toast.error(t("subScopesErrorGeneric")); return; }
      }
      setGroup((prev) => ({
        ...prev,
        distributionMode: group.subScopes.some((ss) => draftParsed[ss.id] != null) ? "manual" : "even",
        subScopes: prev.subScopes.map((ss) => ({ ...ss, qty: draftParsed[ss.id] ?? null })),
      }));
      setEditingQtys(false);
      setQtyDraft({});
      onChanged();
    } catch { toast.error(t("subScopesErrorGeneric")); }
    finally { setSavingQtys(false); }
  }

  async function handleDeleteGroup() {
    setDeletingGroup(true);
    try {
      for (const ss of group.subScopes) {
        const res = await fetch(`/api/projects/${projectId}/sub-scopes/${ss.id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) { toast.error(t("subScopesErrorGeneric")); return; }
      }
      setGroup((prev) => ({ ...prev, subScopes: [] }));
      onChanged();
      toast.success("Group deleted");
    } catch { toast.error(t("subScopesErrorGeneric")); }
    finally { setDeletingGroup(false); setDeleteGroupConfirm(false); }
  }

  if (group.subScopes.length === 0) return null;

  const evenSplitQty = !isManual && group.unitScopeQty != null
    ? group.unitScopeQty / group.subScopes.length
    : undefined;

  return (
    <div style={{ border: "1px solid var(--neutral-200)", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>

      {/* ── Header: unit type + scope name + scope total ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        backgroundColor: "var(--neutral-50)", borderBottom: "1px solid var(--neutral-150)" }}>
        <span style={{ padding: "3px 9px", borderRadius: 99, backgroundColor: bg, color: text,
          fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {group.unitType}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--neutral-900)", flex: 1, minWidth: 0 }}>
          {group.scopeTypeName}
        </span>
        {group.unitScopeQty != null && (
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--neutral-500)",
            flexShrink: 0, whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: 700, color: "var(--neutral-800)" }}>{fmtQty(group.unitScopeQty)}</span>
            {" "}qty/unit
          </span>
        )}
      </div>

      {/* ── Column headers — match row layout: name-flex1 | qty+pencil | trash ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "5px 12px 5px 16px",
        borderBottom: "1px solid var(--neutral-100)", backgroundColor: "var(--neutral-0)", gap: 6 }}>
        <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: "var(--neutral-400)",
          textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Sub-scope
        </span>
        {/* 48px value + 4px gap + 26px pencil = 78px, matching qty area */}
        <span style={{ width: 78, flexShrink: 0, fontSize: 10, fontWeight: 700, color: "var(--neutral-400)",
          textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>
          Qty / unit
        </span>
        {/* 26px spacer for trash column */}
        <div style={{ width: 26, flexShrink: 0 }} />
      </div>

      {/* ── Sub-scope rows ── */}
      <div>
        {group.subScopes.map((ss, idx) => (
          <div key={ss.id}
            style={{ borderBottom: idx < group.subScopes.length - 1 ? "1px solid var(--neutral-100)" : "none" }}>
            <SubScopeRow
              def={ss}
              projectId={projectId}
              isManual={isManual}
              evenSplitQty={evenSplitQty}
              batchMode={editingQtys}
              batchQtyValue={editingQtys ? (qtyDraft[ss.id] ?? "") : undefined}
              onBatchQtyChange={editingQtys
                ? (v) => setQtyDraft((prev) => ({ ...prev, [ss.id]: v }))
                : undefined}
              onStartBatchQtyEdit={startQtyEdit}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          </div>
        ))}
      </div>

      {/* ── Batch qty editing footer ── */}
      {editingQtys ? (
        <div style={{ borderTop: "1px solid var(--neutral-150)", padding: "12px 16px",
          backgroundColor: "var(--neutral-50)" }}>
          {/* Live total indicator */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-600)" }}>
              Total assigned
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: totalColor }}>
              {fmtQty(liveTotal)}
              {scopeTotal != null && (
                <span style={{ color: "var(--neutral-500)", fontWeight: 500 }}> / {fmtQty(scopeTotal)}</span>
              )}
            </span>
          </div>
          {/* Hint */}
          {!atTarget && scopeTotal != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
              <AlertTriangle size={12} style={{ color: overTarget ? "var(--error-500)" : "var(--warning-500)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: overTarget ? "var(--error-700)" : "var(--warning-700)" }}>
                {overTarget
                  ? `Over by ${fmtQty(liveTotal - scopeTotal)} — reduce a quantity`
                  : `${fmtQty(scopeTotal - liveTotal)} remaining — adjust quantities to match`}
              </span>
            </div>
          )}
          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={cancelQtyEdit}
              style={{ flex: 1, height: 36, borderRadius: 8,
                border: "1px solid var(--neutral-300)", backgroundColor: "transparent",
                color: "var(--neutral-700)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button"
              onClick={() => void handleBatchSaveQtys()}
              disabled={savingQtys || (!atTarget && scopeTotal != null)}
              style={{ flex: 2, height: 36, borderRadius: 8, border: "none",
                backgroundColor: savingQtys || (!atTarget && scopeTotal != null)
                  ? "var(--neutral-200)" : "var(--primary-500)",
                color: savingQtys || (!atTarget && scopeTotal != null)
                  ? "var(--neutral-400)" : "var(--neutral-0)",
                fontSize: 13, fontWeight: 600,
                cursor: savingQtys || (!atTarget && scopeTotal != null) ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {savingQtys
                ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                : "Save quantities"}
            </button>
          </div>
        </div>
      ) : (
        /* ── Normal footer ── */
        <div style={{ borderTop: "1px solid var(--neutral-100)", backgroundColor: "var(--neutral-0)" }}>
          <AddSubScopeForm projectId={projectId} group={group} onAdded={handleAdded} />

          {/* Edit quantities trigger */}
          <button type="button" onClick={startQtyEdit}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              border: "none", width: "100%", backgroundColor: "transparent",
              color: "var(--primary-600)", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--primary-50)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
            <Pencil size={13} style={{ flexShrink: 0 }} />
            Edit quantities
          </button>

          <div style={{ height: 1, margin: "0 16px", backgroundColor: "var(--neutral-100)" }} />

          {/* Delete group */}
          {deleteGroupConfirm ? (
            <div style={{ padding: "4px 16px 12px" }}>
              <ConfirmInline
                message={t("subScopesMgmtDeleteGroupConfirm", { scopeType: group.scopeTypeName, unitType: group.unitType })}
                onConfirm={() => void handleDeleteGroup()}
                onCancel={() => setDeleteGroupConfirm(false)}
                confirming={deletingGroup}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setDeleteGroupConfirm(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
                border: "none", width: "100%", backgroundColor: "transparent",
                color: "var(--error-600)", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--error-50)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
              <Trash2 size={13} style={{ flexShrink: 0 }} />
              {t("subScopesMgmtDeleteGroup")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function SubScopeManagementPanel({
  projectId,
  onClose,
  onChanged,
  scopeTypesByUnitType,
}: SubScopeManagementPanelProps) {
  const t = useTranslations("units");
  const [groups, setGroups] = useState<SubScopeGroup[] | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  const fetchGroups = useCallback(() => {
    fetch(`/api/projects/${projectId}/sub-scopes`)
      .then((r) => r.json())
      .then((d: { subScopes?: SubScopeGroup[] }) => setGroups(d.subScopes ?? []))
      .catch(() => setGroups([]));
  }, [projectId]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleChanged = useCallback(() => { onChanged(); fetchGroups(); }, [onChanged, fetchGroups]);

  const panel = (
    <>
      <div onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 1000 }}
        aria-hidden="true" />

      <div role="dialog" aria-modal="true" aria-labelledby="sub-scope-mgmt-title"
        style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-end",
          justifyContent: "center", zIndex: 1001, pointerEvents: "none" }}>
        <div style={{ width: "100%", maxWidth: 520, height: "92dvh", minHeight: 360, maxHeight: 840,
          backgroundColor: "var(--neutral-0)", borderRadius: "16px 16px 0 0",
          display: "flex", flexDirection: "column", overflow: "hidden",
          pointerEvents: "auto", boxShadow: "0 -4px 32px rgba(0,0,0,0.18)" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "20px 20px 16px", flexShrink: 0, borderBottom: "1px solid var(--neutral-150)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "var(--primary-50)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Split size={16} style={{ color: "var(--primary-600)" }} />
              </div>
              <h2 id="sub-scope-mgmt-title"
                style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)", lineHeight: 1.2 }}>
                {t("subScopesMgmtTitle")}
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label={t("subScopesMgmtClose")}
              style={{ width: 32, height: 32, borderRadius: 8, border: "none",
                backgroundColor: "transparent", color: "var(--neutral-500)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {groups === null ? (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
                <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--neutral-400)" }} />
              </div>
            ) : groups.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--neutral-500)", fontSize: 14, paddingTop: 40, margin: 0 }}>
                {t("subScopesMgmtEmpty")}
              </p>
            ) : (() => {
              // Group by unit type (preserving order)
              const byUnitType = new Map<string, SubScopeGroup[]>();
              for (const g of groups) {
                if (!byUnitType.has(g.unitType)) byUnitType.set(g.unitType, []);
                byUnitType.get(g.unitType)!.push(g);
              }
              return Array.from(byUnitType.entries()).map(([unitType, utGroups]) => {
                // Scope types for this unit type that don't yet have a configured group
                const configuredIds = new Set(utGroups.map((g) => g.scopeTypeId));
                const unconfigured = (scopeTypesByUnitType?.[unitType] ?? [])
                  .filter((st) => !configuredIds.has(st.id));
                return (
                  <div key={unitType}>
                    {utGroups.map((group) => (
                      <GroupCard key={`${group.unitType}::${group.scopeTypeId}`}
                        group={group} projectId={projectId} onChanged={handleChanged} />
                    ))}
                    {unconfigured.map((scopeType) => (
                      <StartGroupForm
                        key={scopeType.id}
                        projectId={projectId}
                        unitType={unitType}
                        scopeType={scopeType}
                        onCreated={handleChanged}
                      />
                    ))}
                  </div>
                );
              });
            })()}
          </div>

        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );

  if (!mounted) return null;
  return createPortal(panel, document.body);
}
