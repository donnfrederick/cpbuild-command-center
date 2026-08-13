"use client";

import type { ReactNode } from "react";
import { AppPageSkeleton } from "@/components/navigation/app-page-skeleton";
import { useOptionalNavigationPending } from "@/components/navigation/navigation-pending-provider";

export function AppShellMain({ children }: { children: ReactNode }) {
  const navigationPending = useOptionalNavigationPending();
  const isPending = navigationPending?.isPending ?? false;

  if (isPending) {
    return <AppPageSkeleton />;
  }

  return <>{children}</>;
}
