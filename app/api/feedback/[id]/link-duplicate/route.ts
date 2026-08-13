import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";
import { hasFeedbackInboxAccess } from "@/lib/feedback-access";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const linkSchema = z.object({
  canonicalId: z.string().cuid(),
});

/**
 * POST /api/feedback/[id]/link-duplicate
 *
 * Marks report [id] as a duplicate of the given canonicalId.
 * The duplicate is hidden from the main inbox list; its submission is visible
 * inside the canonical's "Duplicates" tab.
 *
 * Validations:
 *  - [id] must exist and not already be a canonical (i.e. have its own duplicates)
 *  - canonicalId must exist
 *  - Cannot link to self
 *  - canonicalId cannot itself be a duplicate of another report
 *  - [id] cannot already be linked as a duplicate
 *
 * Requires: feedback inbox access (canTriage)
 */
export async function POST(req: NextRequest, { params }: Params) {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const canTriage = hasFeedbackInboxAccess(
    effective.user.role,
    effective.user.specialPermissions
  );
  if (!canTriage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { canonicalId } = parsed.data;

  if (id === canonicalId) {
    return NextResponse.json(
      { error: "A report cannot be a duplicate of itself" },
      { status: 400 }
    );
  }

  // Fetch both reports with their duplicate state
  const [duplicate, canonical] = await Promise.all([
    db.feedbackReport.findUnique({
      where: { id },
      select: {
        id: true,
        shortId: true,
        title: true,
        canonicalDuplicates: { select: { id: true } },
        duplicateOf: { select: { canonicalId: true } },
      },
    }),
    db.feedbackReport.findUnique({
      where: { id: canonicalId },
      select: {
        id: true,
        shortId: true,
        title: true,
        duplicateOf: { select: { canonicalId: true } },
      },
    }),
  ]);

  if (!duplicate) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (!canonical) {
    return NextResponse.json({ error: "Canonical report not found" }, { status: 404 });
  }
  if (duplicate.canonicalDuplicates.length > 0) {
    return NextResponse.json(
      { error: "This report is already a canonical — unlink its duplicates before linking it as a duplicate of another" },
      { status: 409 }
    );
  }
  if (duplicate.duplicateOf) {
    return NextResponse.json(
      { error: "This report is already linked as a duplicate of another" },
      { status: 409 }
    );
  }
  if (canonical.duplicateOf) {
    return NextResponse.json(
      { error: "The target report is itself a duplicate — link to its canonical instead" },
      { status: 409 }
    );
  }

  const link = await db.feedbackDuplicate.create({
    data: { canonicalId, duplicateId: id },
    select: {
      id: true,
      canonicalId: true,
      duplicateId: true,
      canonical: { select: { id: true, shortId: true, title: true } },
    },
  });

  return NextResponse.json(link, { status: 201 });
}

/**
 * DELETE /api/feedback/[id]/link-duplicate
 *
 * Removes the FeedbackDuplicate record for report [id], restoring it to the main inbox list.
 * Requires: feedback inbox access (canTriage)
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const canTriage = hasFeedbackInboxAccess(
    effective.user.role,
    effective.user.specialPermissions
  );
  if (!canTriage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const link = await db.feedbackDuplicate.findUnique({
    where: { duplicateId: id },
    select: { id: true },
  });

  if (!link) {
    return NextResponse.json(
      { error: "This report is not linked as a duplicate" },
      { status: 404 }
    );
  }

  await db.feedbackDuplicate.delete({ where: { duplicateId: id } });

  return NextResponse.json({ unlinked: true, reportId: id });
}
