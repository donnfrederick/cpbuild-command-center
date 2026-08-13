"use client";

/**
 * TourContext — thin provider wrapper for the tour system.
 *
 * TourProvider is mounted at the dashboard layout level so that:
 *  - Tour state can be extended here in the future (cursor, speed, mock fetch)
 *  - The TourPlayer and sibling components share a common React subtree
 *
 * Today the provider is a transparent wrapper — all tour state lives in the
 * standalone TourPlayer component (which also handles "tour:request" events
 * dispatched by TourPicker). Future work will migrate state here.
 */

import { type ReactNode } from "react";

interface TourProviderProps {
  children: ReactNode;
}

export function TourProvider({ children }: TourProviderProps) {
  return <>{children}</>;
}
