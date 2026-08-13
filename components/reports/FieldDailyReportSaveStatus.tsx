"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  aggregateFieldDailySaveStatus,
  type FieldDailyAggregateSaveStatus,
  type FieldDailySectionSaveStatus,
} from "@/lib/field-daily-report/aggregate-save-status";

interface FieldDailyReportSaveContextValue {
  reportStatus: (sectionKey: string, status: FieldDailySectionSaveStatus) => void;
  registerFlushHandler: (sectionKey: string, handler: () => Promise<boolean>) => () => void;
  registerDiscardHandler: (sectionKey: string, handler: () => void) => () => void;
  saveAllNotes: () => Promise<boolean>;
  discardAllNotes: () => void;
  hasDirtyNotes: boolean;
}

const FieldDailyReportSaveContext = createContext<FieldDailyReportSaveContextValue | null>(null);

export function FieldDailyReportSaveProvider({ children }: { children: ReactNode }) {
  const statusesRef = useRef(new Map<string, FieldDailySectionSaveStatus>());
  const flushHandlersRef = useRef(new Map<string, () => Promise<boolean>>());
  const discardHandlersRef = useRef(new Map<string, () => void>());
  const [aggregate, setAggregate] = useState<FieldDailyAggregateSaveStatus>("idle");
  const [hasDirtyNotes, setHasDirtyNotes] = useState(false);

  const refreshAggregate = useCallback(() => {
    setAggregate(aggregateFieldDailySaveStatus(statusesRef.current.values()));
    setHasDirtyNotes(
      [...statusesRef.current.values()].some((status) => status === "dirty"),
    );
  }, []);

  const reportStatus = useCallback(
    (sectionKey: string, status: FieldDailySectionSaveStatus) => {
      if (status === "idle") {
        statusesRef.current.delete(sectionKey);
      } else {
        statusesRef.current.set(sectionKey, status);
      }
      refreshAggregate();
    },
    [refreshAggregate],
  );

  const registerFlushHandler = useCallback(
    (sectionKey: string, handler: () => Promise<boolean>) => {
      flushHandlersRef.current.set(sectionKey, handler);
      return () => {
        flushHandlersRef.current.delete(sectionKey);
      };
    },
    [],
  );

  const registerDiscardHandler = useCallback(
    (sectionKey: string, handler: () => void) => {
      discardHandlersRef.current.set(sectionKey, handler);
      return () => {
        discardHandlersRef.current.delete(sectionKey);
      };
    },
    [],
  );

  const discardAllNotes = useCallback(() => {
    for (const handler of discardHandlersRef.current.values()) {
      handler();
    }
  }, []);

  const saveAllNotes = useCallback(async (): Promise<boolean> => {
    const handlers = [...flushHandlersRef.current.values()];
    if (handlers.length === 0) return true;
    const results = await Promise.all(handlers.map((handler) => handler()));
    return results.every(Boolean);
  }, []);

  const value = useMemo(
    () => ({
      reportStatus,
      registerFlushHandler,
      registerDiscardHandler,
      saveAllNotes,
      discardAllNotes,
      hasDirtyNotes,
    }),
    [
      reportStatus,
      registerFlushHandler,
      registerDiscardHandler,
      saveAllNotes,
      discardAllNotes,
      hasDirtyNotes,
    ],
  );

  return (
    <FieldDailyReportSaveContext.Provider value={value}>
      <FieldDailyReportSaveAggregateContext.Provider value={aggregate}>
        {children}
      </FieldDailyReportSaveAggregateContext.Provider>
    </FieldDailyReportSaveContext.Provider>
  );
}

const FieldDailyReportSaveAggregateContext = createContext<FieldDailyAggregateSaveStatus>("idle");

export function useFieldDailyReportSaveReporter(): FieldDailyReportSaveContextValue["reportStatus"] | null {
  return useContext(FieldDailyReportSaveContext)?.reportStatus ?? null;
}

export function useFieldDailyReportSaveRegistration():
  | FieldDailyReportSaveContextValue["registerFlushHandler"]
  | null {
  return useContext(FieldDailyReportSaveContext)?.registerFlushHandler ?? null;
}

export function useFieldDailyReportSaveAll(): (() => Promise<boolean>) | null {
  return useContext(FieldDailyReportSaveContext)?.saveAllNotes ?? null;
}

export function useFieldDailyReportDiscardAll(): (() => void) | null {
  return useContext(FieldDailyReportSaveContext)?.discardAllNotes ?? null;
}

export function useFieldDailyReportHasDirtyNotes(): boolean {
  return useContext(FieldDailyReportSaveContext)?.hasDirtyNotes ?? false;
}

export function useFieldDailyReportDiscardRegistration():
  | FieldDailyReportSaveContextValue["registerDiscardHandler"]
  | null {
  return useContext(FieldDailyReportSaveContext)?.registerDiscardHandler ?? null;
}

export function useFieldDailyReportAggregateSaveStatus(): FieldDailyAggregateSaveStatus {
  return useContext(FieldDailyReportSaveAggregateContext) ?? "idle";
}

function saveStatusStyles(status: FieldDailyAggregateSaveStatus): {
  bg: string;
  color: string;
  border: string;
} {
  if (status === "saved") {
    return {
      bg: "var(--success-50)",
      color: "var(--success-700)",
      border: "var(--success-200)",
    };
  }
  if (status === "error") {
    return {
      bg: "var(--error-50)",
      color: "var(--error-700)",
      border: "var(--error-200)",
    };
  }
  if (status === "saving") {
    return {
      bg: "var(--primary-50)",
      color: "var(--primary-700)",
      border: "var(--primary-200)",
    };
  }
  return {
    bg: "var(--neutral-50)",
    color: "var(--neutral-500)",
    border: "var(--neutral-200)",
  };
}

/** Sticky save confirmation in the daily report sheet header. */
export function FieldDailyReportSaveBadge() {
  const t = useTranslations("fieldDailyReport");
  const status = useFieldDailyReportAggregateSaveStatus();
  const styles = saveStatusStyles(status);

  if (status === "idle") return null;

  const label =
    status === "saving"
      ? t("notesSaveStatusSaving")
      : status === "saved"
        ? t("notesSaveStatusSaved")
        : t("notesSaveStatusError");

  const Icon =
    status === "saving"
      ? Loader2
      : status === "saved"
        ? CheckCircle2
        : status === "error"
          ? AlertCircle
          : null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
        padding: "5px 10px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: styles.bg,
        color: styles.color,
        border: `1px solid ${styles.border}`,
      }}
    >
      {Icon ? (
        <Icon
          size={14}
          aria-hidden
          className={status === "saving" ? "animate-spin" : undefined}
        />
      ) : null}
      <span>{label}</span>
    </div>
  );
}

const sectionIndicatorStyles: Record<
  Exclude<FieldDailySectionSaveStatus, "idle">,
  { color: string }
> = {
  dirty: { color: "var(--neutral-500)" },
  saving: { color: "var(--primary-600)" },
  saved: { color: "var(--success-600)" },
  error: { color: "var(--error-600)" },
};

export function FieldDailySectionSaveIndicator({
  status,
}: {
  status: FieldDailySectionSaveStatus;
}) {
  const t = useTranslations("fieldDailyReport");

  if (status === "idle") return null;

  const label =
    status === "dirty" || status === "saving"
      ? t("saving")
      : status === "saved"
        ? t("saved")
        : t("sectionCommentSaveError");

  const Icon =
    status === "dirty" || status === "saving"
      ? Loader2
      : status === "saved"
        ? CheckCircle2
        : AlertCircle;

  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color: sectionIndicatorStyles[status].color,
        flexShrink: 0,
      }}
    >
      <Icon
        size={12}
        aria-hidden
        className={status === "dirty" || status === "saving" ? "animate-spin" : undefined}
      />
      {label}
    </span>
  );
}

/** Sticky footer — close when clean; save + cancel when notes have unsaved edits. */
export function FieldDailyReportSaveFooter({
  onClose,
  onSaveAndClose,
}: {
  onClose: () => void;
  onSaveAndClose: () => void;
}) {
  const t = useTranslations("fieldDailyReport");
  const tCommon = useTranslations("common");
  const saveAllNotes = useFieldDailyReportSaveAll();
  const discardAllNotes = useFieldDailyReportDiscardAll();
  const hasDirtyNotes = useFieldDailyReportHasDirtyNotes();
  const [pending, setPending] = useState(false);

  const isSaving = pending;

  const handleSaveAndClose = async () => {
    if (!saveAllNotes || isSaving || !hasDirtyNotes) return;
    setPending(true);
    try {
      const ok = await saveAllNotes();
      if (ok) onSaveAndClose();
    } finally {
      setPending(false);
    }
  };

  const handleCancel = () => {
    if (isSaving) return;
    discardAllNotes?.();
  };

  const handleCloseWithoutSaving = () => {
    if (isSaving) return;
    if (hasDirtyNotes) discardAllNotes?.();
    onClose();
  };

  const footerShellStyle = {
    flexShrink: 0,
    padding: "10px 12px",
    paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
    borderTop: "1px solid var(--neutral-200)",
    backgroundColor: "var(--neutral-0)",
  } as const;

  const ghostBtnStyle: CSSProperties = {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--neutral-200)",
    backgroundColor: "var(--neutral-0)",
    color: "var(--neutral-700)",
    fontWeight: 600,
    fontSize: "var(--text-caption)",
    cursor: isSaving ? "not-allowed" : "pointer",
    opacity: isSaving ? 0.6 : 1,
  };

  if (!hasDirtyNotes) {
    return (
      <div style={footerShellStyle}>
        <button
          type="button"
          onClick={handleCloseWithoutSaving}
          disabled={isSaving}
          style={{
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            border: "none",
            backgroundColor: "var(--color-accent)",
            color: "var(--neutral-0)",
            fontWeight: 700,
            fontSize: "var(--text-body)",
            cursor: "pointer",
          }}
        >
          {t("close")}
        </button>
      </div>
    );
  }

  return (
    <div style={footerShellStyle}>
      <button
        type="button"
        onClick={() => void handleSaveAndClose()}
        disabled={isSaving}
        aria-busy={isSaving}
        style={{
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "12px 16px",
          borderRadius: "var(--radius-sm)",
          border: "none",
          backgroundColor: "var(--color-accent)",
          color: "var(--neutral-0)",
          fontWeight: 700,
          fontSize: "var(--text-body)",
          cursor: isSaving ? "not-allowed" : "pointer",
          opacity: isSaving ? 0.85 : 1,
          marginBottom: 8,
        }}
      >
        {isSaving ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden />
            {t("savingNotesAndClose")}
          </>
        ) : (
          t("saveNotesAndClose")
        )}
      </button>
      <button
        type="button"
        onClick={handleCancel}
        disabled={isSaving}
        style={{ ...ghostBtnStyle, width: "100%" }}
      >
        {tCommon("cancel")}
      </button>
    </div>
  );
}
