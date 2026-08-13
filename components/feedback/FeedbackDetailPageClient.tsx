"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  FeedbackDetailView,
  type FeedbackReport,
} from "@/components/feedback/FeedbackDetailView";
import type { FeedbackEnvironment } from "@/lib/feedback-environment";

export interface FeedbackDetailPageClientProps {
  feedbackId: string;
  locale: string;
  currentUserId: string;
  canTriage: boolean;
  initialEnvironment: FeedbackEnvironment | null;
}

function detailQuery(environment: FeedbackEnvironment | null): string {
  if (environment === "production") return "?environment=production";
  if (environment === "development") return "?environment=development";
  return "";
}

export function FeedbackDetailPageClient({
  feedbackId,
  locale,
  currentUserId,
  canTriage,
  initialEnvironment,
}: FeedbackDetailPageClientProps) {
  const t = useTranslations("feedback");
  const router = useRouter();
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setFailed(false);
    try {
      const q = detailQuery(initialEnvironment);
      const res = await fetch(`/api/feedback/${encodeURIComponent(feedbackId)}${q}`);
      if (res.status === 404) {
        setNotFound(true);
        setReport(null);
        return;
      }
      if (!res.ok) {
        toast.error(t("loadFailed"));
        setFailed(true);
        setReport(null);
        return;
      }
      const data = (await res.json()) as FeedbackReport;
      setReport(data);
    } catch {
      toast.error(t("loadFailed"));
      setFailed(true);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [feedbackId, initialEnvironment, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--neutral-400)]" aria-hidden />
      </div>
    );
  }

  if (notFound || failed || !report) {
    return (
      <div
        className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 rounded-xl border border-[var(--neutral-200)] bg-white p-8 text-center shadow-sm"
        style={{ color: "var(--neutral-900)" }}
      >
        <p className="text-sm text-[var(--neutral-600)]">
          {failed ? t("loadFailed") : t("detailNotFound")}
        </p>
        <Link
          href="/feedback"
          className="text-sm font-medium text-[var(--primary-600)] underline hover:text-[var(--primary-700)]"
        >
          {t("backToInbox")}
        </Link>
      </div>
    );
  }

  return (
    <FeedbackDetailView
      variant="page"
      report={report}
      locale={locale}
      canTriage={canTriage}
      currentUserId={currentUserId}
      onUpdate={load}
      onRequestClose={() => {
        router.push("/feedback");
      }}
    />
  );
}
