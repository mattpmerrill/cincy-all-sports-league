"use client";

import { ArrowLeftRight, BookOpenText, LayoutGrid, MessageSquare, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "cn";

const TABS = [
  { href: "/", label: "Standings", icon: Trophy, match: ["/", "/teams"] },
  { href: "/feed", label: "Feed", icon: MessageSquare, match: ["/feed"] },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight, match: ["/trades"] },
  { href: "/sports", label: "Sports", icon: LayoutGrid, match: ["/sports"] },
  { href: "/rules", label: "Rules", icon: BookOpenText, match: ["/rules"] },
] as const;

export type TabHref = (typeof TABS)[number]["href"];

/** Per-tab decoration (a count, a dot), filled by the layout because ui can't import features. */
export type NavBadges = Partial<Record<TabHref, ReactNode>>;

const isActive = (pathname: string, match: readonly string[]) =>
  match.some((m) =>
    m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`),
  );

/** Main navigation: a bottom tab bar on phones, inline links from md up. */
export function NavLinks({ variant, badges }: { variant: "bar" | "top"; badges?: NavBadges }) {
  const pathname = usePathname();
  return (
    <ul className={cn("flex", variant === "bar" ? "items-stretch justify-around" : "gap-1")}>
      {TABS.map(({ href, label, icon: Icon, match }) => {
        const current = isActive(pathname, match);
        return (
          <li key={href} className={variant === "bar" ? "flex-1" : undefined}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                variant === "bar"
                  ? "relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold"
                  : "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
                current
                  ? variant === "bar"
                    ? "text-brand-bright"
                    : "bg-surface-raised text-brand-bright"
                  : "text-text-muted hover:text-text",
              )}
            >
              {variant === "bar" && current ? (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-brand shadow-glow-brand"
                />
              ) : null}
              <span className="relative inline-flex">
                <Icon aria-hidden="true" className={variant === "bar" ? "size-5" : "size-4"} />
                {variant === "bar" && badges?.[href] ? (
                  <span className="absolute -top-2 left-full -ml-2">{badges[href]}</span>
                ) : null}
              </span>
              {label}
              {variant === "top" ? badges?.[href] : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
