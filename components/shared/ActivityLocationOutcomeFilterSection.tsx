"use client";

import { useTranslations } from "next-intl";
import type { LocationOutcome } from "@/lib/activity/activity-location-schema";
import {
  ACTIVITY_LOCATION_FILTER_PRESETS,
  LOCATION_OUTCOME_VALUES,
  toggleLocationOutcome,
} from "@/lib/activity/activity-filter-location-outcomes";

export interface ActivityLocationOutcomeFilterSectionProps {
  selected: LocationOutcome[];
  onChange: (outcomes: LocationOutcome[]) => void;
  outcomeLabel: (outcome: LocationOutcome) => string;
}

const PRESET_KEYS = [
  { key: "all" as const, preset: ACTIVITY_LOCATION_FILTER_PRESETS.all },
  { key: "onMap" as const, preset: ACTIVITY_LOCATION_FILTER_PRESETS.onMap },
  { key: "gpsFailed" as const, preset: ACTIVITY_LOCATION_FILTER_PRESETS.gpsFailed },
  { key: "notCaptured" as const, preset: ACTIVITY_LOCATION_FILTER_PRESETS.notCaptured },
  { key: "legacy" as const, preset: ACTIVITY_LOCATION_FILTER_PRESETS.legacy },
];

export function ActivityLocationOutcomeFilterSection({
  selected,
  onChange,
  outcomeLabel,
}: ActivityLocationOutcomeFilterSectionProps) {
  const tGps = useTranslations("activityLog.gpsSection");

  const presetLabel = (key: (typeof PRESET_KEYS)[number]["key"]) => {
    if (key === "all") return tGps("filterAll");
    if (key === "onMap") return tGps("filterOnMap");
    if (key === "gpsFailed") return tGps("filterGpsFailed");
    if (key === "notCaptured") return tGps("filterNotCaptured");
    return tGps("filterLegacy");
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {PRESET_KEYS.map(({ key, preset }) => {
          const active =
            key === "all"
              ? selected.length === 0
              : preset.length === selected.length && preset.every((o) => selected.includes(o));
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key === "all" ? [] : [...preset])}
              aria-pressed={active}
              style={{
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 99,
                border: active ? "1px solid var(--primary-500)" : "1px solid var(--neutral-300)",
                background: active ? "var(--primary-50)" : "var(--neutral-0)",
                color: active ? "var(--primary-700)" : "var(--neutral-700)",
                cursor: "pointer",
              }}
            >
              {presetLabel(key)}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {LOCATION_OUTCOME_VALUES.map((outcome) => {
          const checked = selected.includes(outcome);
          return (
            <label
              key={outcome}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(toggleLocationOutcome(selected, outcome))}
              />
              <span>{outcomeLabel(outcome)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
