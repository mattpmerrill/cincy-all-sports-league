import type { SportCode } from "@/domain/sports/sports";

export const MESSAGE_KINDS = ["member", "league"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type MessageAuthor = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** The team they own this season, for the chip beside their name. */
  team: { name: string; slug: string } | null;
};

export type ScoreUpdateItem = {
  teamSlug: string;
  teamName: string;
  participantName: string;
  sport: SportCode;
  pointsDelta: number;
};

export type MoverItem = {
  teamSlug: string;
  teamName: string;
  direction: "up" | "down";
  places: number;
  rank: number;
  rankLabel: string;
};

export type LeaguePayload =
  | { type: "score_update"; items: ScoreUpdateItem[] }
  | { type: "movers"; date: string | null; items: MoverItem[] };

export type Message = {
  id: string;
  kind: MessageKind;
  parentId: string | null;
  /** Empty once deleted: the text never reaches the client for a removed message. */
  body: string;
  deleted: boolean;
  /** Null for league posts, and for a member whose profile was deleted. */
  author: MessageAuthor | null;
  /** Set on league posts the UI can render richly; null for member messages. */
  payload: LeaguePayload | null;
  createdAt: string;
};

export type Thread = { message: Message; replies: Message[] };
