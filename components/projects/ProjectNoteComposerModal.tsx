"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface ProjectNoteComposerModalProps {
  mode: "create" | "edit";
  initialBody?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (body: string) => void | Promise<void>;
}

export function ProjectNoteComposerModal({
  mode,
  initialBody = "",
  saving = false,
  onClose,
  onSubmit,
}: ProjectNoteComposerModalProps) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const [visible, setVisible] = useState(false);
  const [body, setBody] = useState(initialBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!visible) return;
    textareaRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (typeof document === "undefined") return null;

  const title = mode === "create" ? t("hubProjectNotesAddTitle") : t("hubProjectNotesEditTitle");
  const submitLabel = mode === "create" ? t("hubProjectNotesSave") : t("hubProjectNotesSave");

  return createPortal(
    <div
      role="presentation"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "var(--space-3)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.2s ease",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-note-composer-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-2)",
          padding: "var(--space-3)",
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: "transform 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h2
            id="project-note-composer-title"
            style={{
              flex: 1,
              margin: 0,
              fontSize: "var(--text-body)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={tCommon("close")}
            title={tCommon("close")}
            style={{
              width: 32,
              height: 32,
              border: "none",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--control-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--neutral-600)",
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder={t("hubProjectNotesPlaceholder")}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--neutral-300)",
            fontSize: "var(--text-body)",
            lineHeight: 1.45,
            resize: "vertical",
            minHeight: 120,
            color: "var(--color-text-primary)",
            backgroundColor: "var(--color-surface)",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--neutral-300)",
              backgroundColor: "var(--color-surface)",
              color: "var(--neutral-700)",
              fontWeight: 600,
              fontSize: "var(--text-caption)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            disabled={saving || !body.trim()}
            onClick={() => void onSubmit(body.trim())}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              backgroundColor: "var(--color-accent)",
              color: "var(--neutral-0)",
              fontWeight: 600,
              fontSize: "var(--text-caption)",
              cursor: saving || !body.trim() ? "not-allowed" : "pointer",
              opacity: saving || !body.trim() ? 0.7 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
