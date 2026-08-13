"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import type { ManageObservationTypeCatalogItem } from "@/lib/observations/observation-catalog";
import {
  assignSequentialSortOrders,
  catalogItemsNeedingSortPatch,
  reorderByIndex,
} from "@/lib/project-settings/reorder-catalog";
import {
  CatalogSortableList,
  CatalogSortableRow,
} from "@/components/project-settings/CatalogSortableList";

interface ManageCatalogResponse {
  observationTypes: ManageObservationTypeCatalogItem[];
}

async function loadManageCatalog(): Promise<ManageCatalogResponse> {
  const res = await fetch("/api/observation-catalog/manage");
  if (!res.ok) throw new Error(`manage:${res.status}`);
  return (await res.json()) as ManageCatalogResponse;
}

interface CatalogCollapsibleSectionProps {
  title: string;
  hint: string;
  expanded: boolean;
  onToggle: () => void;
  toggleAriaLabel: string;
  children: ReactNode;
}

function CatalogCollapsibleSection({
  title,
  hint,
  expanded,
  onToggle,
  toggleAriaLabel,
  children,
}: CatalogCollapsibleSectionProps) {
  return (
    <section
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={toggleAriaLabel}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {expanded ? (
          <ChevronUp size={16} aria-hidden style={{ color: "var(--neutral-500)", flexShrink: 0 }} />
        ) : (
          <ChevronDown size={16} aria-hidden style={{ color: "var(--neutral-500)", flexShrink: 0 }} />
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 15,
            fontWeight: 700,
            color: "var(--neutral-900)",
          }}
        >
          {title}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 12px 12px" }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--neutral-500)" }}>{hint}</p>
          {children}
        </div>
      )}
    </section>
  );
}

export function ObservationCatalogManager() {
  const t = useTranslations("forms.observationSetup");
  const tCommon = useTranslations("common");
  const [observationTypes, setObservationTypes] = useState<ManageObservationTypeCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTypeName, setNewTypeName] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [typesExpanded, setTypesExpanded] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadManageCatalog();
      setObservationTypes(data.observationTypes);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function patchObservationType(
    code: string,
    patch: Partial<Pick<ManageObservationTypeCatalogItem, "displayName" | "sortOrder" | "isActive">>,
  ) {
    setSavingCode(code);
    try {
      const res = await fetch(`/api/observation-catalog/types/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("patch failed");
      await refresh();
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSavingCode(null);
    }
  }

  async function createObservationType() {
    const name = newTypeName.trim();
    if (!name) return;
    setSavingCode("__new_type__");
    try {
      const res = await fetch("/api/observation-catalog/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      if (!res.ok) throw new Error("create failed");
      setNewTypeName("");
      await refresh();
      toast.success(t("created"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSavingCode(null);
    }
  }

  async function persistTypeOrder(reordered: ManageObservationTypeCatalogItem[]) {
    const withOrders = assignSequentialSortOrders(reordered);
    const changed = catalogItemsNeedingSortPatch(observationTypes, withOrders);
    if (changed.length === 0) return;

    setObservationTypes(withOrders);
    setSavingCode("__reorder_types__");
    try {
      const results = await Promise.all(
        changed.map((item) =>
          fetch(`/api/observation-catalog/types/${encodeURIComponent(item.code)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: item.sortOrder }),
          }),
        ),
      );
      if (results.some((res) => !res.ok)) throw new Error("patch failed");
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveError"));
      await refresh();
    } finally {
      setSavingCode(null);
    }
  }

  function handleReorderTypes(from: number, to: number) {
    const sorted = [...observationTypes].sort((a, b) => a.sortOrder - b.sortOrder);
    void persistTypeOrder(reorderByIndex(sorted, from, to));
  }

  function moveType(code: string, direction: -1 | 1) {
    const sorted = [...observationTypes].sort((a, b) => a.sortOrder - b.sortOrder);
    const from = sorted.findIndex((row) => row.code === code);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= sorted.length) return;
    void persistTypeOrder(reorderByIndex(sorted, from, to));
  }

  const rowInputStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    border: "1px solid var(--neutral-200)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    backgroundColor: "var(--neutral-0)",
    color: "var(--neutral-900)",
  };

  if (loading && observationTypes.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 24, color: "var(--neutral-400)" }}>
        <Loader2 size={22} className="animate-spin" aria-hidden />
      </div>
    );
  }

  const sortedTypes = [...observationTypes].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <CatalogCollapsibleSection
        title={t("typesTitle")}
        hint={t("typesHint")}
        expanded={typesExpanded}
        onToggle={() => setTypesExpanded((open) => !open)}
        toggleAriaLabel={
          typesExpanded
            ? t("collapseSection", { section: t("typesTitle") })
            : t("expandSection", { section: t("typesTitle") })
        }
      >
        <CatalogSortableList itemCount={sortedTypes.length} onReorder={handleReorderTypes}>
          {(getDragProps, isMobile) =>
            sortedTypes.map((row, index) => (
              <CatalogSortableRow
                key={row.code}
                dragProps={getDragProps(index)}
                dragHandleAriaLabel={t("dragToReorder")}
                opacity={row.isActive ? 1 : 0.55}
                showMoveButtons={isMobile}
                moveUpAriaLabel={t("moveUp")}
                moveDownAriaLabel={t("moveDown")}
                moveUpDisabled={index === 0 || savingCode === row.code}
                moveDownDisabled={index === sortedTypes.length - 1 || savingCode === row.code}
                onMoveUp={() => moveType(row.code, -1)}
                onMoveDown={() => moveType(row.code, 1)}
              >
                <input
                  type="text"
                  value={row.displayName}
                  aria-label={t("editTypeName", { name: row.displayName })}
                  onChange={(e) =>
                    setObservationTypes((prev) =>
                      prev.map((r) => (r.code === row.code ? { ...r, displayName: e.target.value } : r)),
                    )
                  }
                  onBlur={() => {
                    const latest = observationTypes.find((r) => r.code === row.code);
                    if (latest && latest.displayName.trim() && latest.displayName !== row.displayName) {
                      void patchObservationType(row.code, { displayName: latest.displayName.trim() });
                    }
                  }}
                  style={rowInputStyle}
                />
                <button
                  type="button"
                  aria-label={row.isActive ? t("archive") : t("restore")}
                  onClick={() => void patchObservationType(row.code, { isActive: !row.isActive })}
                  style={{ width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
                >
                  {row.isActive ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                </button>
              </CatalogSortableRow>
            ))
          }
        </CatalogSortableList>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="text"
            value={newTypeName}
            placeholder={t("newTypePlaceholder")}
            onChange={(e) => setNewTypeName(e.target.value)}
            style={{
              flex: 1,
              border: "1px solid var(--neutral-200)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
            }}
          />
          <button
            type="button"
            aria-label={t("addType")}
            onClick={() => void createObservationType()}
            disabled={savingCode === "__new_type__" || !newTypeName.trim()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              border: "none",
              backgroundColor: "var(--primary-600)",
              color: "var(--neutral-0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Plus size={18} />
          </button>
        </div>
      </CatalogCollapsibleSection>

      {savingCode && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)" }}>{tCommon("loading")}</p>
      )}
    </div>
  );
}
