import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeFormMutation } from "@/lib/forms/form-route-auth";
import { syncFormReportingStructure } from "@/lib/inspections/reporting-normalization";
import {
  FORM_JSON_STUB,
  copyFormDraftToVersionReporting,
  countFormVersionQuestions,
} from "@/lib/inspections/form-reporting-structure";
import { isGypcreteInspectionCategory } from "@/lib/inspections/gypcrete-form-rules";

// ─── Validation ───────────────────────────────────────────────────────────────

const SaveVersionSchema = z.object({
  /** FormSection[] as JSON — the full edited content to save as a new version */
  sections: z.unknown(),
});

// ─── POST /api/forms/[id]/save-version ───────────────────────────────────────
// Called from edit-mode UX for a PUBLISHED form. Persists sections to the
// relational draft mirror, then copies draft → version mirror for the new
// immutable FormVersion.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeFormMutation();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const form = await db.form.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { versionNumber: true } },
    },
  });
  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SaveVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  await syncFormReportingStructure({ formId: id, sections: parsed.data.sections });

  const nextVersion = (form.versions[0]?.versionNumber ?? 0) + 1;

  const dbUser = await db.user.findUnique({ where: { id: auth.userId }, select: { id: true } });
  const publishedById = dbUser ? auth.userId : null;

  const gypcretePublishFix = isGypcreteInspectionCategory(form.category)
    ? { level: "unit" as const, scopeTypeCodes: [] as string[] }
    : {};

  const [version, updated] = await db.$transaction([
    db.formVersion.create({
      data: {
        formId: id,
        versionNumber: nextVersion,
        sections: FORM_JSON_STUB,
        publishedById,
      },
    }),
    db.form.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        draftSections: FORM_JSON_STUB,
        ...gypcretePublishFix,
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { id: true, versionNumber: true, publishedAt: true },
        },
      },
    }),
  ]);

  const versionQuestionCount = await copyFormDraftToVersionReporting(id, version.id);
  if (versionQuestionCount === 0) {
    return NextResponse.json(
      { error: "Saved version has no questions — relational mirror sync failed" },
      { status: 500 }
    );
  }

  const verifyCount = await countFormVersionQuestions(version.id);
  if (verifyCount === 0) {
    return NextResponse.json(
      { error: "Saved version mirror verification failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ form: updated, version });
}
