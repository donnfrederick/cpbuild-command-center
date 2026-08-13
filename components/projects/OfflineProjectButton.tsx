"use client";

/**
 * OfflineProjectButton — per-project offline state machine button.
 *
 * localStorage-backed prefs cannot participate in SSR hydration. The interactive
 * client chunk is loaded with next/dynamic (ssr: false); server + hydration pass
 * render OfflineProjectButtonPlaceholder only via the loading component.
 */

import dynamic from "next/dynamic";
import { OfflineProjectButtonPlaceholder } from "@/components/projects/OfflineProjectButtonPlaceholder";
import type { OfflineProjectButtonProps } from "@/components/projects/OfflineProjectButtonClient";

const ClientCompact = dynamic(
  () =>
    import("./OfflineProjectButtonClient").then((mod) => mod.OfflineProjectButtonClient),
  {
    ssr: false,
    loading: () => <OfflineProjectButtonPlaceholder compact />,
  },
);

const ClientFull = dynamic(
  () =>
    import("./OfflineProjectButtonClient").then((mod) => mod.OfflineProjectButtonClient),
  {
    ssr: false,
    loading: () => <OfflineProjectButtonPlaceholder compact={false} />,
  },
);

export function OfflineProjectButton({ compact = false, ...props }: OfflineProjectButtonProps) {
  const Client = compact ? ClientCompact : ClientFull;
  return <Client {...props} compact={compact} />;
}
