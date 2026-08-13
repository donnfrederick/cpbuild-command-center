import { NextResponse } from "next/server";

/** Result of parsing an optional JSON filter field that must be a string array. */
export type ParsedStringArray =
  | { ok: true; value: string[] }
  | { ok: false; field: string };

/**
 * Accepts `undefined`, `null`, or a JSON array of non-empty strings.
 * Rejects scalars and arrays containing non-strings (e.g. `obsTypes: "QUALITY"`).
 */
export function parseOptionalStringArray(
  value: unknown,
  fieldName: string,
): ParsedStringArray {
  if (value === undefined || value === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return { ok: false, field: fieldName };
  }
  return { ok: true, value: value.filter((entry) => entry.length > 0) };
}

export function invalidFilterArrayResponse(field: string): NextResponse {
  return NextResponse.json(
    { error: `Invalid ${field}: expected an array of strings.` },
    { status: 400 },
  );
}

/**
 * Like `parseOptionalStringArray`, but every entry must be in `allowed`.
 */
export function parseOptionalEnumStringArray<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): ParsedStringArray & { value?: T[] } {
  const parsed = parseOptionalStringArray(value, fieldName);
  if (!parsed.ok) return parsed;
  const allowedSet = new Set<string>(allowed);
  if (parsed.value.some((entry) => !allowedSet.has(entry))) {
    return { ok: false, field: fieldName };
  }
  return { ok: true, value: parsed.value as T[] };
}

export function invalidFilterEnumResponse(field: string, allowed: readonly string[]): NextResponse {
  return NextResponse.json(
    {
      error: `Invalid ${field}: expected an array of allowed enum values.`,
      allowed,
    },
    { status: 400 },
  );
}

/** Result of parsing an optional JSON boolean filter field. */
export type ParsedBoolean =
  | { ok: true; value: boolean }
  | { ok: false; field: string };

/**
 * Accepts `undefined`, `null`, or a JSON boolean.
 * Rejects strings and other scalars (e.g. `"false"`).
 */
export function parseOptionalBoolean(
  value: unknown,
  fieldName: string,
  defaultValue: boolean,
): ParsedBoolean {
  if (value === undefined || value === null) {
    return { ok: true, value: defaultValue };
  }
  if (typeof value !== "boolean") {
    return { ok: false, field: fieldName };
  }
  return { ok: true, value };
}

/** Result of parsing an optional positive integer filter field. */
export type ParsedOptionalPositiveInt =
  | { ok: true; value: number | undefined }
  | { ok: false; field: string };

/**
 * Accepts `undefined`, `null`, or a finite positive number.
 * Rejects strings, zero, negatives, and non-integers after floor would be invalid input types.
 */
export function parseOptionalPositiveInt(
  value: unknown,
  fieldName: string,
): ParsedOptionalPositiveInt {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return { ok: false, field: fieldName };
  }
  return { ok: true, value: Math.floor(value) };
}

export function invalidFilterScalarResponse(field: string, expected: string): NextResponse {
  return NextResponse.json(
    { error: `Invalid ${field}: expected ${expected}.` },
    { status: 400 },
  );
}
