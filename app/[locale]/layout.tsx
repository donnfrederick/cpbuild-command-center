import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { routing } from "@/i18n/routing";
import { TourProvider } from "@/components/tour/TourContext";
import { TourPlayer } from "@/components/tour/TourPlayer";
import { NewDeployTourTrigger } from "@/components/tour/NewDeployTourTrigger";
import { TourDeepLinkHandler } from "@/components/tour/TourDeepLinkHandler";
import { FeedbackRecordingProvider } from "@/components/feedback/FeedbackRecordingContext";
import { OfflineSyncRoot } from "@/components/layout/OfflineSyncRoot";
import { AppNavigationProviders } from "@/components/navigation/app-navigation-providers";
import { TOUR_USER_UI_ENABLED } from "@/lib/tour-user-ui";
type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {/*
        TourProvider + TourPlayer live here — outside both (dashboard) and (project)
        route groups — so the tour overlay survives layout-boundary navigations
        (e.g. /projects list → /projects/[id] workspace use different route groups).
      */}
      <TourProvider>
        {/*
          FeedbackRecordingProvider lives here — outside both (dashboard) and
          (project) route groups — so the floating pill and recording blob
          survive layout-boundary navigations (same reason TourPlayer is here).
        */}
        <FeedbackRecordingProvider>
          <OfflineSyncRoot>
            <AppNavigationProviders>{children}</AppNavigationProviders>
          </OfflineSyncRoot>
        </FeedbackRecordingProvider>
        <Suspense fallback={null}>
          {TOUR_USER_UI_ENABLED ? <TourDeepLinkHandler /> : null}
        </Suspense>
        <TourPlayer />
        {TOUR_USER_UI_ENABLED ? <NewDeployTourTrigger /> : null}
      </TourProvider>
    </NextIntlClientProvider>
  );
}
