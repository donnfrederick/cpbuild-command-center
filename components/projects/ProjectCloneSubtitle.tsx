"use client";

import { useTranslations } from "next-intl";

interface ProjectCloneSubtitleProps {
  clonedFromProjectName: string | null;
}

export function ProjectCloneSubtitle({ clonedFromProjectName }: ProjectCloneSubtitleProps) {
  const t = useTranslations("projects");
  if (!clonedFromProjectName) return null;

  return (
    <p
      style={{
        margin: "4px 0 0",
        fontSize: 12,
        color: "var(--neutral-500)",
        lineHeight: 1.4,
      }}
    >
      {t("clonedFromProject", { name: clonedFromProjectName })}
    </p>
  );
}
