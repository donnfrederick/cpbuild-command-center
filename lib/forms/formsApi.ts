/**
 * API-backed forms client — replaces lib/forms/formsStore.ts.
 *
 * Returns data in the same shape as the old store so that UI components
 * can swap the import with minimal changes. All data now lives in the
 * database; localStorage is no longer used for forms.
 */

import type { FormTemplate, FormSection, InspectionCategory, FormPurpose } from "@/components/forms/formTypes";
import { normalizeFormPurpose } from "@/components/forms/formTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

/** DB-backed version of the old StoredForm. */
export interface StoredForm {
  id: string;
  template: FormTemplate;
  createdAt: string;
  updatedAt: string;
}

interface ApiVersion {
  id: string;
  versionNumber: number;
  sections?: unknown;
  publishedAt?: string;
}

interface ApiForm {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED";
  level: string;
  category: string;
  purpose?: string;
  scopeTypeCodes: string[];
  draftSections: unknown | null;
  createdAt: string;
  updatedAt: string;
  versions: ApiVersion[];
  createdBy?: { id: string; name: string | null } | null;
  _count?: { submissions: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readFormsApiError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as {
      error?: string;
      details?: { fieldErrors?: Record<string, string[] | undefined> };
    };
    if (typeof data.error === "string" && data.error.length > 0) {
      const fieldErrors = data.details?.fieldErrors;
      if (fieldErrors) {
        for (const [field, messages] of Object.entries(fieldErrors)) {
          const first = messages?.find((m) => m.trim().length > 0);
          if (first) {
            return `${data.error}: ${field} — ${first} (${res.status})`;
          }
        }
      }
      return `${data.error} (${res.status})`;
    }
  } catch {
    // ignore JSON parse failures
  }
  return `Request failed (${res.status})`;
}

function apiFormToStoredForm(form: ApiForm): StoredForm {
  const latestVersion = form.versions[0];
  // For display/edit: prefer draftSections (always up to date); fall back to
  // the latest published version sections; finally seed one blank section so
  // the builder always opens in bare mode with something to type into.
  const savedSections =
    (form.draftSections as FormSection[] | null) ??
    (latestVersion?.sections as FormSection[] | null);

  const sections: FormSection[] =
    savedSections && savedSections.length > 0
      ? savedSections
      : [{ id: crypto.randomUUID(), title: "", questions: [] }];

  const template: FormTemplate = {
    id: form.id,
    name: form.name,
    description: form.description ?? "",
    status: form.status === "PUBLISHED" ? "published" : "draft",
    level: form.level as FormTemplate["level"],
    category: form.category as InspectionCategory,
    formPurpose: normalizeFormPurpose(form.purpose) as FormPurpose,
    scopeTypeCodes: form.scopeTypeCodes,
    sections,
    versionNumber: latestVersion?.versionNumber,
    latestVersionId: latestVersion?.id,
  };

  return {
    id: form.id,
    template,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** All forms, most-recently-updated first. */
export async function listForms(): Promise<StoredForm[]> {
  const res = await fetch("/api/forms", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to list forms: ${res.status}`);
  const data = (await res.json()) as { forms: ApiForm[] };
  return data.forms.map(apiFormToStoredForm);
}

/** Published forms only — used by the inspection picker. */
export interface PublishedFormsResult {
  forms: StoredForm[];
  isFromCache: boolean;
}

export async function listPublishedForms(): Promise<PublishedFormsResult> {
  const fromSnapshot = async (): Promise<PublishedFormsResult | null> => {
    const { readSnapshotModule } = await import("@/lib/offline/snapshot-cache");
    const cached = await readSnapshotModule<ApiForm[]>("published-forms");
    if (!cached?.data) return null;
    return {
      forms: cached.data.map(apiFormToStoredForm),
      isFromCache: true,
    };
  };

  try {
    const res = await fetch("/api/forms?status=published", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Failed to list published forms: ${res.status}`);
    }
    if (!res.ok) {
      const cached = await fromSnapshot();
      if (cached) return cached;
      throw new Error(`Failed to list published forms: ${res.status}`);
    }
    const data = (await res.json()) as { forms: ApiForm[] };
    return { forms: data.forms.map(apiFormToStoredForm), isFromCache: false };
  } catch (err) {
    if (err instanceof Error && /: (401|403)$/.test(err.message)) {
      throw err;
    }
    const cached = await fromSnapshot();
    if (cached) return cached;
    throw err;
  }
}

/** Fetch a single form by id. */
export async function getForm(id: string): Promise<StoredForm | null> {
  const fromSnapshot = async (): Promise<StoredForm | null> => {
    const { readSnapshotModule } = await import("@/lib/offline/snapshot-cache");
    const cached = await readSnapshotModule<ApiForm[]>("published-forms");
    const match = cached?.data?.find((form) => form.id === id);
    return match ? apiFormToStoredForm(match) : null;
  };

  try {
    const res = await fetch(`/api/forms/${id}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) {
      const cached = await fromSnapshot();
      if (cached) return cached;
      throw new Error(`Failed to get form: ${res.status}`);
    }
    const data = (await res.json()) as { form: ApiForm };
    return apiFormToStoredForm(data.form);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Failed to get form:")) {
      throw err;
    }
    return fromSnapshot();
  }
}

/** Create a new draft form. Returns the newly created StoredForm. */
export async function createForm(setup: {
  name: string;
  description?: string;
  level: "scope" | "unit" | "project";
  category: string;
  formPurpose?: FormPurpose;
  scopeTypeCodes: string[];
}): Promise<StoredForm> {
  const res = await fetch("/api/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(setup),
  });
  if (!res.ok) throw new Error(`Failed to create form: ${res.status}`);
  const data = (await res.json()) as { form: ApiForm };
  return apiFormToStoredForm(data.form);
}

/**
 * Save setup metadata only (purpose, level, category, scope tags).
 * Does not re-sync draft sections — use for FormSetupModal edits.
 */
export async function saveFormSetup(
  id: string,
  setup: {
    formPurpose: FormPurpose;
    level: FormTemplate["level"];
    category: string;
    scopeTypeCodes: string[];
  },
): Promise<StoredForm> {
  const res = await fetch(`/api/forms/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      formPurpose: setup.formPurpose,
      level: setup.level,
      category: setup.category,
      scopeTypeCodes: setup.scopeTypeCodes,
    }),
  });
  if (!res.ok) throw new Error(await readFormsApiError(res));
  const data = (await res.json()) as { form: ApiForm };
  return apiFormToStoredForm(data.form);
}

/**
 * Save draft sections. Replaces localStorage upsertForm() for drafts.
 * Pass the full FormTemplate; name/description and sections are all persisted.
 */
export async function saveFormDraft(id: string, template: FormTemplate): Promise<StoredForm> {
  const trimmedName = template.name.trim();
  const res = await fetch(`/api/forms/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(trimmedName.length > 0 && { name: trimmedName }),
      description: template.description || null,
      level: template.level,
      category: template.category,
      formPurpose: normalizeFormPurpose(template.formPurpose),
      scopeTypeCodes: template.scopeTypeCodes,
      draftSections: template.sections,
    }),
  });
  if (!res.ok) throw new Error(await readFormsApiError(res));
  const data = (await res.json()) as { form: ApiForm };
  return apiFormToStoredForm(data.form);
}

/** Publish a draft form (creates FormVersion v1 or increments). */
export async function publishForm(id: string): Promise<StoredForm> {
  const res = await fetch(`/api/forms/${id}/publish`, { method: "POST" });
  if (!res.ok) throw new Error(await readFormsApiError(res));
  const data = (await res.json()) as { form: ApiForm };
  return apiFormToStoredForm(data.form);
}

/** Unpublish a published form (moves back to DRAFT). */
export async function unpublishForm(id: string): Promise<StoredForm> {
  const res = await fetch(`/api/forms/${id}/unpublish`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to unpublish form: ${res.status}`);
  const data = (await res.json()) as { form: ApiForm };
  return apiFormToStoredForm(data.form);
}

/**
 * Save a new published version from edit mode.
 * Called from the edit-mode UX after the user finishes making changes
 * to a published form. Creates a new immutable FormVersion.
 */
export async function saveFormVersion(id: string, sections: FormSection[]): Promise<StoredForm> {
  const res = await fetch(`/api/forms/${id}/save-version`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });
  if (!res.ok) throw new Error(await readFormsApiError(res));
  const data = (await res.json()) as { form: ApiForm };
  return apiFormToStoredForm(data.form);
}

/** Permanently delete a form (and all its versions via cascade). */
export async function deleteForm(id: string): Promise<void> {
  const res = await fetch(`/api/forms/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete form: ${res.status}`);
}
