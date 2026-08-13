"use client";

import { useMemo } from "react";
import { createTranslator, useLocale } from "next-intl";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";

/**
 * `units` namespace strings from checked-in JSON. Use this instead of
 * `useTranslations("units")` on the locations page so copy (banner, filters, etc.)
 * still resolves when the client provider payload is incomplete (raw keys like
 * `units.postBulkBannerWithScopes`.
 */
export function useUnitsTranslator() {
  const locale = useLocale();
  return useMemo(() => {
    const raw = locale === "es" ? esMessages : enMessages;
    // Pass only the units slice so the translator object doesn't hold the full message bundle.
    const messages = { units: raw.units };
    return createTranslator({ locale, messages, namespace: "units" });
  }, [locale]);
}
