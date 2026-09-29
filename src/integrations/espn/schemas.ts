import { z } from "zod";

/**
 * Every schema lists only the fields we read. Zod objects strip unknown keys by default, which is
 * what we want: ESPN adds fields freely, and a smaller schema is a smaller breakage surface.
 */

const id = z.union([z.string(), z.number()]).transform(String);

// ESPN sends scores as "31", 31, or { value, displayValue } depending on the feed.
const score = z
  .union([
    z.string(),
    z.number(),
    z.object({ value: z.number().optional(), displayValue: z.string().optional() }),
  ])
  .transform((raw): number | null => {
    if (typeof raw === "number") return raw;
    if (typeof raw === "string")
      return Number.isFinite(Number(raw)) && raw !== "" ? Number(raw) : null;
    return raw.value ?? (raw.displayValue !== undefined ? Number(raw.displayValue) : null);
  });

const statusCompleted = z.object({ type: z.object({ completed: z.boolean() }) });

// ---- Pro league standings (/apis/v2/.../standings) -------------------------------------------

const standingsEntry = z.object({
  team: z.object({ id }),
  stats: z.array(z.object({ name: z.string(), value: z.number().optional() })),
});

export type StandingsNode = {
  standings?: { entries: z.output<typeof standingsEntry>[] };
  children?: StandingsNode[];
};

// Conferences/divisions nest to different depths per league, so walk the tree recursively.
const standingsNode: z.ZodType<StandingsNode> = z.lazy(() =>
  z.object({
    standings: z.object({ entries: z.array(standingsEntry) }).optional(),
    children: z.array(standingsNode).optional(),
  }),
);
export const standingsSchema = standingsNode;

// ---- Team schedule (college records) ----------------------------------------------------------

const scheduleCompetitor = z.object({
  winner: z.boolean().optional(),
  score: score.optional(),
  team: z.object({ id }),
});

export const teamScheduleSchema = z.object({
  events: z.array(
    z.object({
      seasonType: z.object({ type: z.number() }),
      competitions: z.array(
        z.object({
          status: statusCompleted,
          competitors: z.array(scheduleCompetitor),
        }),
      ),
    }),
  ),
});

// ---- Team-sport scoreboard (postseason) --------------------------------------------------------

const scoreboardCompetitor = z.object({
  winner: z.boolean().optional(),
  team: z.object({ id }),
});

export const teamScoreboardSchema = z.object({
  events: z.array(
    z.object({
      id,
      season: z.object({ slug: z.string().optional() }),
      competitions: z.array(
        z.object({
          notes: z.array(z.object({ headline: z.string().optional() })).optional(),
          status: statusCompleted,
          competitors: z.array(scoreboardCompetitor),
        }),
      ),
    }),
  ),
});

// ---- Rankings ---------------------------------------------------------------------------------

export const wtaRankingsSchema = z.object({
  rankings: z.array(
    z.object({
      ranks: z.array(z.object({ current: z.number(), athlete: z.object({ id }) })),
    }),
  ),
});

export const fedexStandingsSchema = z.object({
  // ESPN omits the key entirely for a season that has not started (FedExCup 2027 today), which
  // means "no standings yet", not "the feed broke".
  standings: z
    .array(
      z.object({
        athlete: z.object({ $ref: z.string() }),
        records: z.array(
          z.object({
            stats: z.array(z.object({ name: z.string(), value: z.number().optional() })),
          }),
        ),
      }),
    )
    .default([]),
});

// ---- Directories (who exists, not how they are doing) ---------------------------------------

const directoryTeam = z.object({
  id,
  displayName: z.string(),
  location: z.string().optional(),
  shortDisplayName: z.string().optional(),
  color: z.string().optional(),
  logos: z.array(z.object({ href: z.string() })).optional(),
});

export const teamsDirectorySchema = z.object({
  sports: z
    .array(
      z.object({
        leagues: z.array(z.object({ teams: z.array(z.object({ team: directoryTeam })) })),
      }),
    )
    .min(1),
});

/** Core API list of a group's teams: only a `$ref` per team, the id is in its path. */
export const coreGroupTeamsSchema = z.object({ items: z.array(z.object({ $ref: z.string() })) });

export const coreAthleteSchema = z.object({
  id,
  displayName: z.string(),
  lastName: z.string().optional(),
  headshot: z.object({ href: z.string() }).optional(),
});

// The ranking carries a headshot for only some players, so it is optional here.
export const wtaRankingsDirectorySchema = z.object({
  rankings: z.array(
    z.object({
      ranks: z.array(
        z.object({
          current: z.number(),
          athlete: z.object({
            id,
            displayName: z.string(),
            lastName: z.string().optional(),
            headshot: z.string().optional(),
          }),
        }),
      ),
    }),
  ),
});

// ---- Majors -----------------------------------------------------------------------------------

export const tennisScoreboardSchema = z.object({
  events: z.array(
    z.object({
      name: z.string(),
      major: z.boolean().optional(),
      status: statusCompleted,
      groupings: z
        .array(
          z.object({
            grouping: z.object({ slug: z.string() }),
            competitions: z.array(
              z.object({
                round: z.object({ displayName: z.string() }),
                competitors: z.array(
                  z.object({ id: id.optional(), winner: z.boolean().optional() }),
                ),
              }),
            ),
          }),
        )
        .optional(),
    }),
  ),
});

export const golfScoreboardSchema = z.object({
  events: z.array(
    z.object({
      id,
      name: z.string(),
      date: z.string(),
      competitions: z.array(
        z.object({
          status: statusCompleted,
          competitors: z
            .array(
              z.object({
                id,
                order: z.number(),
                score: z.string().optional(),
                linescores: z.array(z.object({ value: z.number().optional() })).optional(),
              }),
            )
            .optional(),
        }),
      ),
    }),
  ),
});
