import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { RetryButton } from "./RetryButton";

// Force static export so this page is pre-cached by the service worker at
// install time. Without this, the SW tries to fetch it on first install and
// may get an error if the server is busy, causing the fallback to fail and
// showing the browser's native "You're offline" page instead.
export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offline");
  return { title: t("title") };
}

/**
 * Offline fallback page — served by the service worker when a navigation
 * request fails (no network + page not in the runtime cache).
 *
 * Pre-cached at SW install time via `fallbacks.document` in next.config.ts.
 * Must not make any API calls or depend on network resources.
 */
export default async function OfflinePage() {
  const t = await getTranslations("offline");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
        <WifiOff size={32} className="text-neutral-400" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-neutral-900">{t("heading")}</h1>
        <p className="max-w-xs text-sm text-neutral-500">{t("body")}</p>
      </div>
      <RetryButton label={t("retry")} />
    </div>
  );
}
