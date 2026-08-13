"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Save, Shield, Trash2 } from "lucide-react";
import {
  PERMISSION_METADATA,
  ROLE_GRANTABLE_PERMISSIONS,
  filterRoleGrantablePermissions,
  isRoleGrantablePermission,
  permissionLabel,
  type PermissionCategory,
  type PermissionMeta,
} from "@/lib/permission-metadata";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLE_CODE_REGEX } from "@/lib/role-code";

interface AdminRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
  isBuiltin: boolean;
  userCount: number;
}

const DANGEROUS_PERMISSIONS = new Set<string>([
  PERMISSIONS.MANAGE_ROLES,
]);

const CATEGORY_ORDER: PermissionCategory[] = [
  "team",
  "projects",
  "fieldTracker",
  "forms",
  "locationTracking",
  "admin",
  "bi",
];

const DETAILS_AUTOSAVE_MS = 600;

type DetailsSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function roleDetailsMatch(
  role: AdminRole,
  nameDraft: string,
  descriptionDraft: string,
): boolean {
  const normalizeDescription = (value: string | null | undefined): string | null => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return (
    nameDraft.trim() === role.name.trim() &&
    normalizeDescription(descriptionDraft) === normalizeDescription(role.description)
  );
}

function suggestRoleCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function editablePermissions(permissions: string[]): string[] {
  return filterRoleGrantablePermissions(permissions);
}

function groupByCategory(items: PermissionMeta[]): Map<PermissionCategory, PermissionMeta[]> {
  const map = new Map<PermissionCategory, PermissionMeta[]>();
  for (const cat of CATEGORY_ORDER) map.set(cat, []);
  for (const item of items) {
    map.get(item.category)?.push(item);
  }
  return map;
}

export function RoleManager() {
  const t = useTranslations("roleManager");
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [detailsSaveStatus, setDetailsSaveStatus] = useState<DetailsSaveStatus>("idle");
  const [showCreate, setShowCreate] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailsSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const savedStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userEditedDetailsRef = useRef(false);
  const [createName, setCreateName] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDanger, setPendingDanger] = useState<{
    code: string;
    next: string[];
  } | null>(null);

  const selected = roles.find((r) => r.id === selectedId) ?? null;
  const protectedPermissions = useMemo(
    () =>
      selected
        ? selected.permissions.filter((code) => !isRoleGrantablePermission(code))
        : [],
    [selected],
  );
  const grouped = useMemo(() => groupByCategory(ROLE_GRANTABLE_PERMISSIONS), []);

  const detailsDirty = useMemo(() => {
    if (!selected) return false;
    return !roleDetailsMatch(selected, nameDraft, descriptionDraft);
  }, [selected, nameDraft, descriptionDraft]);

  const nameInvalid = detailsDirty && userEditedDetailsRef.current && nameDraft.trim().length === 0;

  const showDetailsSaveStatus =
    detailsSaveStatus === "pending" ||
    detailsSaveStatus === "saving" ||
    detailsSaveStatus === "saved" ||
    (detailsSaveStatus === "error" && userEditedDetailsRef.current);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const categoryLabel = (cat: PermissionCategory): string => {
    const key = {
      team: "categoryTeam",
      projects: "categoryProjects",
      fieldTracker: "categoryFieldTracker",
      admin: "categoryAdmin",
      forms: "categoryForms",
      locationTracking: "categoryLocationTracking",
      bi: "categoryBi",
    }[cat] as Parameters<typeof t>[0];
    return t(key);
  };

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/roles");
      if (!res.ok) throw new Error("load failed");
      const json = (await res.json()) as { data: AdminRole[] };
      setRoles(json.data);
      if (!selectedId && json.data.length > 0) {
        setSelectedId(json.data[0].id);
      }
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [selectedId, t]);

  useEffect(() => {
    void loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useLayoutEffect(() => {
    if (!selectedId) return;
    const role = roles.find((r) => r.id === selectedId);
    if (!role) return;
    setDraftPerms(editablePermissions(role.permissions));
    setNameDraft(role.name);
    setDescriptionDraft(role.description ?? "");
    setDirty(false);
    setDetailsSaveStatus("idle");
    userEditedDetailsRef.current = false;
    clearAutosaveTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync drafts only when switching roles
  }, [selectedId, clearAutosaveTimer]);

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
      if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current);
    };
  }, [clearAutosaveTimer]);

  const persistRoleDetails = useCallback(
    async (roleId: string): Promise<boolean> => {
      const trimmedName = nameDraft.trim();
      if (!trimmedName) {
        setDetailsSaveStatus("error");
        toast.error(t("nameRequired"));
        return false;
      }

      setDetailsSaveStatus("saving");
      const savePromise = (async () => {
        try {
          const res = await fetch(`/api/admin/roles/${roleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: trimmedName,
              description: descriptionDraft.trim() || null,
            }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error ?? t("detailsSaveError"));
          }
          const json = (await res.json()) as { data: AdminRole };
          setRoles((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
          setDetailsSaveStatus("saved");
          if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current);
          savedStatusTimerRef.current = setTimeout(() => {
            setDetailsSaveStatus("idle");
            savedStatusTimerRef.current = null;
          }, 2500);
          return true;
        } catch (err) {
          setDetailsSaveStatus("error");
          toast.error(err instanceof Error ? err.message : t("detailsSaveError"));
          return false;
        } finally {
          detailsSavePromiseRef.current = null;
        }
      })();

      detailsSavePromiseRef.current = savePromise;
      return savePromise;
    },
    [nameDraft, descriptionDraft, t],
  );

  const flushPendingDetailsSave = useCallback(async (): Promise<boolean> => {
    clearAutosaveTimer();
    if (detailsSavePromiseRef.current) {
      return detailsSavePromiseRef.current;
    }
    if (!selectedId || !selected || !detailsDirty) return true;
    if (nameDraft.trim().length === 0) {
      toast.error(t("nameRequired"));
      return false;
    }
    return persistRoleDetails(selectedId);
  }, [clearAutosaveTimer, selectedId, selected, detailsDirty, nameDraft, persistRoleDetails, t]);

  useEffect(() => {
    if (!selectedId || !selected) return;
    if (!detailsDirty || !userEditedDetailsRef.current) return;
    if (nameDraft.trim().length === 0) {
      setDetailsSaveStatus("error");
      return;
    }

    setDetailsSaveStatus("pending");
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistRoleDetails(selectedId);
    }, DETAILS_AUTOSAVE_MS);

    return () => clearAutosaveTimer();
  }, [
    selectedId,
    selected,
    detailsDirty,
    nameDraft,
    descriptionDraft,
    clearAutosaveTimer,
    persistRoleDetails,
  ]);

  async function selectRole(role: AdminRole) {
    if (role.id === selectedId) return;
    if (dirty && !window.confirm(t("unsavedChanges"))) {
      return;
    }
    const flushed = await flushPendingDetailsSave();
    if (!flushed) return;
    setSelectedId(role.id);
  }

  function togglePermission(code: string) {
    if (!selected) return;
    const has = draftPerms.includes(code);
    const next = has ? draftPerms.filter((p) => p !== code) : [...draftPerms, code];

    if (has && DANGEROUS_PERMISSIONS.has(code) && selected.code === "ADMIN") {
      setPendingDanger({ code, next });
      return;
    }

    setDraftPerms(next);
    setDirty(true);
  }

  function confirmDangerousToggle() {
    if (!pendingDanger) return;
    setDraftPerms(pendingDanger.next);
    setDirty(true);
    setPendingDanger(null);
  }

  async function handleSavePermissions() {
    if (!selected) return;
    const detailsSaved = await flushPendingDetailsSave();
    if (!detailsSaved) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/roles/${selected.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: editablePermissions(draftPerms) }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("saveError"));
      }
      const json = (await res.json()) as { data: AdminRole };
      setRoles((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setDraftPerms(editablePermissions(json.data.permissions));
      setDirty(false);
      toast.success(t("saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    const code = createCode.trim().toUpperCase();
    if (!createName.trim() || !ROLE_CODE_REGEX.test(code)) {
      toast.error(t("codeHint"));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: createName.trim(),
          description: createDescription.trim() || null,
          permissions: [],
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("saveError"));
      }
      const json = (await res.json()) as { data: AdminRole };
      setRoles((prev) => [...prev, json.data].sort((a, b) => a.code.localeCompare(b.code)));
      setSelectedId(json.data.id);
      setShowCreate(false);
      setCreateName("");
      setCreateCode("");
      setCreateDescription("");
      toast.success(t("submitCreate"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!selected || selected.isBuiltin || selected.userCount > 0) return;
    if (!window.confirm(t("deleteConfirm", { name: selected.name }))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/roles/${selected.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("delete failed");
      const remaining = roles.filter((r) => r.id !== selected.id);
      setRoles(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      toast.success(t("deleteRole"));
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 8, color: "var(--neutral-600)" }}>
        <Loader2 className="animate-spin" size={18} aria-hidden="true" />
        {t("loading")}
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--neutral-900)" }}>
          {t("pageTitle")}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--neutral-600)", maxWidth: 640 }}>
          {t("pageDescription")}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 280px) 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <aside
          style={{
            border: "1px solid var(--neutral-200)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--neutral-0)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--neutral-200)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase" }}>
              {t("navLabel")}
            </span>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              aria-label={t("createButton")}
              title={t("createButton")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--neutral-0)",
                cursor: "pointer",
                color: "var(--primary-600)",
              }}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 480, overflowY: "auto" }}>
            {roles.map((role) => {
              const active = role.id === selectedId;
              return (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => selectRole(role)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderBottom: "1px solid var(--neutral-100)",
                      backgroundColor: active ? "var(--primary-50)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--neutral-900)" }}>{role.name}</div>
                    <div style={{ fontSize: 11, color: "var(--neutral-500)", marginTop: 2 }}>{role.code}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 999,
                          backgroundColor: role.isBuiltin ? "var(--neutral-100)" : "var(--primary-100)",
                          color: role.isBuiltin ? "var(--neutral-600)" : "var(--primary-700)",
                        }}
                      >
                        {role.isBuiltin ? t("builtinBadge") : t("customBadge")}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--neutral-500)" }}>
                        {t("userCount", { count: role.userCount })}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section
          style={{
            border: "1px solid var(--neutral-200)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--neutral-0)",
            padding: 16,
            minHeight: 400,
          }}
        >
          {!selected ? (
            <p style={{ color: "var(--neutral-500)", margin: 0 }}>{t("selectRole")}</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-500)" }}>
                      {t("nameLabel")}
                    </label>
                    {(showDetailsSaveStatus) && (
                      <span
                        aria-live="polite"
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color:
                            detailsSaveStatus === "error"
                              ? "var(--error-600)"
                              : detailsSaveStatus === "saved"
                                ? "var(--success-600, var(--primary-600))"
                                : "var(--neutral-500)",
                        }}
                      >
                        {detailsSaveStatus === "pending" || detailsSaveStatus === "saving"
                          ? t("saving")
                          : detailsSaveStatus === "saved"
                            ? t("detailsSaved")
                            : t("detailsSaveError")}
                      </span>
                    )}
                  </div>
                  <input
                    value={nameDraft}
                    onChange={(e) => {
                      userEditedDetailsRef.current = true;
                      setNameDraft(e.target.value);
                    }}
                    aria-invalid={nameInvalid}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: `1px solid ${nameInvalid ? "var(--error-400)" : "var(--neutral-300)"}`,
                      borderRadius: "var(--radius-sm)",
                      fontSize: 14,
                    }}
                  />
                  {nameInvalid && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 11,
                        color: "var(--error-600)",
                      }}
                    >
                      {t("nameRequired")}
                    </p>
                  )}
                  <div style={{ fontSize: 11, color: "var(--neutral-500)", marginTop: 6 }}>{selected.code}</div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--neutral-500)",
                      marginTop: 10,
                      marginBottom: 4,
                    }}
                  >
                    {t("descriptionLabel")}
                  </label>
                  <textarea
                    value={descriptionDraft}
                    onChange={(e) => {
                      userEditedDetailsRef.current = true;
                      setDescriptionDraft(e.target.value);
                    }}
                    rows={2}
                    placeholder={t("descriptionPlaceholder")}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid var(--neutral-300)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: 13,
                      resize: "vertical",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                  {!selected.isBuiltin && selected.userCount === 0 && (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                      aria-label={t("deleteRole")}
                      title={t("deleteRole")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 36,
                        height: 36,
                        border: "1px solid var(--error-300)",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--error-50)",
                        color: "var(--error-700)",
                        cursor: deleting ? "not-allowed" : "pointer",
                      }}
                    >
                      {deleting ? (
                        <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                      ) : (
                        <Trash2 size={16} aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Shield size={16} style={{ color: "var(--primary-600)" }} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{t("permissionsTitle")}</h2>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--neutral-600)" }}>{t("permissionsHint")}</p>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 11,
                  color: "var(--neutral-500)",
                  padding: "8px 10px",
                  backgroundColor: "var(--neutral-50)",
                  borderRadius: "var(--radius-sm)",
                  borderLeft: "3px solid var(--neutral-300)",
                }}
              >
                {t("issueAccessNote")}
              </p>
              {protectedPermissions.length > 0 && (
                <p
                  style={{
                    margin: "0 0 16px",
                    fontSize: 11,
                    color: "var(--neutral-600)",
                    padding: "8px 10px",
                    backgroundColor: "var(--primary-50)",
                    borderRadius: "var(--radius-sm)",
                    borderLeft: "3px solid var(--primary-300)",
                  }}
                >
                  {t("protectedPermissionsNote", {
                    permissions: protectedPermissions.map(permissionLabel).join(", "),
                  })}
                </p>
              )}

              {CATEGORY_ORDER.map((cat) => {
                const items = grouped.get(cat) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <h3
                      style={{
                        margin: "0 0 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--neutral-500)",
                      }}
                    >
                      {categoryLabel(cat)}
                    </h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {items.map((meta) => (
                        <label
                          key={meta.code}
                          title={meta.description}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 6,
                            padding: "6px 10px",
                            border: `1px solid ${draftPerms.includes(meta.code) ? "var(--primary-400)" : "var(--neutral-300)"}`,
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: draftPerms.includes(meta.code)
                              ? "var(--primary-50)"
                              : "var(--neutral-0)",
                            cursor: "pointer",
                            fontSize: 12,
                            color: draftPerms.includes(meta.code)
                              ? "var(--primary-800)"
                              : "var(--neutral-700)",
                            maxWidth: 280,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={draftPerms.includes(meta.code)}
                            onChange={() => togglePermission(meta.code)}
                            style={{ marginTop: 2 }}
                          />
                          <span>
                            <span style={{ fontWeight: 700, display: "block" }}>{meta.label}</span>
                            <span style={{ fontSize: 10, color: "var(--neutral-500)" }}>{meta.code}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => void handleSavePermissions()}
                disabled={!dirty || saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: dirty ? "var(--primary-600)" : "var(--neutral-300)",
                  color: "var(--neutral-0)",
                  cursor: !dirty || saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? (
                  <Loader2 className="animate-spin" size={14} aria-hidden="true" />
                ) : (
                  <Save size={14} aria-hidden="true" />
                )}
                {saving ? t("saving") : t("saveButton")}
              </button>
            </>
          )}
        </section>
      </div>

      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-role-title"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => !creating && setShowCreate(false)}
        >
          <div
            style={{
              backgroundColor: "var(--neutral-0)",
              borderRadius: "var(--radius-md)",
              padding: 20,
              width: "100%",
              maxWidth: 420,
              boxShadow: "var(--shadow-2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="create-role-title" style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800 }}>
              {t("createTitle")}
            </h2>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{t("nameLabel")}</label>
            <input
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                if (!createCode || createCode === suggestRoleCode(createName)) {
                  setCreateCode(suggestRoleCode(e.target.value));
                }
              }}
              placeholder={t("namePlaceholder")}
              style={{
                width: "100%",
                marginBottom: 12,
                padding: "8px 10px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
              }}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{t("codeLabel")}</label>
            <input
              value={createCode}
              onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
              placeholder={t("codePlaceholder")}
              style={{
                width: "100%",
                marginBottom: 4,
                padding: "8px 10px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "monospace",
              }}
            />
            <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--neutral-500)" }}>{t("codeHint")}</p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              {t("descriptionLabel")}
            </label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={2}
              style={{
                width: "100%",
                marginBottom: 16,
                padding: "8px 10px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                style={{
                  padding: "8px 14px",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--neutral-0)",
                  cursor: "pointer",
                }}
              >
                {t("cancelButton")}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--primary-600)",
                  color: "var(--neutral-0)",
                  fontWeight: 700,
                  cursor: creating ? "not-allowed" : "pointer",
                }}
              >
                {creating ? t("creating") : t("submitCreate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDanger && selected && (
        <div
          role="alertdialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--neutral-0)",
              borderRadius: "var(--radius-md)",
              padding: 20,
              maxWidth: 400,
              boxShadow: "var(--shadow-2)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>{t("dangerousPermTitle")}</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--neutral-700)" }}>
              {t("dangerousPermBody", {
                permission:
                  PERMISSION_METADATA.find((m) => m.code === pendingDanger.code)?.label ?? pendingDanger.code,
                role: selected.name,
              })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setPendingDanger(null)}
                style={{
                  padding: "8px 14px",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--neutral-0)",
                  cursor: "pointer",
                }}
              >
                {t("cancelButton")}
              </button>
              <button
                type="button"
                onClick={confirmDangerousToggle}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--error-600)",
                  color: "var(--neutral-0)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t("confirmRemove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
