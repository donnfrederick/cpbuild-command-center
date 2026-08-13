"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "@/i18n/navigation";

export type PendingProject = {
  id: string;
  projectName: string;
};

type NavigationPendingContextValue = {
  isPending: boolean;
  startNavigation: () => void;
  pendingProject: PendingProject | null;
  startProjectNavigation: (projectId: string, projectName: string) => void;
  clearProjectNavigation: () => void;
};

const NavigationPendingContext = createContext<NavigationPendingContextValue | null>(null);

export function isProjectWorkspacePath(pathname: string, projectId: string): boolean {
  return pathname === `/projects/${projectId}` || pathname.startsWith(`/projects/${projectId}/`);
}

export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeKey = pathname;
  const [pendingFromRoute, setPendingFromRoute] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<PendingProject | null>(null);

  // Invalidate pending UI when the route changes (including browser Back).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pathname is external navigation signal; reset stale pending flags
    setPendingFromRoute(null);
    setPendingTarget(null);
  }, [pathname]);

  const pendingProject =
    pendingTarget !== null && !isProjectWorkspacePath(pathname, pendingTarget.id)
      ? pendingTarget
      : null;

  const isPending = pendingFromRoute !== null && pendingFromRoute === routeKey;

  const startNavigation = useCallback(() => {
    setPendingFromRoute(routeKey);
  }, [routeKey]);

  const startProjectNavigation = useCallback((projectId: string, projectName: string) => {
    setPendingTarget({ id: projectId, projectName });
  }, []);

  const clearProjectNavigation = useCallback(() => {
    setPendingTarget(null);
  }, []);

  const value = useMemo(
    () => ({
      isPending,
      startNavigation,
      pendingProject,
      startProjectNavigation,
      clearProjectNavigation,
    }),
    [isPending, startNavigation, pendingProject, startProjectNavigation, clearProjectNavigation],
  );

  return (
    <NavigationPendingContext.Provider value={value}>
      {children}
    </NavigationPendingContext.Provider>
  );
}

export function useNavigationPending(): NavigationPendingContextValue {
  const ctx = useContext(NavigationPendingContext);
  if (!ctx) {
    throw new Error("useNavigationPending must be used within NavigationPendingProvider");
  }
  return ctx;
}

export function useOptionalNavigationPending(): NavigationPendingContextValue | null {
  return useContext(NavigationPendingContext);
}
