"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatRole } from "@/lib/permissions";
import { Eye, EyeOff } from "lucide-react";

interface RoleOption {
  code: string;
  name: string;
}

interface RolePreviewPickerProps {
  /** The user's real role — used to label the "your role" item and to clear preview
   *  when the real role is selected from the dropdown. */
  realRole: string;
  /** Currently active preview role, or null if no preview is active. */
  activePreviewRole: string | null;
}

/**
 * RolePreviewPicker — compact role switcher embedded in the AccountMenu dropdown.
 *
 * When no preview is active it shows a "Preview as..." native select element.
 * When a preview is active it also renders an inline "Exit preview" link so the
 * user can quickly reset without scrolling up to the banner.
 *
 * On change: calls POST /api/admin/role-preview, then router.refresh() so the
 * server-rendered layout picks up the new effective session role.
 */
export function RolePreviewPicker({ realRole, activePreviewRole }: RolePreviewPickerProps) {
  const t = useTranslations("rolePreview");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/roles");
        if (!res.ok) return;
        const json = (await res.json()) as { data: RoleOption[] };
        if (!cancelled) setRoles(json.data ?? []);
      } catch {
        // Non-fatal — picker stays empty until roles load
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyRole(roleCode: string) {
    setError(null);
    try {
      const res = await fetch("/api/admin/role-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewRole: roleCode }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("errorGeneric"));
        return;
      }
    } catch {
      setError(t("errorGeneric"));
      return;
    }
    startTransition(() => router.refresh());
  }

  async function handleExit() {
    setError(null);
    try {
      await fetch("/api/admin/role-preview", { method: "DELETE" });
    } catch {
      // Ignore — always refresh regardless
    }
    startTransition(() => router.refresh());
  }

  async function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (!value) return;
    await applyRole(value);
  }

  const isPreviewActive = activePreviewRole !== null;

  return (
    <div
      style={{
        padding: "var(--space-2) var(--space-4)",
        paddingLeft: "var(--space-12)",
        borderTop: "1px solid var(--neutral-200)",
        marginTop: "var(--space-1)",
      }}
    >
      <p
        style={{
          fontSize: "var(--text-caption)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--neutral-500)",
          margin: "0 0 var(--space-1) 0",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
        }}
      >
        {isPreviewActive
          ? <Eye style={{ width: 12, height: 12 }} aria-hidden="true" />
          : <EyeOff style={{ width: 12, height: 12 }} aria-hidden="true" />
        }
        {t("sectionLabel")}
      </p>

      <select
        value={isPreviewActive ? activePreviewRole : ""}
        onChange={handleSelectChange}
        disabled={isPending}
        aria-label={t("selectRole")}
        style={{
          width: "100%",
          fontSize: "var(--text-body)",
          color: isPreviewActive ? "var(--primary-700)" : "var(--neutral-700)",
          backgroundColor: isPreviewActive ? "var(--primary-50)" : "var(--neutral-0)",
          border: `1px solid ${isPreviewActive ? "var(--primary-300)" : "var(--neutral-300)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-1) var(--space-2)",
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.6 : 1,
          outline: "none",
        }}
      >
        <option value="">{t("pickARole")}</option>
        {roles.map((role) => (
          <option key={role.code} value={role.code}>
            {role.name || formatRole(role.code)}
            {role.code === realRole ? ` (${t("yours")})` : ""}
          </option>
        ))}
      </select>

      {isPreviewActive && (
        <button
          onClick={handleExit}
          disabled={isPending}
          style={{
            marginTop: "var(--space-1)",
            width: "100%",
            fontSize: "var(--text-caption)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--primary-600)",
            backgroundColor: "transparent",
            border: "none",
            padding: 0,
            cursor: isPending ? "not-allowed" : "pointer",
            textAlign: "left",
            textDecoration: "underline",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {t("exitPreview")}
        </button>
      )}

      {error && (
        <p
          role="alert"
          style={{
            marginTop: "var(--space-1)",
            fontSize: "var(--text-caption)",
            color: "var(--error-600)",
            margin: "var(--space-1) 0 0",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
