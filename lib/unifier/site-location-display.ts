/**
 * Build display `siteLocation` from Unifier shell fields:
 * `CP_GEN_ADDRESS_TB2000` (location/address) + optional `CP_GEN_STATE_PD`.
 * Skips appending state when the address already ends with the same token (case-insensitive).
 */

export function formatUnifierSiteLocation(
  addressLine: string | null | undefined,
  state: string | null | undefined
): string {
  const addr = (addressLine ?? "").trim();
  const st = (state ?? "").trim();
  if (!st) return addr;
  if (!addr) return st;
  const a = addr.toLowerCase();
  const s = st.toLowerCase();
  if (a === s) return addr;
  if (a.endsWith(`, ${s}`) || a.endsWith(`,${s}`)) return addr;
  if (a.endsWith(` ${s}`)) return addr;
  return `${addr}, ${st}`;
}
