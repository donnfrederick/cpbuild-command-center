"use client";

import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

export default function LogLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const t = useTranslations("projects");

  // Show the back header only on sub-pages still nested under Reports hub — not Inspections (bottom nav tab).
  const isSubPage =
    pathname.includes("/log/activity") ||
    pathname.includes("/log/issues") ||
    pathname.includes("/log/observations");

  return (
    <>
      <style>{`
        @media (min-width: 768px) {
          .log-back-header {
            display: none !important;
          }
        }
      `}</style>
      {/* Back-to-Reports button — mobile only; desktop uses the side nav. */}
      {isSubPage && (
        <div
          className="log-back-header"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "10px 16px 2px",
            flexShrink: 0,
          }}
        >
          <Link
            href={`/projects/${params.id}/log` as Parameters<typeof Link>[0]["href"]}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 14,
              fontWeight: 500,
              color: "var(--primary-600)",
              textDecoration: "none",
            }}
          >
            <ChevronLeft size={16} aria-hidden />
            {t("logBack")}
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
