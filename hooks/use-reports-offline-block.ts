"use client";

import { useCallback } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useOfflineStatus } from "@/hooks/use-offline-status";

/**
 * Reports require live API data — block nav taps while offline and show a toast
 * instead of letting the service worker serve the generic offline fallback page.
 */
export function useReportsOfflineBlock() {
  const { isOnline } = useOfflineStatus();
  const t = useTranslations("globalReports");

  const isReportsNavBlocked = !isOnline;

  const onReportsNavClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (isOnline) return;
      e.preventDefault();
      toast.info(t("offlineUnavailable"));
    },
    [isOnline, t],
  );

  return { isReportsNavBlocked, onReportsNavClick };
}
