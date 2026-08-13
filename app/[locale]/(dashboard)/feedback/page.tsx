import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { FeedbackInbox } from "@/components/feedback/FeedbackInbox";
import { Loader2 } from "lucide-react";

export async function generateMetadata() {
  const t = await getTranslations("feedback");
  return { title: `${t("pageTitle")} — CP Build` };
}

function InboxFallback() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-(--neutral-400)" aria-hidden />
    </div>
  );
}

export default async function FeedbackPage() {
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
  const t = await getTranslations("feedback");

  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-24 sm:p-6 sm:pb-6"
      style={{ color: "var(--neutral-900)" }}
    >
      <div>
        <h1
          style={{
            fontSize: "var(--text-heading)",
            fontWeight: "var(--font-weight-semibold)",
            margin: 0,
            marginBottom: "var(--space-1)",
          }}
        >
          {t("pageTitle")}
        </h1>
        <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", margin: 0 }}>
          {canTriage ? t("adminSubtitle") : t("memberSubtitle")}
        </p>
      </div>

      <Suspense fallback={<InboxFallback />}>
        <FeedbackInbox locale={locale} currentUserId={effective.user.id} canTriage={canTriage} />
      </Suspense>
    </div>
  );
}
