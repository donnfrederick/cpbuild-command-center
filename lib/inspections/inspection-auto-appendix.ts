import type { Prisma } from "@prisma/client";
import { AUTO_MEDIA_KEY, AUTO_NOTES_KEY } from "@/components/forms/formTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Inspector notes / media keys stored outside relational answer rows. */
export function extractInspectionAutoAppendix(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  const out: Record<string, unknown> = {};
  if (AUTO_NOTES_KEY in payload) out[AUTO_NOTES_KEY] = payload[AUTO_NOTES_KEY];
  if (AUTO_MEDIA_KEY in payload) out[AUTO_MEDIA_KEY] = payload[AUTO_MEDIA_KEY];
  return out;
}

/** Merge auto appendix from raw submission JSON into a hydrated answers map. */
export function mergeInspectionAutoAppendix(
  base: Record<string, unknown>,
  rawSubmissionPayload: unknown,
): Record<string, unknown> {
  const appendix = extractInspectionAutoAppendix(rawSubmissionPayload);
  if (Object.keys(appendix).length === 0) return base;
  return { ...base, ...appendix };
}

type SubmissionWriteClient = {
  inspectionSubmission: {
    update: (args: {
      where: { id: string };
      data: { payload: Prisma.InputJsonValue };
    }) => Promise<unknown>;
  };
};

/** Persist inspector notes/media appendix on the submission JSON column (relational answers omit these keys). */
export async function persistInspectionAutoAppendix(
  client: SubmissionWriteClient,
  submissionId: string,
  payload: unknown,
): Promise<void> {
  const appendix = extractInspectionAutoAppendix(payload);
  if (Object.keys(appendix).length === 0) return;
  await client.inspectionSubmission.update({
    where: { id: submissionId },
    data: { payload: appendix as Prisma.InputJsonValue },
  });
}
