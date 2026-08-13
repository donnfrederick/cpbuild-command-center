import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import type { EffectiveSession } from "@/lib/masquerade";
import {
  attachIsFavorite,
  compareProjectsByName,
  sortProjectsWithFavorites,
  type FavoriteProjectMeta,
} from "@/lib/project-favorites-shared";

export type { FavoriteProjectMeta } from "@/lib/project-favorites-shared";
export {
  attachIsFavorite,
  buildFavoriteMetaFromProjects,
  compareProjectsByField,
  compareProjectsByName,
  EMPTY_FAVORITE_META,
  sortProjectsWithFavorites,
} from "@/lib/project-favorites-shared";

/** Real logged-in user for favorites — not masquerade target or role-preview overlay. */
export function favoriteOwnerFromEffectiveSession(
  effective: EffectiveSession
): { id: string; email?: string | null } {
  if (effective.masquerade) {
    return { id: effective.masquerade.actorId, email: effective.masquerade.actorEmail };
  }
  return { id: effective.user.id, email: effective.user.email };
}

export async function loadFavoriteProjectMeta(userId: string): Promise<FavoriteProjectMeta> {
  const rows = await db.userProjectFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { projectId: true },
  });

  const favoriteIds = new Set<string>();
  const favoriteOrder = new Map<string, number>();
  rows.forEach((row, index) => {
    favoriteIds.add(row.projectId);
    favoriteOrder.set(row.projectId, index);
  });

  return { favoriteIds, favoriteOrder };
}

export async function enrichProjectsWithFavorites(
  projects: Project[],
  userId: string | null
): Promise<Project[]> {
  if (!userId) {
    return projects.map((project) => ({ ...project, isFavorite: false }));
  }

  const meta = await loadFavoriteProjectMeta(userId);
  const withFlags = attachIsFavorite(projects, meta);
  return sortProjectsWithFavorites(withFlags, meta, compareProjectsByName);
}
