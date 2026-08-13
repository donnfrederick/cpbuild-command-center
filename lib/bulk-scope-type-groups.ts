/**
 * Groups scope rows by canonical (or raw) scope type for the bulk-actions sheet.
 * Unit counts are distinct units — duplicate scope rows in the same unit count once.
 */

export interface BulkScopeRowForGrouping {
  unitKey: string;
  scopeTypeId: string | null;
  scopeTypeName: string | null;
  canonicalScopeTypeId?: string | null;
  canonicalDisplayName?: string | null;
  subScopes: Array<{ name: string }>;
}

export interface BulkScopeTypeGroup {
  /** Canonical id when present, else raw scopeTypeId — matches selection keys today. */
  id: string;
  name: string;
  rawScopeTypeIds: string[];
  /** Distinct selected units that have at least one row of this type. */
  unitCount: number;
  subScopeNames: string[];
  hasSubScopes: boolean;
}

export function computeBulkScopeTypeGroups(rows: BulkScopeRowForGrouping[]): BulkScopeTypeGroup[] {
  const map = new Map<
    string,
    { name: string; rawIds: Set<string>; units: Set<string>; subNames: Set<string> }
  >();
  for (const r of rows) {
    if (!r.scopeTypeId || !r.scopeTypeName) continue;
    const key = r.canonicalScopeTypeId ?? r.scopeTypeId;
    const name = r.canonicalDisplayName ?? r.scopeTypeName;
    const entry = map.get(key) ?? { name, rawIds: new Set(), units: new Set(), subNames: new Set() };
    entry.rawIds.add(r.scopeTypeId);
    entry.units.add(r.unitKey);
    for (const s of r.subScopes) entry.subNames.add(s.name);
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .map(([id, { name, rawIds, units, subNames }]) => {
      const subScopeNames = Array.from(subNames).sort();
      return {
        id,
        name,
        rawScopeTypeIds: Array.from(rawIds),
        unitCount: units.size,
        subScopeNames,
        hasSubScopes: subScopeNames.length > 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
