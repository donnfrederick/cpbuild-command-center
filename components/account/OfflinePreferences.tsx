"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw, Check, Loader2 } from "lucide-react";
import type { OfflineModule } from "@/lib/offline/modules";
import { PROJECT_BUNDLE_MODULE_IDS } from "@/lib/offline/modules";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import type { Project } from "@/lib/projects";

interface PreferencesState {
  modules: string[];
  offlineProjectIds: string[];
  syncedAt: string | null;
  projectSyncedAt: Record<string, string>;
  availableModules: OfflineModule[];
}

type SyncStatus = "idle" | "syncing" | "done" | "error";

const CATEGORY_LABELS: Record<"core", string> = {
  core: "Core",
};

export function OfflinePreferences() {
  const { isOnline } = useOfflineStatus();
  const [prefs, setPrefs] = useState<PreferencesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});
  const [syncedAts, setSyncedAts] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoadError(null);
    Promise.all([
      fetch("/api/offline/preferences").then((r) => r.ok ? r.json() as Promise<PreferencesState> : null),
      fetch("/api/projects").then((r) => r.ok ? r.json() as Promise<Project[]> : []),
    ])
      .then(([prefsData, projectsData]) => {
        if (prefsData && Array.isArray(prefsData.modules)) {
          setPrefs(prefsData);
          setSyncedAts(prefsData.projectSyncedAt ?? {});
        } else if (!prefsData) {
          setLoadError("Failed to load preferences.");
        }
        setProjects(Array.isArray(projectsData) ? projectsData : []);
      })
      .catch(() => setLoadError("Failed to load preferences."))
      .finally(() => {
        setLoading(false);
        setProjectsLoading(false);
      });
  }, []);

  const toggleModule = useCallback(
    async (moduleId: string, checked: boolean) => {
      if (!prefs) return;
      const ALWAYS = ["my-profile"];
      if (ALWAYS.includes(moduleId)) return;
      const next = checked
        ? [...prefs.modules, moduleId]
        : prefs.modules.filter((id) => id !== moduleId);
      setPrefs((p) => (p ? { ...p, modules: next } : p));
      setSaving(true);
      try {
        const res = await fetch("/api/offline/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modules: next }),
        });
        const data = await res.json();
        setPrefs((p) => (p ? { ...p, modules: data.modules } : p));
      } catch {
        setPrefs((p) => (p ? { ...p, modules: prefs.modules } : p));
      } finally {
        setSaving(false);
      }
    },
    [prefs]
  );

  const toggleProjectOffline = useCallback(async (projectId: string) => {
    if (!prefs || togglingId) return;
    setTogglingId(projectId);
    const current = new Set(prefs.offlineProjectIds);
    if (current.has(projectId)) current.delete(projectId); else current.add(projectId);
    const next = Array.from(current);
    setPrefs((p) => p ? { ...p, offlineProjectIds: next } : p);
    try {
      const res = await fetch("/api/offline/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offlineProjectIds: next }),
      });
      if (!res.ok) setPrefs((p) => p ? { ...p, offlineProjectIds: prefs.offlineProjectIds } : p);
    } catch {
      setPrefs((p) => p ? { ...p, offlineProjectIds: prefs.offlineProjectIds } : p);
    } finally {
      setTogglingId(null);
    }
  }, [prefs, togglingId]);

  const syncProject = useCallback(async (projectId: string) => {
    if (!isOnline || syncStatuses[projectId] === "syncing") return;
    setSyncStatuses((s) => ({ ...s, [projectId]: "syncing" }));
    try {
      const res = await fetch(`/api/offline/snapshot?projectIds=${projectId}`);
      if (!res.ok) throw new Error("Snapshot failed");
      const data = await res.json();
      if ("caches" in window) {
        const cache = await caches.open("offline-data-v1");
        await cache.put("/api/offline/snapshot", new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
      }
      const now = new Date().toISOString();
      setSyncedAts((prev) => ({ ...prev, [projectId]: now }));
      setSyncStatuses((s) => ({ ...s, [projectId]: "done" }));
      setTimeout(() => setSyncStatuses((s) => ({ ...s, [projectId]: "idle" })), 2500);
    } catch {
      setSyncStatuses((s) => ({ ...s, [projectId]: "error" }));
      setTimeout(() => setSyncStatuses((s) => ({ ...s, [projectId]: "idle" })), 3000);
    }
  }, [isOnline, syncStatuses]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "24px 0", color: "var(--muted-foreground)", fontSize: 13 }}>
        <Loader2 size={14} className="animate-spin" />
        Loading offline settings…
      </div>
    );
  }

  if (loadError) {
    return <div style={{ padding: "12px 0", color: "var(--error-600)", fontSize: 13 }}>{loadError}</div>;
  }

  if (!prefs) return null;

  const availableModules = prefs.availableModules ?? [];
  const selectedModuleIds = prefs.modules ?? [];
  const offlineProjectSet = new Set(prefs.offlineProjectIds ?? []);

  // Only show core modules as checkboxes
  const coreModules = availableModules.filter((m) => m.category === "core");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <WifiOff size={14} style={{ color: "var(--muted-foreground)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Offline Data</span>
        {saving && <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>saving…</span>}
      </div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5, margin: "-12px 0 0" }}>
        Enable offline mode per project to access it without signal. Core data (profile, team directory) is always cached.
      </p>

      {!isOnline && (
        <div style={{ padding: "8px 12px", borderRadius: 4, background: "oklch(0.987 0.022 80)", border: "1px solid oklch(0.935 0.100 79)", fontSize: 12, color: "oklch(0.526 0.127 57)" }}>
          You&apos;re offline — changes will save when you reconnect.
        </div>
      )}

      {/* Core modules — always shown as checkboxes */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.704 0.026 261)", marginBottom: 8 }}>
          {CATEGORY_LABELS.core}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {coreModules.map((mod) => {
            const isAlways = mod.id === "my-profile";
            const isEnabled = selectedModuleIds.includes(mod.id) || isAlways;
            return (
              <label key={mod.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", cursor: mod.available && !isAlways ? "pointer" : "default", opacity: mod.available ? 1 : 0.5 }}>
                <div style={{ paddingTop: 1, flexShrink: 0 }}>
                  <input type="checkbox" checked={isEnabled} disabled={!mod.available || isAlways} onChange={(e) => toggleModule(mod.id, e.target.checked)}
                    style={{ accentColor: "var(--primary)", width: 14, height: 14, cursor: "inherit" }}
                    aria-label={`Enable ${mod.label} for offline use`} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{mod.label}</span>
                    {isAlways && <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "1px 5px", borderRadius: 99, background: "oklch(0.974 0.016 263)", color: "var(--primary)" }}>Always on</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{mod.description}</span>
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", flexShrink: 0 }}>{mod.estimatedSize}</span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Per-project offline toggles */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.704 0.026 261)", marginBottom: 8 }}>
          Project Tools
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.4, margin: "0 0 10px" }}>
          Enable a project to cache its units, issues, and observations as a bundle.
        </p>

        {projectsLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-foreground)", padding: "8px 0" }}>
            <Loader2 size={12} className="animate-spin" /> Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>No projects found.</p>
        ) : offlineProjectSet.size === 0 && !projectsLoading ? (
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic", marginBottom: 10 }}>
            No projects enabled — tap the wifi icon on a project to enable offline access.
          </p>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {projects.map((project) => {
            const isEnabled = offlineProjectSet.has(project.id);
            const syncStatus = syncStatuses[project.id] ?? "idle";
            const lastSynced = syncedAts[project.id];
            return (
              <div key={project.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 4, border: "1px solid var(--border)", background: isEnabled ? "oklch(0.974 0.016 263)" : "var(--card)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.projectName}</p>
                  {isEnabled && lastSynced ? (
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--muted-foreground)" }}>
                      Synced {new Date(lastSynced).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  ) : isEnabled ? (
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--muted-foreground)" }}>Not yet synced — tap sync to cache</p>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {isEnabled && (
                    <button
                      type="button"
                      aria-label="Sync this project now"
                      onClick={() => syncProject(project.id)}
                      disabled={!isOnline || syncStatus === "syncing"}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 5, border: "1px solid var(--border)", background: syncStatus === "done" ? "oklch(0.527 0.166 150)" : "var(--card)", cursor: !isOnline ? "not-allowed" : "pointer", opacity: !isOnline ? 0.4 : 1 }}
                    >
                      {syncStatus === "syncing" ? <Loader2 size={12} className="animate-spin" style={{ color: "var(--primary)" }} />
                        : syncStatus === "done" ? <Check size={12} style={{ color: "#fff" }} />
                        : <RefreshCw size={12} style={{ color: "var(--muted-foreground)" }} />}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={isEnabled ? "Disable offline for this project" : "Enable offline for this project"}
                    aria-pressed={isEnabled}
                    onClick={() => toggleProjectOffline(project.id)}
                    disabled={togglingId === project.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 5, border: `1px solid ${isEnabled ? "var(--primary)" : "var(--border)"}`, background: isEnabled ? "var(--primary)" : "var(--card)", cursor: "pointer" }}
                  >
                    {isEnabled ? <Wifi size={13} style={{ color: "#fff" }} /> : <WifiOff size={13} style={{ color: "var(--muted-foreground)" }} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {/* Note about what gets cached */}
        {offlineProjectSet.size > 0 && (
          <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8 }}>
            Caches: {PROJECT_BUNDLE_MODULE_IDS.join(", ")} per project.
          </p>
        )}
      </div>
    </div>
  );
}
