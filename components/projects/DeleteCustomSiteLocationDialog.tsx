"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";

interface DeleteCustomSiteLocationDialogProps {
  location: CustomSiteLocation;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteCustomSiteLocationDialog({
  location,
  onConfirm,
  onCancel,
}: DeleteCustomSiteLocationDialogProps) {
  const t = useTranslations("units.customSite");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleCancel = () => {
    if (submitting) return;
    setVisible(false);
    window.setTimeout(onCancel, 200);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-custom-site-title"
      aria-describedby="delete-custom-site-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) handleCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))",
        backgroundColor: visible ? "var(--overlay-bg, rgba(0,0,0,0.5))" : "transparent",
        transition: "background-color 0.2s ease",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "18px 16px 14px",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--neutral-0)",
          boxShadow: "var(--shadow-2)",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.96)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}
      >
        <h2
          id="delete-custom-site-title"
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: "var(--neutral-900)",
            lineHeight: 1.3,
          }}
        >
          {t("deleteConfirm")}
        </h2>
        <p
          id="delete-custom-site-desc"
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: "var(--neutral-600)",
            lineHeight: 1.45,
          }}
        >
          {t("deleteConfirmMessage", { name: location.name })}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            style={{
              flex: 1,
              minHeight: 40,
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-700)",
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("deleteConfirmNo")}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            style={{
              flex: 1,
              minHeight: 40,
              border: "none",
              borderRadius: "var(--radius-md)",
              backgroundColor: submitting ? "var(--neutral-300)" : "var(--error-600)",
              color: "var(--neutral-0)",
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? "default" : "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {t("deleteConfirmYes")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
