"use client";

import FormBuilderClient from "./FormBuilderClient";

/**
 * Client-side wrapper around FormBuilderClient used by the /forms/[id]/edit
 * route. Delegates all loading and state management to FormBuilderClient, which
 * now fetches from the API directly.
 *
 * For PUBLISHED forms, isPublishedEditMode=true activates the edit-mode banner
 * and changes the save action to "Save new version" (creates a new FormVersion).
 * For DRAFT forms, the normal auto-save flow is used.
 *
 * The `status` prop is passed from the server page so we don't have to wait
 * for the client fetch to decide which mode to enter.
 */
export function FormEditClient({
  id,
  isPublishedEditMode,
}: {
  id: string;
  isPublishedEditMode: boolean;
}) {
  return (
    <FormBuilderClient
      formId={id}
      isPublishedEditMode={isPublishedEditMode}
    />
  );
}
