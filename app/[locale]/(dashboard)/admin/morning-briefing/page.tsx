import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";
import { isAIEnabled } from "@/lib/ai/gemini";
import { MorningBriefingClient } from "@/components/admin/MorningBriefingClient";

export async function generateMetadata() {
  const t = await getTranslations("morningBriefing");
  return { title: `${t("title")} — CP Build` };
}

export default async function MorningBriefingPage() {
  const locale = await getLocale();
  const session = await getSession();

  if (!session?.user) redirect(`/${locale}/login`);

  if (!hasPermission(session.user.role, PERMISSIONS.VIEW_MORNING_BRIEFING)) {
    redirect(`/${locale}`);
  }

  const aiEnabled = isAIEnabled();

  return <MorningBriefingClient aiEnabled={aiEnabled} />;
}
