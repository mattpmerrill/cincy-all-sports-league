import type { ReactNode } from "react";
import { NavLinks } from "./nav-links";
import { SiteFooter } from "./site-footer";
import { Wordmark } from "./wordmark";

/**
 * App chrome: sticky header with top nav from md up, bottom tab bar on phones (safe-area aware).
 * `headerAction` is a slot at the header's right edge, filled by the layout (ui can't import features).
 */
export function AppShell({
  children,
  headerAction,
}: {
  children: ReactNode;
  headerAction?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-brand"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Wordmark />
          <div className="flex items-center gap-3">
            <nav aria-label="Main" className="hidden md:block">
              <NavLinks variant="top" />
            </nav>
            {headerAction}
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
        <SiteFooter />
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <NavLinks variant="bar" />
      </nav>
    </div>
  );
}
