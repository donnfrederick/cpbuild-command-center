import { redirect } from "next/navigation";

export default async function LogIssuesPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id, locale } = await params;
  redirect(`/${locale}/projects/${id}/field-reports`);
}
