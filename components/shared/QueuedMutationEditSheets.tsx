"use client";

/**
 * Lightweight edit sheets for queued mutations (comment, unit status, custom site).
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { toast } from "sonner";
import { AddCustomSiteLocationSheet } from "@/components/projects/AddCustomSiteLocationSheet";
import {
  CustomSiteLocationOfflineDuplicateError,
  isCustomSiteLocationNameTakenOffline,
} from "@/lib/offline/custom-site-location-offline";
import { SCOPE_COMBINED_OPTIONS, isInstallCompleteCombinedOptionKey } from "@/lib/scope-combined-options";
import { isTransitionToInstallCompleteScope } from "@/lib/scope-install-complete-gate";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import { updateQueuedMutation } from "@/lib/offline/mutation-queue";
import { OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline/events";
import type {
  QueuedCommentEditContext,
  QueuedCustomSiteEditContext,
  QueuedUnitStatusEditContext,
} from "@/lib/offline/pending-mutation-edit";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 5000,
  background: "var(--overlay-bg, rgba(0,0,0,0.5))",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const sheetStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 480,
  maxHeight: "85vh",
  overflow: "auto",
  background: "var(--neutral-0)",
  borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
  padding: "12px 12px calc(12px + env(safe-area-inset-bottom))",
};

function QueuedEditSheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("offlineCachePanel");
  return createPortal(
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="queued-edit-title"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 id="queued-edit-title" style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("queuedEditClose")}
            style={{
              width: 36,
              height: 36,
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function QueuedCommentEditSheet({
  context,
  onClose,
  onSaved,
}: {
  context: QueuedCommentEditContext;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("offlineCachePanel");
  const [text, setText] = useState(context.body);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error(t("queuedEditCommentRequired"));
      return;
    }
    setSaving(true);
    try {
      await updateQueuedMutation(context.mutationId, { body: { body: trimmed } });
      toast.success(t("queuedEditSaved"));
      window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));
      onSaved();
      onClose();
    } catch {
      toast.error(t("queuedEditFailed"));
    } finally {
      setSaving(false);
    }
  }

  const title =
    context.target === "observation"
      ? t("queuedEditCommentObservationTitle")
      : context.target === "issue"
        ? t("queuedEditCommentIssueTitle")
        : t("queuedEditCommentTitle");

  return (
    <QueuedEditSheetShell title={title} onClose={onClose}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: 10,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--neutral-300)",
          fontFamily: "inherit",
          fontSize: 15,
          resize: "vertical",
        }}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        style={{
          marginTop: 12,
          width: "100%",
          minHeight: 44,
          border: "none",
          borderRadius: "var(--radius-md)",
          background: "var(--primary-600)",
          color: "var(--neutral-0)",
          fontWeight: 700,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {saving ? t("queuedEditSaving") : t("queuedEditSave")}
      </button>
    </QueuedEditSheetShell>
  );
}

export function QueuedUnitStatusEditSheet({
  context,
  onClose,
  onSaved,
}: {
  context: QueuedUnitStatusEditContext;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("offlineCachePanel");
  const tUnits = useTranslations("units");
  const location = [context.unit, context.building, context.level].filter(Boolean).join(" · ");
  const initialKey =
    SCOPE_COMBINED_OPTIONS.find(
      (o) => o.stage === context.scopeStage && o.status === context.scopeStatus,
    )?.key ?? SCOPE_COMBINED_OPTIONS[0]?.key ?? "";
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const option = SCOPE_COMBINED_OPTIONS.find((o) => o.key === selectedKey);
    if (!option) return;
    const prevStage = context.scopeStage as ScopeStage;
    const prevStatus = context.scopeStatus as ScopeStatus;
    if (
      context.installCompleteBlocked &&
      isTransitionToInstallCompleteScope(prevStage, prevStatus, option.stage, option.status)
    ) {
      toast.error(tUnits("installCompleteBlockedByIssueToast"));
      return;
    }
    setSaving(true);
    try {
      await updateQueuedMutation(context.mutationId, {
        body: {
          scopeStage: option.stage,
          scopeStatus: option.status,
          building: context.building,
          level: context.level,
          unit: context.unit,
        },
      });
      toast.success(t("queuedEditSaved"));
      window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));
      onSaved();
      onClose();
    } catch {
      toast.error(t("queuedEditFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <QueuedEditSheetShell title={t("queuedEditStatusTitle")} onClose={onClose}>
      {location ? (
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--color-text-secondary)" }}>{location}</p>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {SCOPE_COMBINED_OPTIONS.map((option) => {
          const blocked =
            context.installCompleteBlocked &&
            isInstallCompleteCombinedOptionKey(option.key);
          return (
          <button
            key={option.key}
            type="button"
            disabled={blocked}
            title={blocked ? tUnits("installCompleteOptionDisabledTitle") : undefined}
            onClick={() => {
              if (!blocked) setSelectedKey(option.key);
            }}
            aria-pressed={selectedKey === option.key}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: `1.5px solid ${selectedKey === option.key ? "var(--primary-500)" : "var(--neutral-200)"}`,
              background: selectedKey === option.key ? "var(--primary-50)" : "var(--neutral-0)",
              cursor: blocked ? "not-allowed" : "pointer",
              opacity: blocked ? 0.45 : 1,
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: selectedKey === option.key ? 700 : 500,
            }}
          >
            {option.label}
          </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        style={{
          marginTop: 12,
          width: "100%",
          minHeight: 44,
          border: "none",
          borderRadius: "var(--radius-md)",
          background: "var(--primary-600)",
          color: "var(--neutral-0)",
          fontWeight: 700,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {saving ? t("queuedEditSaving") : t("queuedEditSave")}
      </button>
    </QueuedEditSheetShell>
  );
}

export function QueuedCustomSiteEditSheet({
  context,
  onClose,
  onSaved,
}: {
  context: QueuedCustomSiteEditContext;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("offlineCachePanel");
  const tCustom = useTranslations("customSiteLocations");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(payload: {
    name: string;
    placement: QueuedCustomSiteEditContext["placement"];
    building: string;
    level: string;
  }) {
    setSaving(true);
    try {
      if (
        await isCustomSiteLocationNameTakenOffline(
          context.projectId,
          {
            name: payload.name,
            placement: payload.placement,
            building: payload.building,
            level: payload.level,
          },
          { excludeMutationId: context.mutationId },
        )
      ) {
        toast.error(tCustom("duplicateNameError"));
        setSaving(false);
        return;
      }
      await updateQueuedMutation(context.mutationId, {
        body: {
          name: payload.name.trim(),
          placement: payload.placement,
          building: payload.building,
          level: payload.level,
        },
      });
      toast.success(t("queuedEditSaved"));
      window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));
      onSaved();
      onClose();
    } catch {
      toast.error(t("queuedEditFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (saving) return null;

  return (
    <AddCustomSiteLocationSheet
      buildingOptions={context.building ? [context.building] : []}
      levelOptions={context.level ? [context.level] : []}
      lockedBuilding={context.placement !== "standalone" ? context.building : undefined}
      lockedLevel={context.placement === "building_level" ? context.level : undefined}
      initialName={context.name}
      initialPlacement={context.placement}
      initialBuilding={context.building}
      initialLevel={context.level}
      submitLabel={t("queuedEditSave")}
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
}
