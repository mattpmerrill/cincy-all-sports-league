import type { MoveSideEffects } from "@/domain/free-agents";

/** "Cardinals'" after an s, otherwise "Iga Swiatek's". */
export const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * What a move quietly undoes, in one sentence, or null when it touches no trade. The verb agrees
 * with the last count: "that includes" for one thing, "that include" for anything else.
 */
export function sideEffectsWarning(dropped: string, { listings, offers }: MoveSideEffects) {
  if (listings === 0 && offers === 0) return null;
  const acts = [
    listings > 0 ? `cancels ${count(listings, "trade listing")}` : null,
    offers > 0 ? `withdraws ${count(offers, "offer")}` : null,
  ].filter((part): part is string => part !== null);
  const total = listings + offers;
  const verb = total === 1 ? "includes" : "include";
  return `This also ${acts.join(" and ")} that ${verb} ${dropped}.`;
}
