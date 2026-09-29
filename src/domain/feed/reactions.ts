/**
 * The single owner of the reaction vocabulary. The database stores the names (enum
 * reaction_emoji); glyphs live only here so a font or design change never needs a migration.
 */
export const REACTIONS = [
  { name: "fire", glyph: "🔥", label: "Fire" },
  { name: "laugh", glyph: "😂", label: "Laugh" },
  { name: "skull", glyph: "💀", label: "Skull" },
  { name: "clap", glyph: "👏", label: "Clap" },
  { name: "goat", glyph: "🐐", label: "Goat" },
] as const;

export type ReactionName = (typeof REACTIONS)[number]["name"];
export const REACTION_NAMES = REACTIONS.map((r) => r.name) as [ReactionName, ...ReactionName[]];

export function isReactionName(value: string): value is ReactionName {
  return REACTIONS.some((r) => r.name === value);
}

export type ReactionRow = { messageId: string; userId: string; emoji: ReactionName };

export type ReactionSummary = {
  name: ReactionName;
  glyph: string;
  label: string;
  count: number;
  reactedByMe: boolean;
};

/** Counts per reaction for one message, always in catalog order so the bar never reshuffles. */
export function summarizeReactions(
  rows: readonly ReactionRow[],
  messageId: string,
  viewerId: string | null,
): ReactionSummary[] {
  const mine = rows.filter((r) => r.messageId === messageId);
  return REACTIONS.map((r) => {
    const of = mine.filter((row) => row.emoji === r.name);
    return {
      ...r,
      count: of.length,
      reactedByMe: viewerId !== null && of.some((row) => row.userId === viewerId),
    };
  });
}
