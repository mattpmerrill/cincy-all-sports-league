"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Claims" },
  { href: "/admin/results", label: "Results" },
  { href: "/admin/members", label: "Members" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex gap-1 border-b border-line">
      {LINKS.map(({ href, label }) => {
        // Sport pages live under /admin/results/[sport], so the section stays highlighted there.
        const current = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              current
                ? "border-brand text-text"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
