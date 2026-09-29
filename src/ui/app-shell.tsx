import type { ReactNode } from "react";
import { NavLinks } from "./nav-links";
import { Wordmark } from "./wordmark";

/** App chrome: sticky header with top nav from md up, bottom tab bar on phones (safe-area aware). */
export function AppShell({ children }: { children: ReactNode }) {
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
          <nav aria-label="Main" className="hidden md:block">
            <NavLinks variant="top" />
          </nav>
        </div>
      </header>

      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
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
