import type { Metadata, Viewport } from "next";
import { Inter, Barlow_Condensed } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { SkipLink } from "@/components/shared/SkipLink";
import { RouteAnnouncer } from "@/components/shared/RouteAnnouncer";
import { DevSwCleanup } from "@/components/shared/DevSwCleanup";
import {
  DEV_SW_EARLY_CLEANUP_INLINE_SCRIPT,
  shouldInjectDevSwEarlyCleanup,
} from "@/lib/dev-sw-early-cleanup-inline-script";
import {
  getDesignTokenOverrides,
  buildInlineTokenCSS,
} from "@/lib/design-tokens-server";
// Initialize dev log interceptor on first server render (dev only, no-op in prod)
import "@/lib/dev-logger";
import "./globals.css";

// Design system specifies Inter (DESIGN_SYSTEM.md §2 Type Scale)
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Condensed font for the Field Tracker wordmark
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-condensed",
});

export const viewport: Viewport = {
  themeColor: "#1D4ED8",
  viewportFit: "cover",
  // Prevent iOS Safari from zooming in when a text input is focused.
  // Without this, any input with font-size < 16px triggers auto-zoom.
  // minimumScale=1 + maximumScale=1 stops zoom; userScalable=false is a
  // belt-and-suspenders addition that iOS respects in PWA (standalone) mode.
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "CP Build Field Tracker",
  description: "Field tracking and project management platform for CP Build",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Field Tracker",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const snapshot = await getDesignTokenOverrides();
  const inlineTokenCSS = buildInlineTokenCSS(snapshot.overrides);
  const { headers } = await import("next/headers");
  const locale = (await headers()).get("x-next-intl-locale") ?? "en";
  const injectDevSwEarlyCleanup = shouldInjectDevSwEarlyCleanup();

  return (
    <html lang={locale} className={`${inter.variable} ${barlowCondensed.variable}`} suppressHydrationWarning>
      <head>
        {injectDevSwEarlyCleanup ? (
          <script
            id="dev-sw-early-cleanup"
            dangerouslySetInnerHTML={{ __html: DEV_SW_EARLY_CLEANUP_INLINE_SCRIPT }}
          />
        ) : null}
      </head>
      <body className="antialiased bg-background text-foreground" suppressHydrationWarning>
        {inlineTokenCSS && <style dangerouslySetInnerHTML={{ __html: inlineTokenCSS }} />}
        <ThemeProvider>
          <SkipLink />
          <RouteAnnouncer />
          {children}
          <Toaster richColors position="bottom-right" />
          {process.env.NODE_ENV === "development" && <DevSwCleanup />}
        </ThemeProvider>
      </body>
    </html>
  );
}
