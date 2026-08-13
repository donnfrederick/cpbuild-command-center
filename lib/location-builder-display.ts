/** Card-shaped input for location-builder field helpers (UnitCard or test fixtures). */
export interface LocationBuilderFieldSource {
  area: string;
  buildPhase?: string;
  scopes?: ReadonlyArray<{ buildPhase: string; area?: string }>;
}

export interface SharedLocationBuilderFields {
  buildPhase: string | null;
  area: string | null;
}

/** True when a Location Builder text field is meaningful (not blank or literal "0"). */
export function isDefinedLocationBuilderField(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 && trimmed !== "0";
}

/** Resolved build phase + area for one location card. */
export function cardLocationBuilderFields(card: LocationBuilderFieldSource): {
  buildPhase: string;
  area: string;
} {
  let buildPhase = (card.buildPhase ?? "").trim();
  if (!isDefinedLocationBuilderField(buildPhase) && card.scopes?.length) {
    for (const scope of card.scopes) {
      const candidate = (scope.buildPhase ?? "").trim();
      if (isDefinedLocationBuilderField(candidate)) {
        buildPhase = candidate;
        break;
      }
    }
  }

  let area = (card.area ?? "").trim();
  if (!isDefinedLocationBuilderField(area) && card.scopes?.length) {
    for (const scope of card.scopes) {
      const candidate = (scope.area ?? "").trim();
      if (isDefinedLocationBuilderField(candidate)) {
        area = candidate;
        break;
      }
    }
  }

  return {
    buildPhase: isDefinedLocationBuilderField(buildPhase) ? buildPhase : "",
    area: isDefinedLocationBuilderField(area) ? area : "",
  };
}

/**
 * When every card shares the same defined build phase and/or area, returns those values
 * for level/building labels. Excludes custom site locations — pass unit + common area cards only.
 */
export function sharedLocationBuilderFields(
  cards: ReadonlyArray<LocationBuilderFieldSource>,
): SharedLocationBuilderFields {
  if (cards.length === 0) {
    return { buildPhase: null, area: null };
  }

  const resolved = cards.map((card) => cardLocationBuilderFields(card));
  const buildPhases = resolved.map((r) => r.buildPhase);
  const areas = resolved.map((r) => r.area);

  const sharedBuildPhase =
    buildPhases.every((v) => isDefinedLocationBuilderField(v)) &&
    new Set(buildPhases).size === 1
      ? buildPhases[0]
      : null;

  const sharedArea =
    areas.every((v) => isDefinedLocationBuilderField(v)) && new Set(areas).size === 1
      ? areas[0]
      : null;

  return { buildPhase: sharedBuildPhase, area: sharedArea };
}

export interface LocationBuilderMetaLabels {
  buildPhase: (value: string) => string;
  area: (value: string) => string;
}

/** Human-readable label parts for level/building headers (i18n via labels). */
export function labeledLocationBuilderMetaParts(
  fields: SharedLocationBuilderFields,
  labels: LocationBuilderMetaLabels,
): string[] {
  const parts: string[] = [];
  if (fields.buildPhase) {
    parts.push(labels.buildPhase(fields.buildPhase));
  }
  if (fields.area) {
    parts.push(labels.area(fields.area));
  }
  return parts;
}

export function joinLocationBuilderMetaParts(parts: ReadonlyArray<string>): string {
  return parts.length > 0 ? parts.join(" · ") : "";
}
