import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  loadFormSectionsFromReportingBatch,
  loadFormVersionSectionsFromReportingBatch,
} from "@/lib/inspections/form-reporting-structure";
import { normalizeGypcreteFormSetup } from "@/lib/inspections/gypcrete-form-rules";
import type { FormSection } from "@/components/forms/formTypes";
import { authorizeFormMutation } from "@/lib/forms/form-route-auth";
import { FORM_DESCRIPTION_MAX_LENGTH } from "@/lib/forms/form-api-limits";

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateFormSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(FORM_DESCRIPTION_MAX_LENGTH).optional(),
  level: z.enum(["scope", "unit", "project"]),
  category: z.string().min(1),
  formPurpose: z.enum(["inspection", "documentation"]).default("inspection"),
  scopeTypeCodes: z.array(z.string()).default([]),
});

// ─── GET /api/forms ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status"); // "published" | null (all)

  const canManageForms = hasPermission(
    effective.user.role,
    PERMISSIONS.MANAGE_FORMS,
    effective.user.specialPermissions
  );
  if (statusFilter !== "published" && !canManageForms) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const usePublishedVersion = statusFilter === "published" || !canManageForms;

  const forms = await db.form.findMany({
    where: statusFilter === "published" ? { status: "PUBLISHED" } : undefined,
    orderBy: { updatedAt: "desc" },
    ...(canManageForms ? {} : { omit: { draftSections: true } }),
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          publishedAt: true,
          ...(usePublishedVersion ? { sections: true } : {}),
        },
      },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  const draftSectionsByFormId: Map<string, FormSection[]> = usePublishedVersion
    ? new Map()
    : await loadFormSectionsFromReportingBatch(forms.map((f) => f.id));

  const versionSectionsByVersionId: Map<string, FormSection[]> = usePublishedVersion
    ? await loadFormVersionSectionsFromReportingBatch(
        forms
          .map((f) => f.versions[0]?.id)
          .filter((id): id is string => typeof id === "string"),
      )
    : new Map();

  const responseForms = forms.map((form) => {
    const latestVersion = form.versions[0];

    // Published list: `status=published` filter or non-managers always see the
    // latest published version structure — never in-progress draft content.
    if (usePublishedVersion) {
      let publishedSections: unknown = null;
      if (latestVersion?.id) {
        const relational = versionSectionsByVersionId.get(latestVersion.id) ?? [];
        publishedSections =
          relational.length > 0 ? relational : latestVersion.sections ?? null;
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
    }

    // Form builder list: relational draft mirror is authoritative (JSON stub is empty).
    const relationalDraft = draftSectionsByFormId.get(form.id) ?? [];
    const legacyDraftSections =
      "draftSections" in form ? form.draftSections : null;
    const draftSections =
      relationalDraft.length > 0 ? relationalDraft : legacyDraftSections;
    return {
      ...form,
      draftSections,
    };
  });

  return NextResponse.json({ forms: responseForms });
}

// ─── POST /api/forms ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await authorizeFormMutation();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, description, category, scopeTypeCodes, formPurpose } = parsed.data;
  const resolvedCategory = formPurpose === "documentation" ? "OTHER" : category;
  const { level, scopeTypeCodes: normalizedScopeCodes } = normalizeGypcreteFormSetup({
    category: resolvedCategory,
    level: parsed.data.level,
    scopeTypeCodes,
  });

  // Verify the session user ID exists in the DB — stale JWTs (after a migrate reset)
  // can carry an ID that no longer exists, causing an FK violation on createdById.
  const dbUser = await db.user.findUnique({ where: { id: auth.userId }, select: { id: true } });
  const createdById = dbUser ? auth.userId : null;

  let form;
  try {
    form = await db.form.create({
      data: {
        name,
        description,
        level,
        category: resolvedCategory,
        purpose: formPurpose,
        scopeTypeCodes: normalizedScopeCodes,
        createdById,
      },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    console.error("[POST /api/forms] DB error:", err);
    return NextResponse.json(
      { error: "Failed to create form", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ form }, { status: 201 });
}
