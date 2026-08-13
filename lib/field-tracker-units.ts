/**
 * Batch size for `GET /api/projects/[id]/units?limit=` — Field Tracker list (`UnitCards`)
 * and Field Tracker table (`ProjectDetailView`).
 */
export const FIELD_TRACKER_UNITS_PAGE_LIMIT = 50;

/**
 * Delay after typing stops before Field Tracker table search runs automatically.
 * Enter, blur, and column-scope changes commit the search immediately (no wait).
 */
export const FIELD_TRACKER_SEARCH_DEBOUNCE_MS = 650;
