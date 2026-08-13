import type { Project, ProjectSortField, SortDirection } from "@/lib/projects";

export interface FavoriteProjectMeta {
  favoriteIds: Set<string>;
  favoriteOrder: Map<string, number>;
}

export const EMPTY_FAVORITE_META: FavoriteProjectMeta = {
  favoriteIds: new Set(),
  favoriteOrder: new Map(),
};

export function buildFavoriteMetaFromProjects(
  projects: Array<{ id: string; isFavorite?: boolean }>
): FavoriteProjectMeta {
  const favoriteIds = new Set<string>();
  const favoriteOrder = new Map<string, number>();
  let order = 0;
  for (const project of projects) {
    if (project.isFavorite) {
      favoriteIds.add(project.id);
      favoriteOrder.set(project.id, order);
      order += 1;
    }
  }
  return { favoriteIds, favoriteOrder };
}

export function attachIsFavorite<T extends { id: string }>(
  projects: T[],
  meta: FavoriteProjectMeta
): Array<T & { isFavorite: boolean }> {
  return projects.map((project) => ({
    ...project,
    isFavorite: meta.favoriteIds.has(project.id),
  }));
}

export function compareProjectsByName(a: Project, b: Project): number {
  return a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" });
}

export function compareProjectsByField(
  field: ProjectSortField,
  direction: SortDirection
): (a: Project, b: Project) => number {
  return (a, b) => {
    const av = (a[field] ?? "") as string;
    const bv = (b[field] ?? "") as string;
    if (av < bv) return direction === "asc" ? -1 : 1;
    if (av > bv) return direction === "asc" ? 1 : -1;
    return 0;
  };
}

export function sortProjectsWithFavorites<T extends { id: string }>(
  projects: T[],
  meta: FavoriteProjectMeta,
  compare: (a: T, b: T) => number
): T[] {
  return [...projects].sort((a, b) => {
    const aFav = meta.favoriteIds.has(a.id);
    const bFav = meta.favoriteIds.has(b.id);
    if (aFav !== bFav) return aFav ? -1 : 1;
    if (aFav && bFav) {
      const aOrder = meta.favoriteOrder.get(a.id) ?? 0;
      const bOrder = meta.favoriteOrder.get(b.id) ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
    return compare(a, b);
  });
}
