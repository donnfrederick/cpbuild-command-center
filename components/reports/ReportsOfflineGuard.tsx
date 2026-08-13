"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useOfflineStatus } from "@/hooks/use-offline-status";

/**
 * Redirects away from /reports/* when the browser is offline (e.g. user was
 * already on a report when connectivity dropped). Complements nav click blocking
 * in MobileBottomNav and ReportsNavSection.
 */
export function ReportsOfflineGuard({ children }: { children: React.ReactNode }) {
  const { isOnline } = useOfflineStatus();
  const router = useRouter();
  const t = useTranslations("globalReports");
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (isOnline) {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    toast.info(t("offlineUnavailable"));
    router.replace("/projects");
  }, [isOnline, router, t]);

  if (!isOnline) return null;
  return children;
}
