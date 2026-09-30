import * as React from "react";
import { cn } from "cn";

/**
 * The main landmark for a screen: consistent width and gutters. `wide` suits grids and tables.
 * It takes programmatic focus (`tabIndex={-1}`) so a dismissed banner can hand focus back to the
 * content instead of dropping it on the page; it is never a tab stop, so it needs no ring.
 */
function PageMain({
  className,
  width = "narrow",
  ...props
}: React.ComponentProps<"main"> & { width?: "narrow" | "wide" }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 outline-none md:py-10",
        width === "wide" ? "max-w-5xl" : "max-w-3xl",
        className,
      )}
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
        <h1 className="text-4xl leading-none font-extrabold md:text-5xl">{title}</h1>
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
        <h2 className="flex items-center gap-2.5 text-2xl font-bold">
          <span aria-hidden="true" className="h-5 w-1 rounded-full bg-brand" />
          {title}
        </h2>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Shown when a list has nothing in it. */
function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-line bg-surface/50 px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="text-sm text-text-muted">{description}</p> : null}
    </div>
  );
}

export { PageMain, PageHeader, PageSection, EmptyState };
