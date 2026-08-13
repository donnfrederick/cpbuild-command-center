"use client";

import { useCallback, useState } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface FavoriteProjectButtonProps {
  projectId: string;
  isFavorite: boolean;
  onFavoriteChange: (projectId: string, favorite: boolean) => void;
}

export function FavoriteProjectButton({
  projectId,
  isFavorite,
  onFavoriteChange,
}: FavoriteProjectButtonProps) {
  const t = useTranslations("projects");
  const [isSaving, setIsSaving] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isSaving) return;

      const nextFavorite = !isFavorite;
      onFavoriteChange(projectId, nextFavorite);
      setIsSaving(true);

      try {
        const res = await fetch(`/api/projects/${projectId}/favorite`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorite: nextFavorite }),
        });
        if (!res.ok) {
          onFavoriteChange(projectId, isFavorite);
          toast.error(t("favoriteFailed"));
        }
      } catch {
        onFavoriteChange(projectId, isFavorite);
        toast.error(t("favoriteFailed"));
      } finally {
        setIsSaving(false);
      }
    },
    [isFavorite, isSaving, onFavoriteChange, projectId, t]
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSaving}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? t("unfavoriteProject") : t("favoriteProject")}
      title={isFavorite ? t("unfavoriteProject") : t("favoriteProject")}
      className="flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--primary-500)] disabled:opacity-50"
      style={{
        width: 32,
        height: 32,
        flexShrink: 0,
        border: "none",
        background: "transparent",
        cursor: isSaving ? "not-allowed" : "pointer",
        color: isFavorite ? "var(--warning-600)" : "var(--neutral-400)",
      }}
    >
      <Star
        size={16}
        aria-hidden
        fill={isFavorite ? "currentColor" : "none"}
        strokeWidth={isFavorite ? 0 : 2}
      />
    </button>
  );
}
