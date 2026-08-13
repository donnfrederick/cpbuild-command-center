"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildFieldNotesUnitRef,
  parseFieldNotesLocation,
  type FieldNotesLocationLevel,
  type FieldNotesLocationMatrix,
} from "@/lib/field-notes-location-ref";
import { isCustomSiteUnitRef } from "@/lib/custom-site-locations";
import { formatFieldNotesLocationDisplay } from "@/lib/field-notes-scope";
import { useFieldNotesLocationLabels } from "@/components/projects/useFieldNotesLocationLabels";

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--neutral-500)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const SELECT_STYLE: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid var(--neutral-250)",
  fontSize: 14,
  backgroundColor: "var(--neutral-0)",
  color: "var(--neutral-900)",
  boxSizing: "border-box",
  fontFamily: "inherit",
  outline: "none",
};

export interface FieldNotesEditLocationState {
  level: FieldNotesLocationLevel;
  building: string;
  floorLevel: string;
  unit: string;
  scopeTagIds: string[];
}

export function fieldNotesEditLocationFromRecord(
  unitRef: string | null | undefined,
  scopeTagIds: string[],
): FieldNotesEditLocationState {
  const parsed = parseFieldNotesLocation(unitRef);
  return {
    level: parsed.isCustomSite ? "unit" : parsed.level,
    building: parsed.building,
    floorLevel: parsed.floorLevel,
    unit: parsed.unit,
    scopeTagIds: [...scopeTagIds],
  };
}

/** Preserve read-only custom site refs — edit state does not encode @custom|id|name. */
export function unitRefFromEditLocation(
  state: FieldNotesEditLocationState,
  sourceUnitRef?: string | null,
): string | null {
  if (typeof sourceUnitRef === "string" && isCustomSiteUnitRef(sourceUnitRef)) {
    return sourceUnitRef;
  }
  return buildFieldNotesUnitRef({
    level: state.level,
    building: state.building,
    floorLevel: state.floorLevel,
    unit: state.unit,
  });
}

interface ScopeOption {
  id: string;
  name: string;
}

export interface FieldNotesEditLocationSectionProps {
  projectId: string;
  projectName: string;
  unitRef: string | null | undefined;
  value: FieldNotesEditLocationState;
  onChange: (next: FieldNotesEditLocationState) => void;
}

const LOCATION_LEVELS: FieldNotesLocationLevel[] = ["project", "building", "level", "unit"];

export function FieldNotesEditLocationSection({
  projectId,
  projectName,
  unitRef,
  value,
  onChange,
}: FieldNotesEditLocationSectionProps) {
  const t = useTranslations("units.fieldNotesEditLocation");
  const tUnits = useTranslations("units");
  const fieldNotesLabels = useFieldNotesLocationLabels();

  const [matrix, setMatrix] = useState<FieldNotesLocationMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([]);
  const [scopesLoading, setScopesLoading] = useState(false);

  const isCustomSite = isCustomSiteUnitRef(unitRef);

  useEffect(() => {
    if (isCustomSite) {
      setMatrixLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setMatrixLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/field-notes/location-matrix`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as FieldNotesLocationMatrix;
        if (!cancelled) setMatrix(data);
      } catch {
        /* keep empty matrix */
      } finally {
        if (!cancelled) setMatrixLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, isCustomSite]);

  useEffect(() => {
    if (value.level !== "unit" || !value.building || !value.floorLevel || !value.unit) {
      setScopeOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setScopesLoading(true);
      try {
        const params = new URLSearchParams({
          building: value.building,
          level: value.floorLevel,
          unit: value.unit,
        });
        const res = await fetch(
          `/api/projects/${projectId}/field-notes/scope-rows?${params.toString()}`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { scopes: ScopeOption[] };
        if (!cancelled) setScopeOptions(data.scopes ?? []);
      } catch {
        if (!cancelled) setScopeOptions([]);
      } finally {
        if (!cancelled) setScopesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, value.level, value.building, value.floorLevel, value.unit]);

  function setLevel(level: FieldNotesLocationLevel) {
    const next: FieldNotesEditLocationState = {
      ...value,
      level,
      scopeTagIds: level === "unit" ? value.scopeTagIds : [],
    };
    if (level === "project") {
      next.building = "";
      next.floorLevel = "";
      next.unit = "";
    } else if (level === "building") {
      next.floorLevel = "";
      next.unit = "";
    } else if (level === "level") {
      next.unit = "";
    }
    onChange(next);
  }

  function toggleScope(id: string) {
    const ids = new Set(value.scopeTagIds);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    onChange({ ...value, scopeTagIds: [...ids] });
  }

  if (isCustomSite) {
    const display = formatFieldNotesLocationDisplay(
      unitRef,
      projectName,
      tUnits("projectLevelScope"),
      fieldNotesLabels,
    );
    return (
      <div style={{ marginBottom: 14 }}>
        <span style={LABEL_STYLE}>{t("locationLabel")}</span>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--neutral-700)" }}>
          {display.headline}
          {display.detail ? ` · ${display.detail}` : ""}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
          {t("customSiteReadOnly")}
        </p>
      </div>
    );
  }

  const levelOptions = matrix?.levelsByBuilding[value.building] ?? [];
  const unitKey = `${value.building}|${value.floorLevel}`;
  const unitOptions = matrix?.unitsByBuildingLevel[unitKey] ?? [];

  const levelLabels: Record<FieldNotesLocationLevel, string> = {
    project: t("levelProject"),
    building: t("levelBuilding"),
    level: t("levelFloor"),
    unit: t("levelUnit"),
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <span style={LABEL_STYLE}>{t("locationLabel")}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {LOCATION_LEVELS.map((lvl) => {
          const selected = value.level === lvl;
          return (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevel(lvl)}
              style={{
                padding: "6px 12px",
                borderRadius: 99,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: `1.5px solid ${selected ? "var(--primary-500)" : "var(--neutral-200)"}`,
                backgroundColor: selected ? "var(--primary-500)" : "var(--neutral-0)",
                color: selected ? "var(--neutral-0)" : "var(--neutral-700)",
              }}
            >
              {levelLabels[lvl]}
            </button>
          );
        })}
      </div>

      {matrixLoading && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
          {t("loadingMatrix")}
        </p>
      )}

      {!matrixLoading && value.level !== "project" && (
        <div style={{ marginTop: 10 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--neutral-600)" }}>
            {tUnits("customSite.buildingLabel")}
            <select
              value={value.building}
              onChange={(e) =>
                onChange({
                  ...value,
                  building: e.target.value,
                  floorLevel: "",
                  unit: "",
                  scopeTagIds: [],
                })
              }
              style={SELECT_STYLE}
            >
              <option value="">{t("selectBuilding")}</option>
              {(matrix?.buildings ?? []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!matrixLoading && (value.level === "level" || value.level === "unit") && value.building && (
        <div style={{ marginTop: 10 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--neutral-600)" }}>
            {tUnits("customSite.levelLabel")}
            <select
              value={value.floorLevel}
              onChange={(e) =>
                onChange({
                  ...value,
                  floorLevel: e.target.value,
                  unit: "",
                  scopeTagIds: [],
                })
              }
              style={SELECT_STYLE}
            >
              <option value="">{t("selectLevel")}</option>
              {levelOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!matrixLoading && value.level === "unit" && value.building && value.floorLevel && (
        <div style={{ marginTop: 10 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--neutral-600)" }}>
            {tUnits("sectionUnits")}
            <select
              value={value.unit}
              onChange={(e) =>
                onChange({
                  ...value,
                  unit: e.target.value,
                  scopeTagIds: [],
                })
              }
              style={SELECT_STYLE}
            >
              <option value="">{t("selectUnit")}</option>
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {value.level === "unit" && value.building && value.floorLevel && value.unit && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
            <span style={LABEL_STYLE}>{tUnits("scopeLabel")}</span>
            <span style={{ fontSize: 11, color: "var(--neutral-400)", fontStyle: "italic" }}>
              {t("scopeOptionalHint")}
            </span>
          </div>
          {scopesLoading ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)" }}>{t("loadingScopes")}</p>
          ) : scopeOptions.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)" }}>{t("noScopesForUnit")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {scopeOptions.map((s) => {
                const checked = value.scopeTagIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleScope(s.id)}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: `1.5px solid ${checked ? "var(--primary-400)" : "var(--neutral-200)"}`,
                      backgroundColor: checked ? "var(--primary-50)" : "var(--neutral-0)",
                      fontSize: 13,
                      fontWeight: checked ? 600 : 400,
                      color: checked ? "var(--primary-700)" : "var(--neutral-700)",
                      cursor: "pointer",
                    }}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
