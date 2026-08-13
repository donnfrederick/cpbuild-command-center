"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X, LayoutDashboard, FolderKanban, Users, Settings } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

export function MobileMenu() {
  const t = useTranslations("nav");
  const tApp = useTranslations("app");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { labelKey: "dashboard" as const, href: "/", icon: LayoutDashboard, exact: true },
    { labelKey: "projects" as const, href: "/projects", icon: FolderKanban, exact: false },
    { labelKey: "users" as const, href: "/users", icon: Users, exact: false },
    { labelKey: "settings" as const, href: "/settings", icon: Settings, exact: true },
  ];

  return (
    <>
      {/* Hamburger — only shown on mobile */}
      <button
        className="md:hidden flex items-center justify-center"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--radius-sm)",
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Menu style={{ width: "var(--icon-size)", height: "var(--icon-size)", color: "var(--neutral-700)" }} />
      </button>

      {/* Drawer overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <nav
            className="fixed top-0 left-0 bottom-0 z-50 flex flex-col"
            style={{
              width: "var(--nav-width)",
              backgroundColor: "var(--neutral-0)",
              borderRight: "1px solid var(--neutral-300)",
            }}
            aria-label={t("mobileNav")}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between border-b"
              style={{ padding: "var(--space-4)", borderColor: "var(--neutral-300)", height: 64 }}
            >
              <h3 style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-semibold)", color: "var(--neutral-900)", margin: 0 }}>
                {tApp("brand")}
              </h3>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("closeMenu")}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <X style={{ width: "var(--icon-size)", height: "var(--icon-size)", color: "var(--neutral-700)" }} />
              </button>
            </div>

            {/* Nav items */}
            <div style={{ flex: 1, padding: "var(--space-2)" }}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="w-full flex items-center gap-3 transition-colors duration-150"
                    style={{
                      padding: "var(--space-2) var(--space-4)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: isActive ? "var(--primary-100)" : "transparent",
                      color: isActive ? "var(--primary-700)" : "var(--neutral-700)",
                      fontSize: "var(--text-body)",
                      fontWeight: "var(--font-weight-medium)",
                      marginBottom: "var(--space-1)",
                      textDecoration: "none",
                      display: "flex",
                    }}
                  >
                    <Icon style={{ width: "var(--icon-size)", height: "var(--icon-size)" }} />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
