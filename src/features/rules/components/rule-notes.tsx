import type { RuleNote } from "../tie-rules";

/** Plain-language rules that don't live in the scoring table (ties, cumulative playoffs). */
export function RuleNotes({
  title,
  notes,
  spread = false,
}: {
  title: string;
  notes: RuleNote[];
  /** Lay the notes out in columns on wide screens, for a card that spans the page. */
  spread?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-4 md:p-5">
      <h2 className="text-2xl leading-none font-bold">{title}</h2>
      <dl className={spread ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3"}>
        {notes.map((note) => (
          <div key={note.title} className="flex flex-col gap-0.5">
            <dt className="text-sm font-semibold">{note.title}</dt>
            <dd className="text-sm text-text-muted">{note.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
