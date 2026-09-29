import type { ReactNode } from "react";
import { PageMain } from "./page";

/** Long-form text page (privacy, terms): readable measure, calm type, tokens only. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <PageMain className="gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl leading-none font-extrabold md:text-5xl">{title}</h1>
        <p className="text-sm text-text-muted">Last updated {updated}</p>
      </header>
      <div className="flex flex-col gap-8 text-base leading-7">{children}</div>
    </PageMain>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-text-muted">{children}</ul>;
}
