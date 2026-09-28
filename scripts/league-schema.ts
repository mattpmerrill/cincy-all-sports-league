import { z } from "zod";
import { SPORT_CODES } from "../src/domain/sports/sports";

/** Shape of data/league-2026-27.json, shared by the resolver and the seed builder. */
const sportCode = z.enum(SPORT_CODES);

const rule = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  kind: z.enum(["per_win", "per_tie", "playoff_milestone", "major_finish", "final_rank_band"]),
  points: z.number().nonnegative(),
  rank_from: z.number().int().positive().optional(),
  rank_to: z.number().int().positive().optional(),
  is_championship: z.boolean(),
});

const participant = z.object({
  name: z.string().min(1),
  short_name: z.string().min(1),
  espn_id: z.string().nullable(),
  logo_url: z.string().url().nullable(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/)
    .nullable(),
});

export const leagueSchema = z.object({
  season: z.object({
    name: z.string(),
    starts_on: z.string().date(),
    ends_on: z.string().date(),
    playoff_scoring_mode: z.enum(["cumulative", "highest_only"]),
    is_active: z.boolean(),
  }),
  sports: z.array(
    z.object({
      code: sportCode,
      allows_duplicate_picks: z.boolean(),
      season: z.object({
        starts_on: z.string().date(),
        espn_season: z.number().int(),
        major_points_cap: z.number().positive().nullable(),
      }),
      rules: z.array(rule),
      participants: z.array(participant),
    }),
  ),
  teams: z.array(
    z.object({
      name: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      picks: z.record(sportCode, z.string()),
    }),
  ),
});

export type League = z.infer<typeof leagueSchema>;
