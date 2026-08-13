import { FormFillLoader } from "@/components/forms/FormFillClient";

export async function generateMetadata() {
  return { title: "Preview — CP Build" };
}

/**
 * Inspector-facing form preview.
 *
 * Intentionally lives OUTSIDE the `(dashboard)` route group so it renders
 * without the dashboard shell (sidebar, top bar, offline provider, tour
 * player, dev tools, auth redirect, etc.). That buys us:
 *
 *   - Fast load (no session lookup, no heavy layout hydration).
 *   - Honest simulation of what an inspector sees in the field, without
 *     internal CP Build chrome leaking into the preview.
 *
 * The form itself is loaded client-side from the browser-local store — when
 * Phil wires the real API, this page becomes the place to do a server-side
 * fetch of the published template and hand it straight to FormFillClient.
 */
export default async function PreviewFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormFillLoader id={id} />;
}
