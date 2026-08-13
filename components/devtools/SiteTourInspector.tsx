"use client";

/**
 * SiteTourInspector — DevTools tab for inspecting and live-editing the site tour.
 *
 * Features:
 * - View all site tour steps with EN + ES content at a glance
 * - Toggle edit mode to change any step's title, description, or voice text
 * - "Auto-translate EN→ES" calls the MyMemory free translation API (no key needed)
 * - Edits are saved to localStorage automatically and survive page reloads
 * - "▶ Play from here" launches the tour with edited steps injected directly —
 *   bypasses the hardcoded /api/site-tour response so changes play immediately
 * - "Reset to defaults" wipes localStorage edits and restores hardcoded content
 * - First-visit seen-flag controls for testing the auto-launch behaviour
 *
 * Editing does NOT modify lib/site-tour-steps.ts or any server file.
 * To make edits permanent, copy the edited content into the source file.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Play, RotateCcw, ChevronDown, ChevronRight, Globe, Zap, MapPin, Pencil, Check, X, Loader2, RefreshCw } from "lucide-react";
import { SITE_TOUR_STEPS } from "@/lib/site-tour-steps";
import type { SiteTourStep } from "@/lib/site-tour-steps";

const TOUR_SEEN_KEY = "cc-site-tour-v2-seen";
const EDITS_KEY = "cc-tour-step-edits";

// ── Types ─────────────────────────────────────────────────────────────────────

type StepTextFields = {
  titleEn: string;
  titleEs: string;
  descEn: string;
  descEs: string;
  voiceEn: string;
  voiceEs: string;
};

type EditsMap = Record<number, StepTextFields>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stepToFields(step: SiteTourStep): StepTextFields {
  return {
    titleEn: step.title.en,
    titleEs: step.title.es,
    descEn: step.description.en,
    descEs: step.description.es,
    voiceEn: step.voiceText.en,
    voiceEs: step.voiceText.es,
  };
}

function loadEdits(): EditsMap {
  try {
    const raw = localStorage.getItem(EDITS_KEY);
    return raw ? (JSON.parse(raw) as EditsMap) : {};
  } catch {
    return {};
  }
}

function saveEdits(edits: EditsMap) {
  localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
}

function getAutoInteractLabel(step: SiteTourStep): string | null {
  const ai = step.autoInteract;
  if (!ai) return null;
  if (ai.type === "click") return "click";
  if (ai.type === "type") return `type: "${ai.text ?? ""}"`;
  if (ai.type === "dispatch") return ai.eventName ?? "dispatch";
  return ai.type;
}

/** Call MyMemory free translation API for a single string (en → es). */
async function translateEnToEs(text: string): Promise<string> {
  if (!text.trim()) return "";
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|es`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = await res.json() as { responseData?: { translatedText?: string }; responseStatus?: number };
  const translated = data.responseData?.translatedText;
  if (!translated || data.responseStatus === 403) throw new Error("MyMemory quota exceeded");
  return translated;
}

// ── FieldRow ──────────────────────────────────────────────────────────────────

function FieldRow({
  id,
  label,
  lang,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  lang: "en" | "es";
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label
        htmlFor={readOnly ? undefined : id}
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: lang === "en" ? "#1d4ed8" : "#059669",
        }}
      >
        {label}
      </label>
      {readOnly ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-700)", lineHeight: 1.5 }}>{value || <em style={{ color: "var(--neutral-400)" }}>—</em>}</p>
      ) : (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          style={{
            width: "100%",
            padding: "5px 8px",
            fontSize: 12,
            lineHeight: 1.5,
            borderRadius: 5,
            border: "1px solid var(--neutral-300)",
            backgroundColor: "var(--neutral-0)",
            color: "var(--neutral-900)",
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

// ── MetaChip ─────────────────────────────────────────────────────────────────

function MetaChip({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 99,
        backgroundColor: highlight ? "#ede9fe" : "var(--neutral-100)",
        color: highlight ? "#6d28d9" : "var(--neutral-600)",
        fontSize: 11,
        fontFamily: "monospace",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: "100%",
      }}
    >
      {icon}
      <span style={{ color: "var(--neutral-400)", marginRight: 2 }}>{label}:</span>
      {value}
    </span>
  );
}

// ── StepCard ─────────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  editMode,
  fields,
  hasEdits,
  onFieldChange,
  onTranslate,
  onResetStep,
  onPlay,
}: {
  step: SiteTourStep;
  index: number;
  editMode: boolean;
  fields: StepTextFields;
  hasEdits: boolean;
  onFieldChange: (key: keyof StepTextFields, value: string) => void;
  onTranslate: () => Promise<void>;
  onResetStep: () => void;
  onPlay: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const autoInteractLabel = getAutoInteractLabel(step);

  const handleTranslate = useCallback(async () => {
    setTranslating(true);
    setTranslateError(null);
    try {
      await onTranslate();
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  }, [onTranslate]);

  return (
    <div
      style={{
        border: `1px solid ${hasEdits ? "#a78bfa" : "var(--neutral-200)"}`,
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        backgroundColor: "var(--neutral-0)",
      }}
    >
      {/* ── Card header ── */}
      <div
        role="button"
        tabIndex={0}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          cursor: "pointer",
          userSelect: "none",
          backgroundColor: hasEdits ? "#faf5ff" : undefined,
        }}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
      >
        {/* Step badge */}
        <span
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 99,
            backgroundColor: hasEdits ? "#5B21B6" : "#7C3AED",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {step.order}
        </span>

        {/* Title — show edited EN if available */}
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--neutral-900)",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {fields.titleEn}
          {hasEdits && (
            <span style={{ marginLeft: 6, fontSize: 10, color: "#7C3AED", fontWeight: 500 }}>edited</span>
          )}
        </span>

        {/* Page URL chip */}
        <span
          style={{
            flexShrink: 0,
            padding: "2px 7px",
            borderRadius: 99,
            backgroundColor: "var(--neutral-100)",
            color: "var(--neutral-600)",
            fontSize: 11,
            fontWeight: 500,
            fontFamily: "monospace",
          }}
        >
          {step.pageUrl.replace("/projects/{{PROJECT_ID}}", "/projects/…")}
        </span>

        {/* Play button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlay(index); }}
          aria-label={`Play tour from step ${step.order}`}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            borderRadius: 6,
            border: "none",
            backgroundColor: "#7C3AED",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Play size={10} fill="#fff" />
          Play
        </button>

        <span style={{ flexShrink: 0, color: "var(--neutral-400)" }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--neutral-100)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            backgroundColor: "var(--neutral-50)",
          }}
        >
          {/* Text fields grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Left: English */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FieldRow id={`step-${step.order}-title-en`} label="Title (EN)" lang="en" value={fields.titleEn} readOnly={!editMode} onChange={(v) => onFieldChange("titleEn", v)} />
              <FieldRow id={`step-${step.order}-desc-en`} label="Description (EN)" lang="en" value={fields.descEn} readOnly={!editMode} onChange={(v) => onFieldChange("descEn", v)} />
              <FieldRow id={`step-${step.order}-voice-en`} label="Voice text (EN)" lang="en" value={fields.voiceEn} readOnly={!editMode} onChange={(v) => onFieldChange("voiceEn", v)} />
            </div>

            {/* Right: Spanish */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FieldRow id={`step-${step.order}-title-es`} label="Title (ES)" lang="es" value={fields.titleEs} readOnly={!editMode} onChange={(v) => onFieldChange("titleEs", v)} />
              <FieldRow id={`step-${step.order}-desc-es`} label="Description (ES)" lang="es" value={fields.descEs} readOnly={!editMode} onChange={(v) => onFieldChange("descEs", v)} />
              <FieldRow id={`step-${step.order}-voice-es`} label="Voice text (ES)" lang="es" value={fields.voiceEs} readOnly={!editMode} onChange={(v) => onFieldChange("voiceEs", v)} />
            </div>
          </div>

          {/* Action row — only in edit mode */}
          {editMode && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleTranslate}
                disabled={translating}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "1px solid #6d28d9",
                  backgroundColor: "#ede9fe",
                  color: "#5b21b6",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: translating ? "wait" : "pointer",
                  opacity: translating ? 0.7 : 1,
                }}
              >
                {translating ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Globe size={12} />}
                {translating ? "Translating…" : "Auto-translate EN → ES"}
              </button>

              {hasEdits && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onResetStep(); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--neutral-300)",
                    backgroundColor: "var(--neutral-0)",
                    color: "var(--neutral-600)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <RotateCcw size={12} />
                  Reset this step
                </button>
              )}

              {translateError && (
                <span style={{ fontSize: 11, color: "#dc2626" }}>{translateError}</span>
              )}
            </div>
          )}

          {/* Metadata chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <MetaChip icon={<MapPin size={10} />} label="selector" value={step.elementSelector || "—"} />
            {autoInteractLabel && (
              <MetaChip icon={<Zap size={10} />} label="autoInteract" value={autoInteractLabel} highlight />
            )}
            {step.autoInteract?.cleanupOnLeave && (
              <MetaChip icon={<RotateCcw size={10} />} label="cleanup" value={step.autoInteract.cleanupOnLeave} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SiteTourInspector({ onClose }: { onClose?: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState<EditsMap>(loadEdits);
  const [seenFlagSet, setSeenFlagSet] = useState(() => !!localStorage.getItem(TOUR_SEEN_KEY));

  // Persist edits whenever they change
  useEffect(() => {
    if (Object.keys(edits).length > 0) {
      saveEdits(edits);
    }
  }, [edits]);

  /** Get current fields for a step (edited overrides or hardcoded defaults). */
  function getFields(step: SiteTourStep): StepTextFields {
    return edits[step.order] ?? stepToFields(step);
  }

  function handleFieldChange(stepOrder: number, key: keyof StepTextFields, value: string) {
    setEdits((prev) => ({
      ...prev,
      [stepOrder]: {
        ...(prev[stepOrder] ?? stepToFields(SITE_TOUR_STEPS.find((s) => s.order === stepOrder) ?? SITE_TOUR_STEPS[0])),
        [key]: value,
      },
    }));
  }

  /** Auto-translate the three EN fields for one step via MyMemory API. */
  const handleTranslate = useCallback(async (stepOrder: number) => {
    const step = SITE_TOUR_STEPS.find((s) => s.order === stepOrder);
    if (!step) return;
    const current = edits[stepOrder] ?? stepToFields(step);

    const [titleEs, descEs, voiceEs] = await Promise.all([
      translateEnToEs(current.titleEn),
      translateEnToEs(current.descEn),
      translateEnToEs(current.voiceEn),
    ]);

    setEdits((prev) => ({
      ...prev,
      [stepOrder]: { ...current, titleEs, descEs, voiceEs },
    }));
  }, [edits]);

  function handleResetStep(stepOrder: number) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[stepOrder];
      const remaining = Object.keys(next).length;
      if (remaining === 0) {
        localStorage.removeItem(EDITS_KEY);
      } else {
        saveEdits(next);
      }
      return next;
    });
  }

  function handleResetAll() {
    setEdits({});
    localStorage.removeItem(EDITS_KEY);
  }

  function handlePlay(index: number) {
    // Close the DevTools panel first so the tour overlay renders unobstructed
    // and the panel doesn't interfere with TourPlayer's page navigation.
    onClose?.();
    // TourPlayer reads localStorage edits and merges them automatically on every
    // site tour launch, so we just dispatch a normal request with the start index.
    window.dispatchEvent(
      new CustomEvent("tour:request", {
        detail: { siteTour: true, autoPlay: false, startIndex: index },
      })
    );
  }

  function handleResetSeenFlag() {
    localStorage.removeItem(TOUR_SEEN_KEY);
    setSeenFlagSet(false);
  }

  function handleMarkSeen() {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
    setSeenFlagSet(true);
  }

  const editedStepCount = Object.keys(edits).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div
        style={{
          flexShrink: 0,
          padding: "12px 20px",
          borderBottom: "1px solid var(--neutral-200)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Title + step count */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--neutral-900)" }}>
            Site Tour Inspector
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
            {SITE_TOUR_STEPS.length} steps
            {editedStepCount > 0 && (
              <span style={{ color: "#7C3AED", fontWeight: 600 }}>
                {" "}· {editedStepCount} edited
              </span>
            )}
          </p>
        </div>

        {/* Edit mode toggle */}
        <button
          type="button"
          aria-pressed={editMode}
          onClick={() => setEditMode((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 12px",
            borderRadius: 6,
            border: `1px solid ${editMode ? "#7C3AED" : "var(--neutral-300)"}`,
            backgroundColor: editMode ? "#7C3AED" : "var(--neutral-0)",
            color: editMode ? "#fff" : "var(--neutral-700)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {editMode ? <Check size={13} /> : <Pencil size={13} />}
          {editMode ? "Editing" : "Edit steps"}
        </button>

        {/* Reset all edits */}
        {editedStepCount > 0 && (
          <button
            type="button"
            onClick={handleResetAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid #fca5a5",
              backgroundColor: "#fff1f2",
              color: "#dc2626",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} />
            Reset all edits
          </button>
        )}

        {/* First-visit flag toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 10px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: seenFlagSet ? "var(--neutral-100)" : "#fef9c3",
            border: "1px solid",
            borderColor: seenFlagSet ? "var(--neutral-200)" : "#fde047",
            fontSize: 11,
          }}
        >
          <Globe size={11} style={{ color: seenFlagSet ? "var(--neutral-400)" : "#a16207", flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: seenFlagSet ? "var(--neutral-500)" : "#92400e", whiteSpace: "nowrap" }}>
            Auto-launch: {seenFlagSet ? "off" : "on"}
          </span>
          <button
            type="button"
            onClick={seenFlagSet ? handleResetSeenFlag : handleMarkSeen}
            style={{
              padding: "1px 7px",
              borderRadius: 4,
              border: "none",
              backgroundColor: seenFlagSet ? "#7C3AED" : "var(--neutral-600)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {seenFlagSet ? "Re-enable" : "Disable"}
          </button>
        </div>
      </div>

      {/* ── Edit mode notice ── */}
      {editMode && (
        <div
          style={{
            flexShrink: 0,
            padding: "8px 20px",
            backgroundColor: "#ede9fe",
            borderBottom: "1px solid #c4b5fd",
            fontSize: 12,
            color: "#5b21b6",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Pencil size={12} />
          <span>
            <strong>Edit mode on</strong> — changes save automatically to your browser.
            Hit <strong>Auto-translate EN → ES</strong> on any step to fill Spanish from your English.
            Press <strong>▶ Play</strong> to preview with your edits.
            To make edits permanent, copy them into{" "}
            <code style={{ backgroundColor: "#c4b5fd", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>
              lib/site-tour-steps.ts
            </code>.
          </span>
          <button
            type="button"
            onClick={() => setEditMode(false)}
            aria-label="Close edit mode"
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#7C3AED" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Step list ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {SITE_TOUR_STEPS.map((step, i) => (
          <StepCard
            key={step.order}
            step={step}
            index={i}
            editMode={editMode}
            fields={getFields(step)}
            hasEdits={!!edits[step.order]}
            onFieldChange={(key, value) => handleFieldChange(step.order, key, value)}
            onTranslate={() => handleTranslate(step.order)}
            onResetStep={() => handleResetStep(step.order)}
            onPlay={handlePlay}
          />
        ))}

        {/* Footer note */}
        {!editMode && (
          <div
            style={{
              marginTop: 4,
              padding: "9px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "#ede9fe",
              border: "1px solid #ddd6fe",
              fontSize: 12,
              color: "#5b21b6",
              lineHeight: 1.5,
            }}
          >
            Click <strong>Edit steps</strong> above to change any text and auto-translate EN → ES.
            Edits are saved to your browser and used immediately when you press <strong>▶ Play</strong>.
          </div>
        )}
      </div>

      {/* CSS for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
