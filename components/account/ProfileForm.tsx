"use client";

import { useState, useCallback } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatRole } from "@/lib/permissions";
import type { RoleCode } from "@/lib/permissions";

interface ProfileFormProps {
  initialName: string | null;
  email: string;
  role: RoleCode;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ProfileForm({ initialName, email, role }: ProfileFormProps) {
  const t = useTranslations("account");
  const [name, setName] = useState(initialName ?? "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const isDirty = name.trim() !== (initialName ?? "").trim();
  const canSave = isDirty && name.trim().length > 0 && saveStatus !== "saving";

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    }
  }, [canSave, name]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "var(--space-2) var(--space-3)",
    border: "1px solid var(--neutral-300)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--text-body)",
    color: "var(--neutral-900)",
    backgroundColor: "var(--neutral-0)",
    outline: "none",
    boxSizing: "border-box",
  };

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    alignItems: "baseline",
    gap: "var(--space-2) var(--space-4)",
    paddingTop: "var(--space-3)",
    borderTop: "1px solid var(--neutral-100)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "var(--text-caption)",
    fontWeight: 600,
    color: "var(--neutral-500)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const valueStyle: React.CSSProperties = {
    fontSize: "var(--text-body)",
    color: "var(--neutral-900)",
  };

  return (
    <div
      style={{
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* Editable name field */}
      <div>
        <label
          htmlFor="profile-name"
          style={{
            display: "block",
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            color: "var(--neutral-500)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "var(--space-1)",
          }}
        >
          {t("name")}
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          maxLength={100}
          placeholder={t("namePlaceholder")}
          onChange={(e) => {
            setName(e.target.value);
            if (saveStatus === "error") setSaveStatus("idle");
          }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          style={inputStyle}
        />
      </div>

      {/* Read-only: email */}
      <div style={rowStyle}>
        <dt style={labelStyle}>{t("email")}</dt>
        <dd style={{ ...valueStyle, margin: 0 }}>{email}</dd>
      </div>

      {/* Read-only: role */}
      <div style={rowStyle}>
        <dt style={labelStyle}>{t("role")}</dt>
        <dd style={{ ...valueStyle, margin: 0 }}>{formatRole(role)}</dd>
      </div>

      {/* Save row — always visible at the bottom of the card body */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--neutral-100)",
        }}
      >
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          style={{
            padding: "var(--space-2) var(--space-4)",
            backgroundColor: canSave ? "var(--primary-600)" : "var(--neutral-0)",
            color: canSave ? "var(--neutral-0)" : "var(--neutral-400)",
            border: canSave ? "none" : "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-body)",
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            transition: "background-color 0.15s, color 0.15s, border-color 0.15s",
            opacity: saveStatus === "saving" ? 0.75 : 1,
          }}
        >
          {saveStatus === "saving" ? (
            <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" aria-hidden />
          ) : saveStatus === "saved" ? (
            <Check style={{ width: 14, height: 14 }} aria-hidden />
          ) : null}
          {saveStatus === "saved" ? t("nameSaved") : t("saveName")}
        </button>

        <p
          aria-live="polite"
          style={{
            margin: 0,
            fontSize: "var(--text-caption)",
            color: saveStatus === "error" ? "var(--error-600)" : "transparent",
          }}
        >
          {saveStatus === "error" ? t("nameSaveError") : " "}
        </p>
      </div>
    </div>
  );
}
