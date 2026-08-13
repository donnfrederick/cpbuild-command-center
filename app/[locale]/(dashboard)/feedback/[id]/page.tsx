import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { FeedbackDetailPageClient } from "@/components/feedback/FeedbackDetailPageClient";
import { parseFeedbackEnvironmentParam } from "@/lib/feedback-environment";

export async function generateMetadata() {
  const t = await getTranslations("feedback");
  return { title: `${t("detailPageTitle")} — CP Build` };
}

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ environment?: string }>;
};

export default async function FeedbackDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const initialEnvironment = parseFeedbackEnvironmentParam(sp.environment ?? null);
  const locale = await getLocale();

  const effective = await getEffectiveSession();

  if (!effective?.user) {
    redirect(`/${locale}/login`);
  }

  const canTriage = hasPermission(
    effective.user.role,
    PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX,
    effective.user.specialPermissions
  );

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 pb-24 sm:p-6 sm:pb-6"
      style={{ color: "var(--neutral-900)" }}
    >
      <FeedbackDetailPageClient
        feedbackId={id}
        locale={locale}
        currentUserId={effective.user.id}
        canTriage={canTriage}
        initialEnvironment={initialEnvironment}
      />
    </div>
  );
}
