/**
 * uploadInspectionMedia
 *
 * Before an inspection submission is persisted, stores any new photo/video
 * files in cc-offline-blobs (local-first). Upload happens during syncOne,
 * not on submit — so slow LTE never blocks the UI.
 */

import type { AnswersMap } from "@/components/forms/FormFillClient";
import type { CapturedMediaItem } from "@/components/forms/formTypes";
import {
  prepareInspectionMediaForSubmit,
  type UploadInspectionMediaResult,
} from "@/lib/inspections/inspection-media-blobs";

export type { UploadInspectionMediaResult };

/**
 * Walk every answer in the map and defer pending media files to blob store.
 */
export async function uploadInspectionMedia(answers: AnswersMap): Promise<AnswersMap> {
  const { answers: prepared } = await prepareInspectionMediaForSubmit(answers);
  return prepared;
}

export async function uploadInspectionMediaWithMeta(
  answers: AnswersMap,
): Promise<UploadInspectionMediaResult> {
  return prepareInspectionMediaForSubmit(answers);
}

/**
 * Strip the non-JSON-serializable `file` property from every CapturedMediaItem
 * in the answers map before the payload is stored. Keeps serverUrl, localUrl,
 * and pendingBlobId.
 */
export function sanitizeAnswersForStorage(answers: AnswersMap): AnswersMap {
  const result: AnswersMap = {};

  for (const [key, answer] of Object.entries(answers)) {
    let updated = { ...answer };

    if (updated.capturedFiles?.length) {
      updated = {
        ...updated,
        capturedFiles: updated.capturedFiles.map(({ file: _f, ...rest }) => rest as CapturedMediaItem),
      };
    }

    if (updated.deficiencies?.length) {
      updated = {
        ...updated,
        deficiencies: updated.deficiencies.map((def) => {
          if (!def.capturedFiles?.length) return def;
          return {
            ...def,
            capturedFiles: def.capturedFiles.map(({ file: _f, ...rest }) => rest as CapturedMediaItem),
          };
        }),
      };
    }

    if (updated.resolvedDeficiencies?.length) {
      updated = {
        ...updated,
        resolvedDeficiencies: updated.resolvedDeficiencies.map((def) => {
          let next = def;
          if (def.capturedFiles?.length) {
            next = {
              ...next,
              capturedFiles: def.capturedFiles.map(({ file: _f, ...rest }) => rest as CapturedMediaItem),
            };
          }
          if (def.resolutionCapturedFiles?.length) {
            next = {
              ...next,
              resolutionCapturedFiles: def.resolutionCapturedFiles.map(
                ({ file: _f, ...rest }) => rest as CapturedMediaItem,
              ),
            };
          }
          return next;
        }),
      };
    }

    result[key] = updated;
  }

  return result;
}
