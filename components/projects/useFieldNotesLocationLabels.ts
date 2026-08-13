"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { FieldNotesLocationLabels } from "@/lib/field-notes-scope";

/** Translated tokens for {@link formatFieldNotesLocationDisplay} and {@link unitContextFromUnitRef}. */
export function useFieldNotesLocationLabels(): FieldNotesLocationLabels {
  const t = useTranslations("units");
  return useMemo(
    () => ({
      levelHeading: (level: string) => t("levelGroupHeading", { level }),
      buildingAndLevel: (building: string, level: string) =>
        t("fieldNotesBuildingLevel", { building, level }),
      unknown: t("fieldNotesUnknownLocation"),
      projectUnitKey: t("fieldNotesProjectUnitKey"),
    }),
    [t],
  );
}

/** i18n formatters for project-level build phase / area tags in field note location lines. */
export function useFieldNotesBuilderTagDisplayLabels() {
  const t = useTranslations("units");
  return useMemo(
    () => ({
      buildPhase: (value: string) => t("locationMetaPhaseLabel", { phase: value }),
      area: (value: string) => t("locationMetaAreaLabel", { area: value }),
    }),
    [t],
  );
}
