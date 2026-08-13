import { AUTO_MEDIA_KEY, AUTO_NOTES_KEY } from "@/components/forms/formTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAutoAppendixOnlyPayload(payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload);
  if (keys.length === 0) return false;
  return keys.every((key) => key === AUTO_NOTES_KEY || key === AUTO_MEDIA_KEY);
}

/** True when payload is the relational-authoritative empty stub (or auto appendix only). */
export function isInspectionPayloadStub(payload: unknown): boolean {
  if (!isRecord(payload)) return true;
  const keys = Object.keys(payload);
  if (keys.length === 0) return true;
  return isAutoAppendixOnlyPayload(payload);
}

/** True when templateSnapshot has no renderable sections (category-only or empty stub). */
export function isInspectionTemplateSnapshotStub(snapshot: unknown): boolean {
  if (!isRecord(snapshot)) return true;
  const keys = Object.keys(snapshot);
  if (keys.length === 0) return true;
  if (keys.length === 1 && keys[0] === "category") return true;
  const sections = snapshot.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    return keys.every((key) => key === "category" || key === "latestVersionId");
  }
  return false;
}
