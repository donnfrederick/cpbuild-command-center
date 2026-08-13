"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useLocationBuilderTagOptions } from "@/hooks/use-location-builder-tag-options";
import { LOCATION_BUILDER_TAG_MAX_LENGTH } from "@/lib/field-notes/location-builder-tags";

const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: "var(--text-caption)",
  fontWeight: "var(--font-weight-extrabold)",
  color: "var(--color-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-section)",
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
  fontSize: "var(--text-body)",
  fontFamily: "inherit",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text-primary)",
  boxSizing: "border-box",
};

function TagChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "8px 14px",
        borderRadius: "var(--radius-pill)",
        border: "none",
        backgroundColor: active ? "var(--control-active-bg)" : "var(--control-bg)",
        color: active ? "var(--control-active-fg)" : "var(--control-fg)",
        fontSize: "var(--text-body)",
        fontWeight: "var(--font-weight-semibold)",
        cursor: "pointer",
        fontFamily: "inherit",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function TagPillSection({
  label,
  optionalSuffix,
  chips,
  value,
  onChange,
  compactTop,
}: {
  label: string;
  optionalSuffix: React.ReactNode;
  chips: string[];
  value: string;
  onChange: (next: string) => void;
  compactTop?: boolean;
}) {
  if (chips.length === 0) return null;

  const toggle = (chip: string) => {
    onChange(value === chip ? "" : chip);
  };

  return (
    <div style={{ marginTop: compactTop ? 0 : 16 }}>
      <label style={LABEL_STYLE}>
        {label}
        {optionalSuffix}
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {chips.map((chip) => (
          <TagChip
            key={chip}
            label={chip}
            active={value === chip}
            onClick={() => toggle(chip)}
          />
        ))}
      </div>
    </div>
  );
}

function AreaTagSection({
  label,
  optionalSuffix,
  definedAreas,
  value,
  onChange,
}: {
  label: string;
  optionalSuffix: React.ReactNode;
  definedAreas: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations("units");

  if (definedAreas.length > 0) {
    return (
      <TagPillSection
        label={label}
        optionalSuffix={optionalSuffix}
        chips={definedAreas}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label style={LABEL_STYLE}>
        {label}
        {optionalSuffix}
      </label>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: "var(--text-body)",
          color: "var(--color-text-disabled)",
        }}
      >
        {t("projectLevelNoProjectDefinedAreas")}
      </p>
      <label
        htmlFor="project-level-area-reference-input"
        style={{
          display: "block",
          marginTop: 12,
          fontSize: "var(--text-caption)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text-secondary)",
        }}
      >
        {t("projectLevelAreaReferenceInputLabel")}
      </label>
      <input
        id="project-level-area-reference-input"
        type="text"
        className="alom-input"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, LOCATION_BUILDER_TAG_MAX_LENGTH))}
        placeholder={t("projectLevelAreaReferencePlaceholder")}
        maxLength={LOCATION_BUILDER_TAG_MAX_LENGTH}
        style={INPUT_STYLE}
        aria-describedby="project-level-area-reference-disclaimer"
      />
      <p
        id="project-level-area-reference-disclaimer"
        style={{
          margin: "8px 0 0",
          fontSize: "var(--text-caption)",
          lineHeight: 1.45,
          color: "var(--color-text-secondary)",
        }}
      >
        {t("projectLevelAreaReferenceDisclaimer")}
      </p>
    </div>
  );
}

export function ProjectLevelBuilderTagFields({
  projectId,
  buildPhaseTag,
  areaTag,
  onChangeBuildPhaseTag,
  onChangeAreaTag,
  compactLabels = false,
}: {
  projectId: string;
  buildPhaseTag: string;
  areaTag: string;
  onChangeBuildPhaseTag: (value: string) => void;
  onChangeAreaTag: (value: string) => void;
  compactLabels?: boolean;
}) {
  const t = useTranslations("units");
  const { options, loading } = useLocationBuilderTagOptions(projectId);

  if (loading) return null;

  const optionalSuffix = (
    <span
      style={{
        fontSize: "var(--text-micro)",
        fontWeight: "var(--font-weight-normal)",
        color: "var(--color-text-disabled)",
        textTransform: "none",
        letterSpacing: 0,
        marginLeft: 6,
      }}
    >
      {t("projectLevelTagOptional")}
    </span>
  );

  const hasBuildPhases = options.buildPhases.length > 0;
  const hasDefinedAreas = options.areas.length > 0;

  if (!hasBuildPhases && !hasDefinedAreas) {
    return (
      <AreaTagSection
        label={t("projectLevelAreaTagLabel")}
        optionalSuffix={optionalSuffix}
        definedAreas={options.areas}
        value={areaTag}
        onChange={onChangeAreaTag}
      />
    );
  }

  return (
    <>
      <TagPillSection
        label={t("projectLevelBuildPhaseTagLabel")}
        optionalSuffix={optionalSuffix}
        chips={options.buildPhases}
        value={buildPhaseTag}
        onChange={onChangeBuildPhaseTag}
        compactTop={compactLabels}
      />
      <AreaTagSection
        label={t("projectLevelAreaTagLabel")}
        optionalSuffix={optionalSuffix}
        definedAreas={options.areas}
        value={areaTag}
        onChange={onChangeAreaTag}
      />
    </>
  );
}
