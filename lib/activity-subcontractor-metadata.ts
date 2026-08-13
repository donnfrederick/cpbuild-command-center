import type { ActivityEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isLegacySubcontractorUpmEvent, isSubcontractorActivityEvent } from "@/lib/activity-event-display";
import { getSubcontractorsForPicker } from "@/lib/unifier/subcontractors";

interface ActivityWithMetadata {
  eventType: ActivityEventType;
  metadata: Prisma.JsonValue;
}

function asRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function needsSubcontractorNameHydration(
  eventType: ActivityEventType,
  metadata: Record<string, unknown>,
): boolean {
  if (!isSubcontractorActivityEvent(eventType, metadata)) return false;
  const name = metadata.subcontractorName;
  if (typeof name === "string" && name.length > 0 && name !== "Unassigned") return false;
  return Boolean(metadata.rowId || metadata.toUnifierSubId);
}

/** Fill missing subcontractor names (and ids) when reading activity — covers legacy UPM rows. */
export async function hydrateSubcontractorActivityMetadata<T extends ActivityWithMetadata>(
  events: T[],
): Promise<T[]> {
  const targets = events.filter((event) => {
    const metadata = asRecord(event.metadata);
    return metadata && needsSubcontractorNameHydration(event.eventType, metadata);
  });
  if (targets.length === 0) return events;

  const rowIds = [
    ...new Set(
      targets
        .map((event) => asRecord(event.metadata)?.rowId)
        .filter((rowId): rowId is string => typeof rowId === "string" && rowId.length > 0),
    ),
  ];

  const rowsById = rowIds.length
    ? new Map(
        (
          await db.projectRow.findMany({
            where: { id: { in: rowIds } },
            select: { id: true, unifierSubId: true },
          })
        ).map((row) => [row.id, row.unifierSubId] as const),
      )
    : new Map<string, string | null>();

  const subs = await getSubcontractorsForPicker().catch(() => []);
  const nameBySubId = new Map(subs.map((sub) => [sub.id, sub.name] as const));

  const resolveName = (subId: string | null | undefined): string => {
    if (!subId) return "Unassigned";
    return nameBySubId.get(subId) ?? subId;
  };

  return events.map((event) => {
    const metadata = asRecord(event.metadata);
    if (!metadata || !needsSubcontractorNameHydration(event.eventType, metadata)) {
      return event;
    }

    const rowId = typeof metadata.rowId === "string" ? metadata.rowId : null;
    const toUnifierSubId =
      (typeof metadata.toUnifierSubId === "string" ? metadata.toUnifierSubId : null) ??
      (rowId ? rowsById.get(rowId) ?? null : null);

    const subcontractorName = resolveName(toUnifierSubId);
    const normalizedEventType = isLegacySubcontractorUpmEvent(event.eventType, metadata)
      ? ("SCOPE_SUBCONTRACTOR_UPDATED" as ActivityEventType)
      : event.eventType;

    return {
      ...event,
      eventType: normalizedEventType,
      metadata: {
        ...metadata,
        toUnifierSubId: toUnifierSubId ?? null,
        subcontractorName,
      },
    } as T;
  });
}
