import type { FantasyTeamsRepository, TeamRef } from "@/data/fantasy-teams.repository";
import type { FreeAgentsRepository } from "@/data/free-agents.repository";
import type { TradeLiveScore, TradesRepository } from "@/data/trades.repository";
import {
  FREE_AGENT_MESSAGES,
  NO_ACTIVE_SEASON_MESSAGE,
  freeAgentMovePost,
  freeAgentStatLine,
  freeAgentsIn,
  heldParticipantIds,
  moveSideEffects,
  sportLockedMessage,
  validateMove,
} from "@/domain/free-agents";
import type {
  FreeAgentError,
  FreeAgentErrorCode,
  FreeAgentMove,
  MoveSideEffects,
} from "@/domain/free-agents";
import {
  buildLeagueModel,
  createParticipantScorer,
  createRecordLines,
  isRosterLocked,
} from "@/domain/league";
import type {
  LeagueData,
  LeagueModel,
  ParticipantData,
  ScoredPick,
  SeasonStatus,
  StandingRow,
} from "@/domain/league";
import type { Actor } from "@/domain/membership/membership";
import type { RecordLine } from "@/domain/records";
import type { ParticipantScore } from "@/domain/scoring";
import { SPORT_CODES, SPORTS } from "@/domain/sports/sports";
import type { SportCode } from "@/domain/sports/sports";
import type { Logger } from "@/lib/logger";
import { ok, type AppError, type Result } from "@/lib/result";
import { easternDate } from "@/lib/time";

export type Viewer = { id: string };
export type FreeAgentResult<T> = Result<T, FreeAgentError>;

/**
 * Brings the stored facts for these participants up to date with ESPN. It is a dependency, not an
 * import, because a feature never imports another feature: the Server Action wires the sync
 * service in. Ok means "the facts are as fresh as they can be" (including "nothing to fetch, the
 * sport is out of season"); an error means they might not be.
 */
export type RefreshFacts = (
  sport: SportCode,
  participantIds: readonly string[],
) => Promise<Result<null, AppError>>;

type FreeAgentReads = Pick<FreeAgentsRepository, "getParticipant" | "listRecentMoves">;
type FreeAgentMutations = Pick<FreeAgentsRepository, "makeMove">;

export type FreeAgentsServiceDeps = {
  /** The 10-minute shared read: enough to browse and to reject a junk request cheaply. */
  loadCachedData: () => Promise<LeagueData | null>;
  /** Uncached: what a move is priced and validated on, read after the facts were refreshed. */
  loadFreshData: () => Promise<LeagueData | null>;
  /** A sport's whole participant pool, cached (who is free is derived per request). */
  pool: { list: (sport: SportCode) => Promise<ParticipantData[]> };
  repo: FreeAgentReads;
  /** Built on the admin client; a factory so a page that only reads never needs the secret key. */
  mutations: () => FreeAgentMutations;
  teams: Pick<FantasyTeamsRepository, "getOwnedBy">;
  /** Trade listings live in the trades data layer; sharing the repository is allowed. */
  trades: Pick<TradesRepository, "listOpenListings">;
  refreshFacts: RefreshFacts;
  now: () => Date;
  logger: Logger;
};

/** "Recent moves" is capped; the newest are the ones people look for. */
const RECENT_MOVES_LIMIT = 30;

const SIGN_IN = "Sign in to make moves.";
const NO_PICK = "You don't have a pick in this sport.";
const NO_SIDE_EFFECTS: MoveSideEffects = { listings: 0, offersReceived: 0, offersMade: 0 };

const fail = (
  code: FreeAgentErrorCode,
  message = FREE_AGENT_MESSAGES[code],
): FreeAgentResult<never> => ({ ok: false, error: { code, message } });

/** A pick as the pages show it: whose it is and what it is worth to the team. */
export type MyPickView = {
  participant: ParticipantData;
  /** Credited points: what the team keeps for this sport, not the participant's own total. */
  points: number;
};

/** One row of the pool. Minimal on purpose: the biggest sport sends a few hundred of these. */
export type FreeAgentRow = {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  /** The participant's own live points; none of it counts for a team that adds them. */
  points: number;
  statLine: string | null;
  /** Record or ranking, to help a person choose; null while there is nothing to show. */
  record: RecordLine | null;
};

/** Who is looking, and whether they may move. */
export type ViewerAccess = {
  /** Null for a visitor and for a member without an approved team in the active season. */
  myTeam: TeamRef | null;
  canAct: boolean;
  /** Why not, in words a person can read; set when `canAct` is false. */
  blockedReason: string | null;
};

export type HubSport = {
  sport: SportCode;
  name: string;
  status: SeasonStatus;
  locked: boolean;
  myPick: MyPickView | null;
};

export type FreeAgentsHub = ViewerAccess & {
  sports: HubSport[];
  recentMoves: FreeAgentMove[];
};

export type SportBoard = ViewerAccess & {
  sport: SportCode;
  name: string;
  status: SeasonStatus;
  locked: boolean;
  /** Set with `locked`, whoever is looking (a visitor's `blockedReason` is about signing in). */
  lockedReason: string | null;
  myPick: MyPickView | null;
  /** What a move would quietly undo; zeros unless the viewer can act. */
  sideEffects: MoveSideEffects;
  /** By points, then name. */
  freeAgents: FreeAgentRow[];
};

export type MoveDone = { moveId: string; dropped: ParticipantData; added: ParticipantData };

export type FreeAgentsService = ReturnType<typeof createFreeAgentsService>;

const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

const myPickView = (pick: ScoredPick): MyPickView => ({
  participant: pick.participant,
  points: pick.credited.total,
});

const liveScore = (participantId: string, score: ParticipantScore): TradeLiveScore => ({
  participantId,
  points: score.total,
  championships: score.championships,
  postseasonPoints: score.postseasonPoints,
});

/** Why a sport takes no moves, or null. */
const lockReason = (model: Pick<LeagueModel, "sports">, sport: SportCode): string | null =>
  isRosterLocked(model.sports[sport].status) ? sportLockedMessage(sport) : null;

/** The viewer's standing row, or why they have none. */
function whoIsViewing(
  model: LeagueModel,
  viewer: Viewer | null,
  team: TeamRef | null,
): { me: StandingRow | null; team: TeamRef | null; blocked: string | null } {
  if (!viewer) return { me: null, team: null, blocked: SIGN_IN };
  const me = team ? (model.standings.find((row) => row.teamId === team.id) ?? null) : null;
  return me
    ? { me, team, blocked: null }
    : { me: null, team: null, blocked: FREE_AGENT_MESSAGES.not_owner };
}

type MoveRequest = {
  sport: SportCode;
  dropId: string;
  addId: string;
  /** What `addId` resolved to; null when no such participant exists. */
  target: { sport: SportCode; participant: ParticipantData } | null;
};

/**
 * The move's rules against one model, for the team's own row. Run twice per move: on the cached
 * model to reject junk cheaply, then on the fresh one because the refresh (or a rival) may have
 * changed the answer.
 */
function checkMove(
  model: LeagueModel,
  teamId: string,
  { sport, dropId, addId, target }: MoveRequest,
): FreeAgentResult<{ me: StandingRow }> {
  const me = model.standings.find((row) => row.teamId === teamId);
  if (!me) return fail("not_owner");
  const check = validateMove({
    sport,
    sportStatuses: model.sports,
    team: me,
    dropId,
    add: target ? { id: addId, sport: target.sport } : null,
    heldIds: heldParticipantIds(model, sport),
    allowsDuplicatePicks: model.sports[sport].allowsDuplicatePicks,
  });
  return check.ok ? ok({ me }) : { ok: false, error: check.error };
}

export function createFreeAgentsService(deps: FreeAgentsServiceDeps) {
  const modelOf = (data: LeagueData, now: Date) => buildLeagueModel(data, easternDate(now));

  return {
    // ===== reads =====
    // Both read the cached league: browsing may be up to ten minutes behind, a move never is.

    /** Every sport with the viewer's pick and lock state, plus the latest moves. */
    async getHub(viewer: Viewer | null): Promise<FreeAgentsHub> {
      const now = deps.now();
      const [data, ownedTeam, recentMoves] = await Promise.all([
        deps.loadCachedData(),
        viewer ? deps.teams.getOwnedBy(viewer.id) : null,
        deps.repo.listRecentMoves({ limit: RECENT_MOVES_LIMIT }),
      ]);
      if (!data) {
        return {
          myTeam: null,
          canAct: false,
          blockedReason: NO_ACTIVE_SEASON_MESSAGE,
          sports: [],
          recentMoves: [],
        };
      }
      const model = modelOf(data, now);
      const { me, team, blocked } = whoIsViewing(model, viewer, ownedTeam);
      return {
        myTeam: team,
        canAct: me !== null,
        blockedReason: blocked,
        sports: SPORT_CODES.map((sport) => {
          const pick = me?.picks.find((p) => p.sport === sport);
          return {
            sport,
            name: SPORTS[sport].name,
            status: model.sports[sport].status,
            locked: lockReason(model, sport) !== null,
            myPick: pick ? myPickView(pick) : null,
          };
        }),
        recentMoves,
      };
    },

    /**
     * One sport's board: the viewer's pick, the free agents with their live points, and what
     * adding one would cancel. Null when there is no active season.
     */
    async getSportBoard(viewer: Viewer | null, sport: SportCode): Promise<SportBoard | null> {
      const now = deps.now();
      const [data, ownedTeam, pool] = await Promise.all([
        deps.loadCachedData(),
        viewer ? deps.teams.getOwnedBy(viewer.id) : null,
        deps.pool.list(sport),
      ]);
      if (!data) return null;

      const model = modelOf(data, now);
      const { me, team, blocked } = whoIsViewing(model, viewer, ownedTeam);
      const locked = lockReason(model, sport);
      const pick = me?.picks.find((p) => p.sport === sport) ?? null;

      // Free agents are scored by the same scorer that scores picks, so the number on the board
      // is the number a move will use as the new baseline.
      const scoreOf = createParticipantScorer(data);
      const recordOf = createRecordLines(data, scoreOf);
      const freeAgents = freeAgentsIn({
        pool,
        heldIds: heldParticipantIds(model, sport),
        allowsDuplicatePicks: model.sports[sport].allowsDuplicatePicks,
        ownPickId: pick?.participant.id ?? null,
      })
        .map((p): FreeAgentRow => {
          const score = scoreOf(sport, p.id);
          return {
            id: p.id,
            name: p.name,
            shortName: p.shortName,
            logoUrl: p.logoUrl,
            points: score.total,
            statLine: freeAgentStatLine(score),
            record: recordOf(sport, p.id),
          };
        })
        .sort((a, b) => b.points - a.points || byName(a.name, b.name) || byName(a.id, b.id));

      const blockedReason = blocked ?? locked ?? (pick ? null : NO_PICK);
      const canAct = me !== null && pick !== null && locked === null;
      const sideEffects =
        canAct && me
          ? moveSideEffects({
              teamId: me.teamId,
              sport,
              openListings: await deps.trades.listOpenListings(now),
              now,
            })
          : NO_SIDE_EFFECTS;

      return {
        myTeam: team,
        canAct,
        blockedReason,
        sport,
        name: SPORTS[sport].name,
        status: model.sports[sport].status,
        locked: locked !== null,
        lockedReason: locked,
        myPick: pick ? myPickView(pick) : null,
        sideEffects,
        freeAgents,
      };
    },

    // ===== mutation =====

    /**
     * Drops the actor's pick in `sport` and adds `addId`, in the order that keeps ESPN and the
     * database honest:
     *
     * 1. Check on cached data, so a junk request never costs an ESPN call.
     * 2. Refresh the facts of exactly these two participants. A stale baseline would let the next
     *    sync credit the previous holder's points to the new team, and a move cannot be undone,
     *    so if ESPN cannot answer nothing is written.
     * 3. Load fresh data and validate again: the refresh can end a season or the race can be lost.
     * 4. Price both participants from that fresh data, never from the cache.
     *
     * Both ids must be uuids (the action's schema checks): `getParticipant` throws on anything else.
     */
    async makeMove(
      actor: Actor,
      input: { sport: SportCode; dropId: string; addId: string },
    ): Promise<FreeAgentResult<MoveDone>> {
      const { sport, dropId, addId } = input;
      const now = deps.now();

      // ----- 1. pre-check on cached data -----
      const [team, cached, target] = await Promise.all([
        deps.teams.getOwnedBy(actor.id),
        deps.loadCachedData(),
        deps.repo.getParticipant(addId),
      ]);
      if (!team) return fail("not_owner");
      if (!cached) return fail("invalid_sport", NO_ACTIVE_SEASON_MESSAGE);
      const request: MoveRequest = { sport, dropId, addId, target };
      const early = checkMove(modelOf(cached, now), team.id, request);
      if (!early.ok) return early;

      // ----- 2. fresh facts for exactly the two participants -----
      const refreshed = await deps.refreshFacts(sport, [dropId, addId]);
      if (!refreshed.ok) {
        // The provider's message stays in the log; a person only ever sees ours.
        deps.logger.warn("free-agent facts refresh failed", {
          sport,
          code: refreshed.error.code,
          message: refreshed.error.message,
        });
        return fail("facts_unavailable");
      }

      // ----- 3. fresh data, validated again -----
      const fresh = await deps.loadFreshData();
      if (!fresh) return fail("invalid_sport", NO_ACTIVE_SEASON_MESSAGE);
      const late = checkMove(modelOf(fresh, now), team.id, request);
      if (!late.ok) return late;
      const { me } = late.value;

      // ----- 4. live scores of both participants from the fresh facts -----
      const dropped = me.picks.find((p) => p.sport === sport)?.participant;
      // Both are set once the check passed (a missing target is `not_found`); this narrows types.
      if (!dropped || !target) return fail("not_found");
      // The sport comes from the participant lookup, not the route, so a mismatch could only ever
      // surface as `not_found` above and never as a score under the wrong sport.
      const scoreOf = createParticipantScorer(fresh);
      const scores = [
        liveScore(dropId, scoreOf(sport, dropId)),
        liveScore(addId, scoreOf(target.sport, addId)),
      ];

      const post = freeAgentMovePost({
        team: { name: me.teamName, slug: me.slug },
        sport,
        dropped,
        added: target.participant,
      });
      const moved = await deps.mutations().makeMove({
        actorId: actor.id,
        sport,
        dropId,
        addId,
        scores,
        post,
      });
      return moved.ok
        ? ok({ moveId: moved.value.moveId, dropped, added: target.participant })
        : moved;
    },
  };
}
