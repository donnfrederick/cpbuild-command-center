/** Whether client-side search (or redundant client filter) narrows the visible list. */
export function hasClientSideActivityFilter(options: {
  search: string;
  loadedCount: number;
  filteredCount: number;
}): boolean {
  return (
    options.search.trim().length > 0 ||
    options.filteredCount < options.loadedCount
  );
}

export function shouldShowFilteredActivityCount(options: {
  search: string;
  loadedCount: number;
  filteredCount: number;
  totalCount: number;
}): boolean {
  return (
    hasClientSideActivityFilter(options) &&
    options.filteredCount < options.totalCount
  );
}
