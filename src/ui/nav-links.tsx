"use client";

import { BookOpenText, LayoutGrid, Trophy, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { href: "/", label: "Standings", icon: Trophy, match: ["/", "/teams"] },
  { href: "/sports", label: "Sports", icon: LayoutGrid, match: ["/sports"] },
  { href: "/rules", label: "Rules", icon: BookOpenText, match: ["/rules"] },
  { href: "/me", label: "Me", icon: UserRound, match: ["/me", "/admin", "/login", "/signup"] },
] as const;

const isActive = (pathname: string, match: readonly string[]) =>
  match.some((m) =>
    m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`),
  );

/** Main navigation: a bottom tab bar on phones, inline links from md up. */
export function NavLinks({ variant }: { variant: "bar" | "top" }) {
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
                    ? "text-brand"
                    : "bg-surface-raised text-brand"
                  : "text-text-muted hover:text-text",
              )}
            >
              {variant === "bar" && current ? (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-brand shadow-glow-brand"
                />
              ) : null}
              <Icon aria-hidden="true" className={variant === "bar" ? "size-5" : "size-4"} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
