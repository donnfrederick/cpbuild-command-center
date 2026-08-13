"use client";

import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { useLocale } from "next-intl";
import { Link, usePathname, getPathname } from "@/i18n/navigation";
import { useOptionalNavigationPending } from "@/components/navigation/navigation-pending-provider";
import {
  isSameRoutePathname,
  pathnameFromHref,
  shouldStartNavigation,
} from "@/components/navigation/should-start-navigation";

type IntlLinkProps = ComponentProps<typeof Link>;

export type NavLinkProps = IntlLinkProps & {
  children: ReactNode;
};

function NavLinkContent({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();

  return (
    <span
      style={{
        display: "contents",
        opacity: pending ? 0.7 : 1,
        transition: "opacity 120ms ease",
      }}
    >
      {children}
    </span>
  );
}

type GetPathnameHref = Parameters<typeof getPathname>[0]["href"];

function resolveTargetPathname(
  href: IntlLinkProps["href"],
  locale: string,
): string {
  if (typeof href === "string") return pathnameFromHref(href);

  if (
    typeof href === "object" &&
    href !== null &&
    "pathname" in href &&
    typeof href.pathname === "string"
  ) {
    return getPathname({
      locale,
      href: {
        pathname: href.pathname,
        ...("query" in href && href.query ? { query: href.query } : {}),
      } as GetPathnameHref,
    });
  }

  return "/";
}

export function NavLink({ href, onClick, prefetch = true, children, ...rest }: NavLinkProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const navigationPending = useOptionalNavigationPending();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (!navigationPending) return;
    if (!shouldStartNavigation(event)) return;

    const targetPathname = resolveTargetPathname(href, locale);
    if (pathname === targetPathname || isSameRoutePathname(pathname, targetPathname)) return;

    navigationPending.startNavigation();
  };

  return (
    <Link href={href} prefetch={prefetch} onClick={handleClick} {...rest}>
      <NavLinkContent>{children}</NavLinkContent>
    </Link>
  );
}
