import type { OwnerData, ParticipantData } from "@/domain/league";
import { isSportCode } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";

/** Columns of `participants` every read model embeds; keep in step with `ParticipantRow`. */
export const PARTICIPANT_COLUMNS = "id, name, short_name, logo_url, primary_color";

export type ParticipantRow = {
  id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string | null;
};

export type OwnerRow = { id: string; display_name: string; avatar_url: string | null };

/** An unknown sport code means the DB and the sport catalog have drifted: fail loudly. */
export function toSportCode(code: string): SportCode {
  if (!isSportCode(code)) throw new Error(`Unknown sport code "${code}"`);
  return code;
}

export const toParticipant = (row: ParticipantRow): ParticipantData => ({
  id: row.id,
  name: row.name,
  shortName: row.short_name,
  logoUrl: row.logo_url,
  primaryColor: row.primary_color,
});

export const toOwner = (row: OwnerRow | null): OwnerData | null =>
  row ? { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url } : null;
