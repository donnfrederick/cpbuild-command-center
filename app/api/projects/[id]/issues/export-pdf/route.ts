import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { absoluteAppOriginFromRequest } from "@/lib/field-media-local";
import { buildFieldLogLocationUnitRefWhere } from "@/lib/field-log-location-filter";
import { normalizePdfCoverTitleFromBody } from "@/lib/pdf/normalize-cover-title-from-body";
import {
  invalidFilterArrayResponse,
  parseOptionalStringArray,
} from "@/lib/pdf/parse-export-filter-body";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
import { buildIssuesPdf, type IssueForPdf } from "@/lib/pdf/issues-pdf";
import { serializeIssuesResponsibleParties } from "@/lib/issues/serialize-issue-parties";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const rawBody = await req.json().catch(() => ({}));
  const body = typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)
    ? rawBody as Record<string, unknown>
    : {};
  const issueTypesParsed = parseOptionalStringArray(body.issueTypes, "issueTypes");
  if (!issueTypesParsed.ok) return invalidFilterArrayResponse(issueTypesParsed.field);
  const responsiblePartiesParsed = parseOptionalStringArray(
    body.responsibleParties,
    "responsibleParties",
  );
  if (!responsiblePartiesParsed.ok) {
    return invalidFilterArrayResponse(responsiblePartiesParsed.field);
  }
  const authorsParsed = parseOptionalStringArray(body.authors, "authors");
  if (!authorsParsed.ok) return invalidFilterArrayResponse(authorsParsed.field);
  const scopeNamesParsed = parseOptionalStringArray(body.scopeNames, "scopeNames");
  if (!scopeNamesParsed.ok) return invalidFilterArrayResponse(scopeNamesParsed.field);
  const buildingsParsed = parseOptionalStringArray(body.buildings, "buildings");
  if (!buildingsParsed.ok) return invalidFilterArrayResponse(buildingsParsed.field);
  const levelsParsed = parseOptionalStringArray(body.levels, "levels");
  if (!levelsParsed.ok) return invalidFilterArrayResponse(levelsParsed.field);

  const typedBody = body as {
    issueIds?: string[];
    status?: "open" | "resolved" | "all";
    dateFrom?: string;
    dateTo?: string;
    sortOrder?: "newest" | "oldest";
    projectName?: string;
    filterSummary?: string;
  };

  const {
    issueIds: rawIssueIds,
    status = "all",
    dateFrom,
    dateTo,
    sortOrder = "newest",
    projectName = "Project",
    filterSummary = "",
  } = typedBody;
  const issueTypes = issueTypesParsed.value;
  const responsibleParties = responsiblePartiesParsed.value;
  const authors = authorsParsed.value;
  const scopeNames = scopeNamesParsed.value;
  const buildings = buildingsParsed.value;
  const levels = levelsParsed.value;
  const bodyCoverTitleLine =
    typeof body.coverTitleLine === "string" ? body.coverTitleLine : undefined;

  const issueIds =
    Array.isArray(rawIssueIds) && rawIssueIds.length > 0
      ? [...new Set(rawIssueIds.filter((id) => typeof id === "string" && id.length > 0))]
      : [];

  const locationWhere = buildFieldLogLocationUnitRefWhere(buildings, levels) as
    | Prisma.ProjectIssueWhereInput
    | undefined;

  const issues = await db.projectIssue.findMany({
    where: {
      projectId,
      ...(issueIds.length > 0
        ? { id: { in: issueIds } }
        : {
            ...(status === "open" ? { status: "OPEN" } : {}),
            ...(status === "resolved" ? { status: "RESOLVED" } : {}),
            ...(issueTypes.length > 0
              ? { issueTypeCode: { in: issueTypes } }
              : {}),
            ...(responsibleParties.length > 0
              ? {
                  OR: [
                    { responsiblePartyCode: { in: responsibleParties } },
                    { responsiblePartyTags: { some: { partyCode: { in: responsibleParties } } } },
                  ],
                }
              : {}),
            ...(authors.length > 0 ? { createdById: { in: authors } } : {}),
            ...(scopeNames.length > 0
              ? { scopeTags: { some: { row: { scopeType: { name: { in: scopeNames } } } } } }
              : {}),
            ...(locationWhere ?? {}),
            ...(dateFrom || dateTo
              ? {
                  createdAt: {
                    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                    ...(dateTo
                      ? { lte: new Date(new Date(dateTo).getTime() + 86399999) }
                      : {}),
                  },
                }
              : {}),
          }),
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      resolvedBy: { select: { id: true, name: true, email: true } },
      attachments: true,
      scopeTags: {
        include: {
          row: {
            select: {
              id: true,
              building: true,
              level: true,
              unit: true,
              scopeType: { select: { name: true } },
            },
          },
        },
      },
      subScopeTags: {
        include: {
          subScopeInstance: {
            include: {
              subScope: { select: { name: true } },
              row: { select: { id: true, scopeType: { select: { name: true } } } },
            },
          },
        },
      },
      responsiblePartyTags: { select: { partyCode: true }, orderBy: { id: "asc" } },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true } },
          attachments: {
            select: { id: true, mimeType: true, storageUrl: true, storageKey: true },
          },
        },
      },
    },
    orderBy: { createdAt: sortOrder === "newest" ? "desc" : "asc" },
  });

  if (issueIds.length > 0 && issues.length !== issueIds.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (issues.length === 0) {
    return NextResponse.json(
      { error: "No issues match the current filters." },
      { status: 404 },
    );
  }

  const normalizedCoverTitleLine = normalizePdfCoverTitleFromBody(bodyCoverTitleLine);
  const coverTitleLine =
    normalizedCoverTitleLine !== undefined
      ? normalizedCoverTitleLine
      : issueIds.length === 1
        ? `${projectName} — Issue`
        : issueIds.length > 1
          ? `${projectName} — Issues (${issueIds.length})`
          : undefined;

  try {
    const issuesForPdf = serializeIssuesResponsibleParties(issues).map((issue) => ({
      ...issue,
      issueType: issue.issueTypeCode,
      responsibleParty: issue.responsiblePartyCode,
    }));

    const pdfBuffer = await buildIssuesPdf({
      issues: issuesForPdf as unknown as IssueForPdf[],
      projectName,
      filterSummary,
      exportedAt: new Date(),
      ...(coverTitleLine !== undefined ? { coverTitleLine } : {}),
      pdfImageFetch: {
        cookieHeader: req.headers.get("cookie"),
        appOrigin: absoluteAppOriginFromRequest(req),
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="issues-${projectId}-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    return pdfGenerationFailedNextResponse("[export-pdf/issues]", err);
  }
}
