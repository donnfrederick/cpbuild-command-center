/**
 * Build a Google Maps search URL for a street/site address string.
 * Returns null when the address is empty after trim (no link should render).
 */
export function buildGoogleMapsSearchUrl(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const query = encodeURIComponent(trimmed);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
