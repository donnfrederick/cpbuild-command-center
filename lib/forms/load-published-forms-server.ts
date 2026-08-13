/**
 * Server-side published forms loader — same shape as GET /api/forms?status=published.
 * Used by the offline snapshot bundle.
 */

import { db } from "@/lib/db";
import { loadFormVersionSectionsFromReportingBatch } from "@/lib/inspections/form-reporting-structure";
import type { FormSection } from "@/components/forms/formTypes";

export async function loadPublishedFormsForOffline(): Promise<unknown[]> {
  const forms = await db.form.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
    omit: { draftSections: true },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          publishedAt: true,
          sections: true,
        },
      },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  const versionSectionsByVersionId = await loadFormVersionSectionsFromReportingBatch(
    forms
      .map((f) => f.versions[0]?.id)
      .filter((id): id is string => typeof id === "string"),
  );

  return forms.map((form) => {
    const latestVersion = form.versions[0];
    let publishedSections: unknown = null;
    if (latestVersion?.id) {
      const relational = versionSectionsByVersionId.get(latestVersion.id) ?? [];
      publishedSections =
        relational.length > 0 ? relational : (latestVersion.sections as FormSection[] | null) ?? null;
    }
    const { versions, ...rest } = form;
    return {
      ...rest,
      draftSections: publishedSections,
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        publishedAt: v.publishedAt,
      })),
    };
  });
}
