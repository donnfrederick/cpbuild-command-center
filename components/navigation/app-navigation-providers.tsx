"use client";

import { Suspense, type ReactNode } from "react";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending-provider";
import { RouteFetchProvider } from "@/components/navigation/route-fetch-provider";
import { ProjectNavigationTransition } from "@/components/projects/ProjectNavigationTransition";

function RouteFetchProviderBoundary({ children }: { children: ReactNode }) {
  return <RouteFetchProvider>{children}</RouteFetchProvider>;
}

export function AppNavigationProviders({ children }: { children: ReactNode }) {
  return (
    <NavigationPendingProvider>
      <ProjectNavigationTransition />
      <Suspense fallback={children}>
        <RouteFetchProviderBoundary>{children}</RouteFetchProviderBoundary>
      </Suspense>
    </NavigationPendingProvider>
  );
}
