import { redirect } from "next/navigation";

// New form creation is now handled by the FormSetupModal on /forms.
// This route no longer has a standalone builder — redirect to the list page.
export default function NewFormPage() {
  redirect("/forms");
}
