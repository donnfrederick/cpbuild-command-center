"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

const LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
] as const;

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Language"
    >
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => router.replace(pathname, { locale: code })}
          aria-pressed={locale === code}
          aria-label={`Switch to ${label}`}
          style={{
            padding: "var(--space-1) var(--space-2)",
            borderRadius: "var(--radius-sm)",
            border: "none",
            backgroundColor: locale === code ? "var(--color-accent-subtle)" : "transparent",
            color: locale === code ? "var(--color-accent)" : "var(--color-text-secondary)",
            fontSize: "var(--text-caption)",
            fontWeight: 700,
            letterSpacing: "var(--tracking-ui)",
            cursor: "pointer",
          }}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
