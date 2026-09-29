import * as React from "react";
import { cn } from "cn";

/** The main landmark for a screen: consistent width and gutters. */
function PageMain({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      className={cn("mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8", className)}
      {...props}
    />
  );
}

function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl leading-none font-extrabold">{title}</h1>
        {description ? <p className="text-text-muted">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}

/** A section with a heading, for grouping content inside a page. */
function PageSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">{title}</h2>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Shown when a list has nothing in it. */
function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="text-sm text-text-muted">{description}</p> : null}
    </div>
  );
}

export { PageMain, PageHeader, PageSection, EmptyState };
