"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TourStep {
  order: number;
  pageUrl: string;
  elementSelector: string;
  title: string;
  description: string;
  voiceText: string;
}

interface TourBuilderProps {
  feedbackId: string;
  onSaved?: () => void;
}

function emptyStep(order: number): TourStep {
  return {
    order,
    pageUrl: "",
    elementSelector: "",
    title: "",
    description: "",
    voiceText: "",
  };
}

function StepEditor({
  step,
  index,
  total,
  onChange,
  onRemove,
  onPreview,
}: {
  step: TourStep;
  index: number;
  total: number;
  onChange: (index: number, updated: TourStep) => void;
  onRemove: (index: number) => void;
  onPreview: (step: TourStep) => void;
}) {
  const t = useTranslations("tour");

  function update(field: keyof TourStep, value: string | number) {
    onChange(index, { ...step, [field]: value });
  }

  const inputStyle = {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid var(--neutral-300)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    color: "var(--neutral-900)",
    backgroundColor: "var(--neutral-0)",
    outline: "none",
  } as const;

  const labelStyle = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--neutral-600)",
    marginBottom: 3,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  } as const;

  return (
    <div
      style={{
        border: "1px solid var(--neutral-300)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        backgroundColor: "var(--neutral-0)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      {/* Step header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GripVertical size={14} style={{ color: "var(--neutral-400)" }} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--primary-600)",
              backgroundColor: "var(--primary-50)",
              padding: "2px 8px",
              borderRadius: 10,
            }}
          >
            Step {index + 1} / {total}
          </span>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => onPreview(step)}
            title={t("preview")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "transparent",
              color: "var(--neutral-600)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Eye size={12} /> {t("preview")}
          </button>
          {total > 1 && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              title={t("removeStep")}
              aria-label={t("removeStep")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                border: "none",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "transparent",
                color: "var(--error-600)",
                cursor: "pointer",
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Page URL */}
        <div>
          <label style={labelStyle}>{t("stepPageUrl")}</label>
          <input
            type="text"
            value={step.pageUrl}
            onChange={(e) => update("pageUrl", e.target.value)}
            placeholder={t("stepPageUrlPlaceholder")}
            style={inputStyle}
          />
        </div>

        {/* Element selector */}
        <div>
          <label style={labelStyle}>{t("stepSelector")}</label>
          <input
            type="text"
            value={step.elementSelector}
            onChange={(e) => update("elementSelector", e.target.value)}
            placeholder={t("stepSelectorPlaceholder")}
            style={inputStyle}
          />
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--neutral-500)" }}>
            {t("stepSelectorHint")}
          </p>
        </div>

        {/* Title */}
        <div>
          <label style={labelStyle}>{t("stepTitle")}</label>
          <input
            type="text"
            value={step.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="e.g. Upload the corrected file"
            style={inputStyle}
          />
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>{t("stepDescription")}</label>
          <textarea
            value={step.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
            placeholder="e.g. Click the Upload button to replace the existing file with the corrected version."
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        {/* Voice text */}
        <div>
          <label style={labelStyle}>{t("stepVoiceText")}</label>
          <textarea
            value={step.voiceText}
            onChange={(e) => update("voiceText", e.target.value)}
            rows={2}
            placeholder="e.g. Here is the upload button. Click it to replace the file."
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--neutral-500)" }}>
            {t("stepVoiceTextHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TourBuilder({ feedbackId, onSaved }: TourBuilderProps) {
  const t = useTranslations("tour");

  const [steps, setSteps] = useState<TourStep[]>([emptyStep(0)]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing tour on mount
  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch(`/api/feedback/${feedbackId}/tour`);
      if (res.ok) {
        const data = await res.json() as { steps: TourStep[] };
        if (Array.isArray(data.steps) && data.steps.length > 0) {
          const sorted = [...data.steps].sort((a, b) => a.order - b.order);
          setSteps(sorted);
        }
      }
    } catch {
      // No existing tour — start fresh
    } finally {
      setLoading(false);
    }
  }, [feedbackId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  function addStep() {
    setSteps((prev) => [...prev, emptyStep(prev.length)]);
  }

  function removeStep(index: number) {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, order: i }))
    );
  }

  function updateStep(index: number, updated: TourStep) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...updated, order: i } : s))
    );
  }

  function previewStep(step: TourStep) {
    // Store a single-step "tour" in sessionStorage and navigate to that page
    sessionStorage.setItem(
      "activeTour",
      JSON.stringify({
        feedbackId,
        steps: [{ ...step, order: 0 }],
        currentIndex: 0,
      })
    );
    window.open(step.pageUrl, "_blank");
  }

  async function saveTour() {
    const valid = steps.every((s) => s.pageUrl && s.title && s.description);
    if (!valid) {
      toast.error("Each step needs a page URL, title, and description.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/feedback/${feedbackId}/tour`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("saved"));
      onSaved?.();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "var(--space-6)",
        }}
      >
        <Loader2 size={18} style={{ color: "var(--neutral-400)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--neutral-200)",
        paddingTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--neutral-700)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {t("builderTitle")}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
          {t("builderSubtitle")}
        </p>
      </div>

      {steps.map((step, idx) => (
        <StepEditor
          key={idx}
          step={step}
          index={idx}
          total={steps.length}
          onChange={updateStep}
          onRemove={removeStep}
          onPreview={previewStep}
        />
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addStep}
          style={{ display: "flex", alignItems: "center", gap: 5 }}
        >
          <Plus size={13} />
          {t("addStep")}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={saveTour}
          disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 5 }}
        >
          {saving && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
          {saving ? t("saving") : t("saveTour")}
        </Button>
      </div>
    </div>
  );
}
