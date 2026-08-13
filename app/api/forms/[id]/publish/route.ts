import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authorizeFormMutation } from "@/lib/forms/form-route-auth";
import { normalizeFormSections, syncFormReportingStructure } from "@/lib/inspections/reporting-normalization";
import {
  FORM_JSON_STUB,
  copyFormDraftToVersionReporting,
  countFormDraftQuestions,
  countFormVersionQuestions,
} from "@/lib/inspections/form-reporting-structure";
import { isGypcreteInspectionCategory } from "@/lib/inspections/gypcrete-form-rules";

// ─── POST /api/forms/[id]/publish ────────────────────────────────────────────
// Creates FormVersion v1 (or next version) from relational draft structure and
// marks the form PUBLISHED. Requires MANAGE_FORMS permission.

export async function POST(
  _req: NextRequest,
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

  let draftQuestionCount = await countFormDraftQuestions(id);
  const legacySections = normalizeFormSections(form.draftSections);
  const legacyQuestionCount = legacySections.reduce((sum, s) => sum + s.questions.length, 0);

  if (draftQuestionCount === 0 && legacyQuestionCount > 0) {
    await syncFormReportingStructure({ formId: id, sections: form.draftSections });
    draftQuestionCount = await countFormDraftQuestions(id);
  }

  if (draftQuestionCount === 0) {
    return NextResponse.json({ error: "No draft content to publish" }, { status: 422 });
  }

  const nextVersion = (form.versions[0]?.versionNumber ?? 0) + 1;

  const dbUser = await db.user.findUnique({ where: { id: auth.userId }, select: { id: true } });
  const publishedById = dbUser ? auth.userId : null;

  const gypcretePublishFix = isGypcreteInspectionCategory(form.category)
    ? { level: "unit" as const, scopeTypeCodes: [] as string[] }
    : {};

  try {
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
        { error: "Published version has no questions — relational mirror sync failed" },
        { status: 500 }
      );
    }

    const verifyCount = await countFormVersionQuestions(version.id);
    if (verifyCount === 0) {
      return NextResponse.json(
        { error: "Published version mirror verification failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ form: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const updated = await db.form.update({
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
      });
      const latestVersion = updated.versions[0];
      if (latestVersion) {
        const versionQuestionCount = await copyFormDraftToVersionReporting(id, latestVersion.id);
        if (versionQuestionCount === 0) {
          return NextResponse.json(
            { error: "Published version has no questions — relational mirror sync failed" },
            { status: 500 }
          );
        }
      }
      return NextResponse.json({ form: updated });
    }
    throw err;
  }
}
