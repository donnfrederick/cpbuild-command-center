"use client";

import { useTranslations } from "next-intl";
import { Key, ExternalLink } from "lucide-react";

interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

interface ApiAccessSectionProps {
  apiKeys: ApiKeyInfo[];
}

const SCOPE_KEY_MAP: Record<string, string> = {
  "bi:projects": "scopeProjects",
  "bi:units": "scopeUnits",
  "bi:issues": "scopeIssues",
  "bi:observations": "scopeObservations",
  "bi:comments": "scopeComments",
  "bi:inspections": "scopeInspections",
  "bi:subscopes": "scopeSubscopes",
  "bi:media": "scopeMedia",
  "bi:feedback": "scopeFeedback",
  "bi:team": "scopeTeam",
  "bi:activity": "scopeActivity",
};

export function ApiAccessSection({ apiKeys }: ApiAccessSectionProps) {
  const t = useTranslations("apiAccess");

  const formatDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : null;

  return (
    <section
      style={{
        backgroundColor: "var(--neutral-0)",
        border: "1px solid var(--neutral-300)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "var(--space-4)",
          borderBottom: "1px solid var(--neutral-200)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
        }}
      >
        <Key style={{ color: "var(--primary-600)", width: 20, height: 20, flexShrink: 0 }} />
        <div>
          <h2
            style={{
              fontSize: "var(--text-subheading)",
              fontWeight: 600,
              color: "var(--neutral-900)",
              margin: 0,
            }}
          >
            {t("sectionTitle")}
          </h2>
          <p
            style={{
              fontSize: "var(--text-caption)",
              color: "var(--neutral-500)",
              margin: "var(--space-1) 0 0",
            }}
          >
            {t("sectionDescription")}
          </p>
        </div>
      </div>

      <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {apiKeys.map((key) => (
          <div
            key={key.id}
            style={{
              padding: "var(--space-3) var(--space-4)",
              backgroundColor: "var(--neutral-50)",
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <div style={{ marginBottom: "var(--space-2)" }}>
              <span style={{ fontWeight: 600, color: "var(--neutral-900)", fontSize: "var(--text-body)" }}>
                {key.name}
              </span>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-1) var(--space-4)", margin: 0 }}>
              <dt style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", fontWeight: 500 }}>
                {t("keyPrefix")}
              </dt>
              <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "var(--text-body-sm)", color: "var(--neutral-700)" }}>
                {key.keyPrefix}…
              </dd>

              <dt style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", fontWeight: 500 }}>
                {t("scopes")}
              </dt>
              <dd style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
                {key.scopes.map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: "2px 6px",
                      backgroundColor: "var(--primary-50)",
                      color: "var(--primary-700)",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "0.75em",
                      fontWeight: 500,
                    }}
                  >
                    {t(SCOPE_KEY_MAP[s] as Parameters<typeof t>[0]) ?? s}
                  </span>
                ))}
              </dd>

              <dt style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", fontWeight: 500 }}>
                {t("lastUsed")}
              </dt>
              <dd style={{ margin: 0, fontSize: "var(--text-body-sm)", color: "var(--neutral-700)" }}>
                {formatDate(key.lastUsedAt) ?? t("neverUsed")}
              </dd>
            </dl>
          </div>
        ))}

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <a
            href="/api/bi/v1"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              fontSize: "var(--text-body-sm)",
              color: "var(--primary-600)",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={14} />
            {t("docsLink")}
          </a>
          <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
            {t("contactAdmin")}
          </p>
        </div>
      </div>
    </section>
  );
}
