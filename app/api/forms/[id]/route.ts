import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import { syncFormReportingStructure } from "@/lib/inspections/reporting-normalization";
import {
  FORM_JSON_STUB,
  loadFormSectionsFromReporting,
  loadFormVersionSectionsFromReporting,
} from "@/lib/inspections/form-reporting-structure";
import { normalizeGypcreteFormSetup } from "@/lib/inspections/gypcrete-form-rules";
import { authorizeFormMutation } from "@/lib/forms/form-route-auth";
import { FORM_DESCRIPTION_MAX_LENGTH } from "@/lib/forms/form-api-limits";

// ─── Validation ───────────────────────────────────────────────────────────────

const PatchFormSchema = z.object({
  name: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().min(1).max(200).optional(),
  ),
  description: z.string().max(FORM_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  level: z.enum(["scope", "unit", "project"]).optional(),
  category: z.string().min(1).optional(),
  formPurpose: z.enum(["inspection", "documentation"]).optional(),
  scopeTypeCodes: z.array(z.string()).optional(),
  /** Draft section content — FormSection[] serialized as JSON */
  draftSections: z.unknown().optional(),
});

// ─── GET /api/forms/[id] ──────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const form = await db.form.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true, sections: true, publishedAt: true },
      },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canManageForms = hasPermission(
    effective.user.role,
    PERMISSIONS.MANAGE_FORMS,
    effective.user.specialPermissions
  );
  if (!canManageForms && form.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (canManageForms) {
    const relationalSections = await loadFormSectionsFromReporting(id);
    const draftSections =
      relationalSections.length > 0 ? relationalSections : form.draftSections;
    return NextResponse.json({
      form: {
        ...form,
        draftSections,
      },
    });
  }

  // Non-managers may read published forms for inspections — expose published
  // version sections only, never in-progress draft content.
  const latestVersion = form.versions[0];
  let publishedSections: unknown = null;
  if (latestVersion?.id) {
    const relational = await loadFormVersionSectionsFromReporting(latestVersion.id);
    publishedSections =
      relational.length > 0 ? relational : latestVersion.sections ?? null;
  }

  return NextResponse.json({
    form: {
      ...form,
      draftSections: publishedSections,
    },
  });
}

// ─── PATCH /api/forms/[id] (save draft) ──────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeFormMutation();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const existing = await db.form.findUnique({
    where: { id },
    select: { id: true, category: true, level: true, scopeTypeCodes: true, purpose: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, description, scopeTypeCodes, draftSections, level, category, formPurpose } =
    parsed.data;

  const resolvedPurpose = formPurpose ?? existing.purpose ?? "inspection";

  const metadataPatch: {
    level?: string;
    category?: string;
    purpose?: string;
    scopeTypeCodes?: string[];
  } = {};

  if (
    level !== undefined ||
    category !== undefined ||
    scopeTypeCodes !== undefined ||
    formPurpose !== undefined
  ) {
    const resolvedCategory =
      resolvedPurpose === "documentation"
        ? "OTHER"
        : (category ?? existing.category);
    const normalized = normalizeGypcreteFormSetup({
      category: resolvedCategory,
      level: (level ?? existing.level) as "scope" | "unit" | "project",
      scopeTypeCodes: scopeTypeCodes ?? existing.scopeTypeCodes,
    });
    metadataPatch.level = normalized.level;
    metadataPatch.category = normalized.category;
    metadataPatch.scopeTypeCodes = normalized.scopeTypeCodes;
    if (formPurpose !== undefined) {
      metadataPatch.purpose = formPurpose;
    }
  }

  if (draftSections !== undefined) {
    try {
      await syncFormReportingStructure({ formId: id, sections: draftSections });
    } catch (err) {
      console.error("[PATCH /api/forms/[id]] syncFormReportingStructure failed", err);
      return NextResponse.json(
        { error: "Failed to save form structure" },
        { status: 500 }
      );
    }
  }

  const form = await db.form.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...metadataPatch,
      ...(draftSections !== undefined && { draftSections: FORM_JSON_STUB }),
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true, publishedAt: true },
      },
    },
  });

  const relationalSections = await loadFormSectionsFromReporting(id);

  return NextResponse.json({
    form: {
      ...form,
      draftSections: relationalSections.length > 0 ? relationalSections : form.draftSections,
    },
  });
}

// ─── DELETE /api/forms/[id] ───────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeFormMutation();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const existing = await db.form.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.inspectionSubmission.updateMany({
    where: { formId: id },
    data: { formId: null },
  });

  await db.form.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
