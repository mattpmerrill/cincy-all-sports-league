import Link from "next/link";

/** Quiet footer on every page. The shell's bottom padding keeps it clear of the phone tab bar. */
export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 pt-4 pb-6 text-xs text-text-muted">
      <Link href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
        Privacy
      </Link>
      <Link href="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
        Terms
      </Link>
    </footer>
  );
}
