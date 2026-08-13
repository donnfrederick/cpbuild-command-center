/**
 * Discover in-progress live inspection drafts for resume shortcuts.
 */

import type { FormTemplate } from "@/components/forms/formTypes";
import type { StoredForm } from "@/lib/forms/formsApi";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";
import {
  listDraftsForScope,
  listDraftsForUnit,
} from "@/lib/inspections/inspectionDraftDb";

export interface ListResumableLiveDraftsInput {
  projectId: string;
  unitId: string;
  scopeRowId?: string;
  category?: string;
}

export async function listResumableLiveDrafts(
  input: ListResumableLiveDraftsInput,
): Promise<InspectionDraft[]> {
  const raw = input.scopeRowId
    ? await listDraftsForScope(input.scopeRowId)
    : await listDraftsForUnit(input.unitId);

  return raw
    .filter((draft) => {
      if (draft.kind !== "live") return false;
      if (draft.projectId !== input.projectId) return false;
      if (draft.unitId !== input.unitId) return false;
      if (input.scopeRowId) {
        if (draft.scopeRowId !== input.scopeRowId) return false;
      } else if (draft.scopeRowId) {
        return false;
      }
      if (input.category && draft.categorySnapshot !== input.category) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function draftToStoredForm(draft: InspectionDraft): StoredForm {
  const template = draft.templateSnapshot as FormTemplate;
  return {
    id: draft.formId,
    template: {
      ...template,
      id: draft.formId,
      category: (draft.categorySnapshot || template.category) as FormTemplate["category"],
    },
    createdAt: draft.updatedAt,
    updatedAt: draft.updatedAt,
  };
}
