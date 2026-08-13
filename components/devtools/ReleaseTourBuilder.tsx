"use client";

/**
 * ReleaseTourBuilder — DevTools tab for authoring release tours.
 *
 * Allows admins to:
 * 1. Select a release from the DevTools release list.
 * 2. Auto-generate tour steps from that release's CHANGELOG entries.
 * 3. Manually add / edit / reorder / remove steps.
 * 4. Save via PUT /api/releases/[id]/tour.
 *
 * Reuses the StepEditor pattern from TourBuilder (feedback tours).
 */

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Loader2, Wand2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TourStep } from "@/components/tour/TourPlayer";
import { resolveLocalized } from "@/components/tour/TourPlayer";

interface ReleaseChange {
  id: string;
  description: string;
  route?: string;
  category?: string;
}

interface ReleaseOption {
  id: string;
  title: string;
  mergedAt: string;
  changes: ReleaseChange[];
  hasTour: boolean;
}

function emptyStep(order: number): TourStep {
  return { order, pageUrl: "", elementSelector: "", title: "", description: "", voiceText: "" };
}

// ─── StepEditor (inline — same pattern as TourBuilder but without extra deps) ──

function StepEditor({
  step,
  index,
  onChange,
  onRemove,
  onPreview,
}: {
  step: TourStep;
  index: number;
  onChange: (i: number, s: TourStep) => void;
  onRemove: (i: number) => void;
  onPreview: (s: TourStep) => void;
}) {
  const t = useTranslations("tour");

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid var(--neutral-300)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    color: "var(--neutral-900)",
    backgroundColor: "var(--neutral-0)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--neutral-600)",
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  function update(field: keyof TourStep, value: string | number) {
    onChange(index, { ...step, [field]: value });
  }

  return (
    <div
      style={{
        border: "1px solid var(--neutral-300)",
        borderRadius: "var(--radius-md)",
        padding: 12,
        background: "var(--neutral-50)",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--neutral-700)" }}>
          Step {index + 1}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            title={t("preview")}
            aria-label={t("preview")}
            onClick={() => onPreview(step)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary-600)", padding: 2 }}
          >
            <Eye size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            title={t("removeStep")}
            aria-label={t("removeStep")}
            onClick={() => onRemove(index)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error-600)", padding: 2 }}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>{t("stepPageUrl")}</label>
          <input
            style={inputStyle}
            value={step.pageUrl}
            onChange={(e) => update("pageUrl", e.target.value)}
            placeholder={t("stepPageUrlPlaceholder")}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("stepSelector")}</label>
          <input
            style={inputStyle}
            value={step.elementSelector}
            onChange={(e) => update("elementSelector", e.target.value)}
            placeholder={t("stepSelectorPlaceholder")}
          />
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>{t("stepTitle")}</label>
        <input
          style={inputStyle}
          value={resolveLocalized(step.title)}
          onChange={(e) => update("title", e.target.value)}
          placeholder="What did we ship?"
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>{t("stepDescription")}</label>
        <textarea
          style={{ ...inputStyle, resize: "vertical", minHeight: 56 }}
          value={resolveLocalized(step.description)}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Describe this change in 1–2 sentences."
        />
      </div>

      <div>
        <label style={labelStyle}>{t("stepVoiceText")}</label>
        <input
          style={inputStyle}
          value={resolveLocalized(step.voiceText)}
          onChange={(e) => update("voiceText", e.target.value)}
          placeholder={t("stepVoiceTextHint")}
        />
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function ReleaseTourBuilder() {
  const t = useTranslations("tour");

  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch available releases (reuse devtools releases endpoint for admin)
  useEffect(() => {
    async function fetchReleases() {
      setLoadingReleases(true);
      try {
        const env = process.env.NEXT_PUBLIC_GIT_SHA === "dev" ? "development" : "production";
        const res = await fetch(`/api/devtools/releases?environment=${env}`);
        if (!res.ok) return;
        const data = await res.json() as { releases: Array<{ id: string; title: string; mergedAt: string; changes: ReleaseChange[]; tour?: { id: string } }> };
        setReleases(
          data.releases.map((r) => ({
            id: r.id,
            title: r.title,
            mergedAt: r.mergedAt,
            changes: Array.isArray(r.changes) ? (r.changes as ReleaseChange[]) : [],
            hasTour: !!r.tour,
          }))
        );
        // Default to the most recent release
        if (data.releases.length > 0) {
          setSelectedId(data.releases[0].id);
        }
      } catch {
        // swallow — DevTools errors are non-critical
      } finally {
        setLoadingReleases(false);
      }
    }
    void fetchReleases();
  }, []);

  // Load existing tour steps when selected release changes
  useEffect(() => {
    if (!selectedId) { setSteps([]); return; }
    async function loadTour() {
      try {
        const res = await fetch(`/api/releases/${selectedId}/tour`);
        if (res.status === 404) { setSteps([]); return; }
        if (!res.ok) return;
        const tour = await res.json() as { steps: TourStep[] };
        setSteps(tour.steps ?? []);
      } catch {
        setSteps([]);
      }
    }
    void loadTour();
  }, [selectedId]);

  const selectedRelease = releases.find((r) => r.id === selectedId);

  const handleAutoGenerate = useCallback(async () => {
    if (!selectedRelease) return;
    setIsAutoGenerating(true);
    try {
      // Call the automation endpoint to have Gemini generate steps for this release.
      // We pass releaseId=selectedId so the endpoint can look up the full release from DB.
      // Credentials: "include" uses the existing session cookie (admin session required).
      const res = await fetch("/api/automation/release-tour", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseId: selectedId,
          prNumber: null,
          title: selectedRelease.title,
          branch: null,
          environment: "development",
          changes: selectedRelease.changes,
        }),
      });

      if (res.status === 401) {
        toast.error("Not authorized — admin session required.");
        return;
      }

      if (res.status === 503) {
        toast.error("GEMINI_API_KEY is not configured — enable it to use AI generation.");
        return;
      }

      if (res.status === 200) {
        // Tour was skipped (already exists) — reload from the API so the editor shows current steps
        const tourRes = await fetch(`/api/releases/${selectedId}/tour`);
        if (tourRes.ok) {
          const tour = (await tourRes.json()) as { steps: TourStep[] };
          setSteps(tour.steps ?? []);
          toast.success("Tour already existed — loaded current steps.");
        }
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // 201 — tour created; reload steps from the saved tour
      const data = (await res.json()) as { tour: { steps: TourStep[] } };
      setSteps(data.tour?.steps ?? []);
      setReleases((prev) =>
        prev.map((r) => (r.id === selectedId ? { ...r, hasTour: true } : r))
      );
      toast.success("AI tour generated — review steps before saving.");
    } catch (err) {
      toast.error(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAutoGenerating(false);
    }
  }, [selectedRelease, selectedId]);

  function handleChange(i: number, updated: TourStep) {
    setSteps((s) => s.map((step, idx) => (idx === i ? updated : step)));
  }

  function handleRemove(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i).map((step, idx) => ({ ...step, order: idx })));
  }

  function handleAdd() {
    setSteps((s) => [...s, emptyStep(s.length)]);
  }

  function handlePreview(step: TourStep) {
    if (!step.pageUrl) { toast.error("Set a page URL to preview."); return; }
    sessionStorage.setItem("activeTour", JSON.stringify({
      releaseId: selectedId,
      steps: [{ ...step, order: 0 }],
      currentIndex: 0,
    }));
    window.open(step.pageUrl, "_blank");
    // The new tab inherits a copy of sessionStorage at open time.
    // Remove activeTour from THIS tab immediately so TourPlayer doesn't
    // accidentally restore a preview tour here if the pathname later changes
    // (e.g. macOS swipe-back from DevTools tab bar scroll triggers navigation).
    sessionStorage.removeItem("activeTour");
  }

  const handleDeleteTour = useCallback(async () => {
    if (!selectedId) return;
    const confirmed = window.confirm(
      "Delete this tour? The release will remain in the checklist but the guided tour will be removed from the Tour Picker."
    );
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/releases/${selectedId}/tour`, { method: "DELETE" });
      if (res.status === 401) { toast.error("Not authorized."); return; }
      if (res.status === 403) { toast.error("Admin access required."); return; }
      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`);
      }
      setSteps([]);
      setReleases((prev) => prev.map((r) => r.id === selectedId ? { ...r, hasTour: false } : r));
      toast.success("Tour deleted.");
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedId]);

  const handleSave = useCallback(async () => {
    if (!selectedId || steps.length === 0) {
      toast.error("Add at least one step before saving.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/releases/${selectedId}/tour`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(t("saved"));
      // Refresh releases list to update hasTour state
      setReleases((prev) => prev.map((r) => r.id === selectedId ? { ...r, hasTour: true } : r));
    } catch (err) {
      toast.error(`${t("saveError")}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }, [selectedId, steps, t]);

  return (
    <div style={{ padding: 16, height: "100%", overflowY: "auto" }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--neutral-900)" }}>
        {t("builderReleaseTitle")}
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--neutral-500)" }}>
        {t("builderReleaseSubtitle")}
      </p>

      {/* Release selector */}
      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="release-select"
          style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--neutral-600)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}
        >
          {t("selectRelease")}
        </label>
        {loadingReleases ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--neutral-500)", fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> Loading releases…
          </div>
        ) : releases.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--neutral-500)", margin: 0 }}>{t("noReleases")}</p>
        ) : (
          <div style={{ position: "relative" }}>
            <select
              id="release-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 32px 7px 10px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                appearance: "none",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-900)",
                cursor: "pointer",
              }}
            >
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.hasTour ? "✓ " : ""}{r.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--neutral-500)" }}
            />
          </div>
        )}
      </div>

      {/* Auto-generate button */}
      {selectedRelease && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoGenerate}
            disabled={isAutoGenerating}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            {isAutoGenerating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {isAutoGenerating ? t("autoGenerating") : t("autoGenerate")}
          </Button>
          <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>{t("autoGenerateHint")}</span>
        </div>
      )}

      {/* Step list */}
      {steps.map((step, i) => (
        <StepEditor
          key={i}
          step={step}
          index={i}
          onChange={handleChange}
          onRemove={handleRemove}
          onPreview={handlePreview}
        />
      ))}

      {steps.length === 0 && selectedId && (
        <p style={{ fontSize: 13, color: "var(--neutral-400)", textAlign: "center", margin: "24px 0" }}>
          {t("noSteps")}
        </p>
      )}

      {/* Add step / Save / Delete */}
      {selectedId && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="outline" size="sm" onClick={handleAdd} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Plus size={13} /> {t("addStep")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || steps.length === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : null}
            {isSaving ? t("saving") : t("saveTour")}
          </Button>
          {selectedRelease?.hasTour && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteTour}
              disabled={isDeleting}
              aria-label="Delete this release tour"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--error-600)", borderColor: "var(--error-300)", marginLeft: "auto" }}
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {isDeleting ? "Deleting…" : "Delete tour"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
