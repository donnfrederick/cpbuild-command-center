"use client";

/**
 * Client-only wrapper that mounts TourPicker and wires it to the
 * "tour-picker:open" CustomEvent dispatched from the TopBar graduation cap button.
 */

import { useSyncExternalStore, useState, useEffect } from "react";
import { TourPicker } from "./TourPicker";

function subscribe() {
  return () => {};
}

interface TourPickerWrapperProps {
  /** User's role code — used to filter tours to relevant ones */
  userRole?: string;
  isAdmin?: boolean;
}

export function TourPickerWrapper({ userRole, isAdmin }: TourPickerWrapperProps = {}) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    const onOpen = () => setIsOpen((prev) => !prev);
    window.addEventListener("tour-picker:open", onOpen);
    return () => window.removeEventListener("tour-picker:open", onOpen);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <TourPicker
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      userRole={userRole}
      isAdmin={isAdmin}
    />
  );
}
