"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SeedTestDataForm } from "@/components/projects/SeedTestDataForm";

interface TestProjectOption {
  id: string;
  projectName: string;
  isTestProject: boolean;
}

export function TestDataSeedPanel() {
  const t = useTranslations("testDataSeed");
  const [projects, setProjects] = useState<TestProjectOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/projects");
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) {
          const testOnly = (data as TestProjectOption[]).filter((p) => p.isTestProject);
          setProjects(testOnly);
          if (testOnly.length > 0) {
            setSelectedId(testOnly[0]!.id);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = projects.filter((p) =>
    p.projectName.toLowerCase().includes(query.trim().toLowerCase())
  );

  const selected = projects.find((p) => p.id === selectedId);

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, height: "100%", overflowY: "auto" }}>
      <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
        {t("devtoolsIntro")}
      </p>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-caption)" }}>
        {t("searchProjects")}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          style={{
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--neutral-300)",
            fontSize: "var(--text-body-sm)",
          }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-caption)" }}>
        {t("selectProject")}
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={loading || filtered.length === 0}
          style={{
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--neutral-300)",
            fontSize: "var(--text-body-sm)",
          }}
        >
          {filtered.map((p) => (
            <option key={p.id} value={p.id}>
              {p.projectName}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>{t("loadingProjects")}</span>
      ) : filtered.length === 0 ? (
        <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>{t("noTestProjects")}</span>
      ) : selected ? (
        <SeedTestDataForm projectId={selected.id} />
      ) : null}
    </div>
  );
}
