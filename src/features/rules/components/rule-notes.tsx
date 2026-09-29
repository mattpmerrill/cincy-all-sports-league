import type { RuleNote } from "../tie-rules";

/** Plain-language rules that don't live in the scoring table (ties, cumulative playoffs). */
export function RuleNotes({ title, notes }: { title: string; notes: RuleNote[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-4 md:p-5">
      <h2 className="text-2xl leading-none font-bold">{title}</h2>
      <dl className="flex flex-col gap-3">
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
