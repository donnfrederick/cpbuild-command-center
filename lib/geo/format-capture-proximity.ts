const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;

export interface FormatDistanceOptions {
  /** When true, prefer feet for short distances (US field default). */
  useImperial?: boolean;
}

/**
 * Human-readable distance for watermark / UI (raw distance — no on-site bands).
 */
export function formatDistanceFromProjectMeters(
  meters: number,
  options: FormatDistanceOptions = {},
): string {
  const useImperial = options.useImperial !== false;
  if (!Number.isFinite(meters) || meters < 0) return "";

  if (useImperial) {
    const feet = meters / METERS_PER_FOOT;
    if (feet < 5280) {
      return `${Math.round(feet)} ft from project`;
    }
    const miles = meters / METERS_PER_MILE;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi from project`;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m from project`;
  }
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km from project`;
}

/** Decimal degrees for watermark coord line. */
export function formatCaptureCoordinates(lat: number, lng: number): string {
  const latStr = lat.toFixed(4);
  const lngStr = lng.toFixed(4);
  return `${latStr}, ${lngStr}`;
}
