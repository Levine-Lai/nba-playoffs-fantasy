import bcrypt from "bcryptjs";
import { HELP_RULES, POINTS_BASELINE } from "./shared/gameTemplate";
import {
  applyStoredLineupSnapshot,
  buildLineupPayload,
  buildStoredLineupSnapshot,
  buildTransactionsPayload,
  calcFinalPoints,
  createInitialTeamForState,
  getDisplayProfileState,
  getRosterPlayers,
  hasCreatedTeam,
  isValidStarterMix,
  replacePlayerForState,
  replacePlayerOnRoster,
  syncTransferWindowState,
  withVisiblePoints
} from "./worker/gameplay";
import { handleCorsPreflight, json, parseJsonBody } from "./worker/http";
import { buildOfficialLivePointsPreview, buildOfficialStartedPeriodSummaries, buildSchedulePayload, getEditablePeriodContext, getGameweekPayload, getNextMatchupByTeam, getOfficialScheduleTimeline, getScoringPeriodContext } from "./worker/liveData";
import {
  buildPublicUser,
  createPrivateLeague,
  createSession,
  DB_PATH_LABEL,
  deleteSession,
  getAuthenticatedUserByToken,
  getPlayerDataSummary,
  getPlayersByIds,
  getPublicUserById,
  getRuleValue,
  getStateForUser,
  getUserByAccount,
  getUserByGameId,
  getUserChipsState,
  joinPrivateLeague,
  listPrivateLeaguesForUser,
  listStandingMembers,
  readAppState,
  registerUser,
  saveStateForUser,
  saveUserChipsState,
  searchPlayerPool,
  writeAppState
} from "./worker/store";
import type {
  AuthUser,
  EditablePeriodContext,
  Env,
  LeagueEntry,
  LeagueMemberEntry,
  LeaguePhaseOption,
  Player,
  StoredLineupSnapshot,
  TransferWindowSnapshot,
  TransferHistoryItem,
  UserChipCardState,
  UserChipsState,
  UserState
} from "./worker/types";

const LEAGUE_POINTS_LEDGER_KEY = "league_points_ledger_v1";
const DEFAULT_LEAGUE_PHASE_OPTIONS: LeaguePhaseOption[] = [
  { key: "overall", label: "Overall" },
  { key: "play-in-1", label: "Play-In 1" },
  { key: "play-in-2", label: "Play-In 2" },
  { key: "play-in-3", label: "Play-In 3" },
  { key: "round-1", label: "Round 1" },
  { key: "round-2", label: "Round 2" },
  { key: "round-3", label: "Round 3" },
  { key: "round-4", label: "Round 4" }
];

type ScoringPeriodContext = {
  key: string;
  label: string;
  deadline: string;
  gamedayIndex: number;
  roundNumber: number;
  dayNumber: number;
} | null;

type LeaguePointsLedgerEntry = {
  periodKey: string;
  label: string;
  roundNumber: number;
  dayNumber: number;
  points: number;
  recordedAt: string;
};

type LeaguePointsLedger = Record<string, Record<string, LeaguePointsLedgerEntry>>;
type TransactionChipChoice = "wildcard" | "all-star";
type TransactionChipCards = {
  wildcard: UserChipCardState;
  allStar: UserChipCardState;
};
type ConfirmTransferDraft = {
  outPlayerId: string;
  inPlayerId: string;
};

function extractBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

async function getInitialBudget(env: Env) {
  return Number((await getRuleValue(env, "initial_budget", "100")) ?? "100");
}

async function getWeeklyFreeTransfers(env: Env) {
  return Number((await getRuleValue(env, "weekly_free_transfers", "3")) ?? "3");
}

async function getFirstDeadline(env: Env) {
  return (await getRuleValue(env, "first_deadline", "2026-04-10T06:30:00Z")) ?? "2026-04-10T06:30:00Z";
}

async function isBeforeFirstDeadline(env: Env) {
  return (await getEditablePeriodContext(env, await getFirstDeadline(env))).beforeCompetitionStart;
}

function clonePlayer(player: Player) {
  return {
    ...player,
    upcoming: [...(player.upcoming ?? [])],
    upcomingSchedule: [...(player.upcomingSchedule ?? [])]
  };
}

function cloneState(state: UserState): UserState {
  return {
    ...state,
    starters: state.starters.map(clonePlayer),
    bench: state.bench.map(clonePlayer),
    market: state.market.map(clonePlayer),
    history: state.history.map((item) => ({ ...item }))
  };
}

function buildStateFromSnapshot(state: UserState, snapshot: StoredLineupSnapshot) {
  const cloned = cloneState(state);
  return applyStoredLineupSnapshot(cloned, snapshot);
}

function cloneTransferWindowSnapshot(snapshot: TransferWindowSnapshot | null | undefined): TransferWindowSnapshot | null {
  if (!snapshot) {
    return null;
  }

  const periodKey = (snapshot as TransferWindowSnapshot & { windowKey?: string | null }).periodKey ?? (snapshot as { windowKey?: string | null }).windowKey ?? "";

  return {
    periodKey,
    lineup: {
      starters: snapshot.lineup.starters.map(clonePlayer),
      bench: snapshot.lineup.bench.map(clonePlayer),
      captainId: snapshot.lineup.captainId,
      rosterValue: Number(snapshot.lineup.rosterValue ?? 0),
      bank: Number(snapshot.lineup.bank ?? 0)
    },
    history: snapshot.history.map((item) => ({ ...item })),
    totalTransfers: Number(snapshot.totalTransfers ?? 0)
  };
}

function buildTransferWindowSnapshot(state: UserState, periodKey: string): TransferWindowSnapshot {
  return {
    periodKey,
    lineup: buildStoredLineupSnapshot(state),
    history: state.history.map((item) => ({ ...item })),
    totalTransfers: Number(state.totalTransfers ?? 0)
  };
}

function getWindowSnapshotForContext(chips: UserChipsState, periodKey: string) {
  const snapshotPeriodKey =
    (chips.transferWindowSnapshot as (TransferWindowSnapshot & { windowKey?: string | null }) | null | undefined)?.periodKey ??
    (chips.transferWindowSnapshot as { windowKey?: string | null } | null | undefined)?.windowKey ??
    null;
  if (snapshotPeriodKey !== periodKey) {
    return null;
  }

  return cloneTransferWindowSnapshot(chips.transferWindowSnapshot);
}

function restoreTransferWindowBaseline(state: UserState, snapshot: TransferWindowSnapshot) {
  applyStoredLineupSnapshot(state, snapshot.lineup);
  state.history = snapshot.history.map((item) => ({ ...item }));
  state.totalTransfers = Number(snapshot.totalTransfers ?? 0);
  return state;
}

function isChipActiveForPeriod(activePeriodKey: string | null | undefined, periodKey: string | null | undefined) {
  return Boolean(activePeriodKey && periodKey && activePeriodKey === periodKey);
}

function getTransactionsChipCards(chips: UserChipsState, editableContext: EditablePeriodContext): TransactionChipCards {
  const wildcardActive = isChipActiveForPeriod(chips.wildcard.activePeriodKey, editableContext.period.key);
  const allStarActive = isChipActiveForPeriod(chips.allStar.activePeriodKey, editableContext.period.key);

  return {
    wildcard: {
      label: wildcardActive ? "Active" : chips.wildcard.used ? "Played" : "Play",
      canActivate: !chips.wildcard.used && !allStarActive,
      isActive: wildcardActive,
      isPlayed: chips.wildcard.used && !wildcardActive
    },
    allStar: {
      label: allStarActive ? "Active" : chips.allStar.used ? "Played" : "Play",
      canActivate: !chips.allStar.used && !wildcardActive,
      isActive: allStarActive,
      isPlayed: chips.allStar.used && !allStarActive
    }
  };
}

function getActiveTransactionChip(chips: UserChipsState, editableContext: EditablePeriodContext): TransactionChipChoice | null {
  if (isChipActiveForPeriod(chips.wildcard.activePeriodKey, editableContext.period.key)) {
    return "wildcard";
  }

  if (isChipActiveForPeriod(chips.allStar.activePeriodKey, editableContext.period.key)) {
    return "all-star";
  }

  return null;
}

function getTransactionsState(state: UserState, chips: UserChipsState, editableContext: EditablePeriodContext) {
  if (isChipActiveForPeriod(chips.allStar.activePeriodKey, editableContext.period.key) && chips.allStar.activeLineup) {
    return buildStateFromSnapshot(state, chips.allStar.activeLineup);
  }

  return cloneState(state);
}

function getScoringState(state: UserState, chips: UserChipsState, scoringPeriod: ScoringPeriodContext) {
  if (scoringPeriod && isChipActiveForPeriod(chips.allStar.activePeriodKey, scoringPeriod.key) && chips.allStar.activeLineup) {
    return buildStateFromSnapshot(state, chips.allStar.activeLineup);
  }

  return cloneState(state);
}

async function enrichRosterPlayers(env: Env, players: Player[]) {
  const nextMatchupByTeam = await getNextMatchupByTeam(env);
  const freshPlayers = await getPlayersByIds(
    env,
    players.map((player) => player.id),
    nextMatchupByTeam
  );
  const freshById = new Map(freshPlayers.map((player) => [player.id, player]));

  return players.map((player) => {
    const fresh = freshById.get(String(player.id));
    if (!fresh) {
      return player;
    }

    return {
      ...player,
      ...fresh,
      nextOpponent: fresh.nextOpponent,
      nextOpponentName: fresh.nextOpponentName,
      nextOpponentLogoUrl: fresh.nextOpponentLogoUrl,
      nextOpponentLogoFallbackUrl: fresh.nextOpponentLogoFallbackUrl,
      upcoming: fresh.upcoming ?? []
    };
  });
}

async function hydrateStateAssets(env: Env, state: UserState) {
  state.starters = await enrichRosterPlayers(env, state.starters);
  state.bench = await enrichRosterPlayers(env, state.bench);
  return state;
}

function syncPointsSnapshot(
  state: UserState,
  lineup: { starters: Player[]; bench: Player[] },
  finalPoints: number
) {
  const pointsById = new Map(
    [...lineup.starters, ...lineup.bench].map((player) => [player.id, { points: Number(player.points ?? 0), pointsWindowKey: player.pointsWindowKey ?? null }])
  );

  const apply = (players: Player[]) =>
    players.map((player) => {
      const next = pointsById.get(player.id);
      if (!next) {
        return player;
      }

      return {
        ...player,
        points: next.points,
        pointsWindowKey: next.pointsWindowKey
      };
    });

  state.starters = apply(state.starters);
  state.bench = apply(state.bench);
  state.gamedayPoints = finalPoints;
}

function syncPersistedPointsState(
  state: UserState,
  lineup: { starters: Player[]; bench: Player[] },
  finalPoints: number,
  preserveRoster = false
) {
  if (preserveRoster) {
    state.gamedayPoints = Number(finalPoints ?? 0);
    return state;
  }

  syncPointsSnapshot(state, lineup, finalPoints);
  return state;
}

function buildStoredPointsSnapshot(state: UserState, scoringPeriod: { key: string; label: string; deadline: string; gamedayIndex: number } | null) {
  const apply = (players: Player[]) =>
    players.map((player) => ({
      ...player,
      points: player.pointsWindowKey === scoringPeriod?.key ? Number(player.points ?? 0) : 0,
      pointsWindowKey: player.pointsWindowKey === scoringPeriod?.key ? player.pointsWindowKey ?? scoringPeriod?.key ?? null : null
    }));

  const starters = apply(state.starters);
  const bench = apply(state.bench);
  const finalPoints = calcFinalPoints({
    ...state,
    starters,
    bench
  });

  return {
    visible: true,
    gameweek: {
      id: scoringPeriod?.gamedayIndex ?? 1,
      label: scoringPeriod?.label ?? "Previous Day",
      deadline: scoringPeriod?.deadline ?? ""
    },
    summary: {
      final: finalPoints
    },
    lineup: {
      starters,
      bench,
      captainId: state.captainId
    }
  };
}

async function readLeaguePointsLedger(env: Env) {
  return readAppState<LeaguePointsLedger>(env, LEAGUE_POINTS_LEDGER_KEY, {});
}

async function writeLeaguePointsLedger(env: Env, ledger: LeaguePointsLedger) {
  await writeAppState(env, LEAGUE_POINTS_LEDGER_KEY, ledger);
}

function sumLeagueLedgerPoints(entries: LeaguePointsLedgerEntry[] | undefined) {
  return Number(
    ((entries ?? []).reduce((sum, entry) => sum + Number(entry.points ?? 0), 0)).toFixed(1)
  );
}

function getLeaguePhaseOptions() {
  return DEFAULT_LEAGUE_PHASE_OPTIONS;
}

function getLeaguePhasePoints(entries: LeaguePointsLedgerEntry[] | undefined, phaseKey: string) {
  if (phaseKey === "overall") {
    return sumLeagueLedgerPoints(entries);
  }

  const playInMatch = phaseKey.match(/^play-in-(\d+)$/);
  if (playInMatch) {
    const targetDay = Number(playInMatch[1]);
    return Number(
      ((entries ?? [])
        .filter((entry) => entry.roundNumber === 0 && entry.dayNumber === targetDay)
        .reduce((sum, entry) => sum + Number(entry.points ?? 0), 0)
      ).toFixed(1)
    );
  }

  const roundMatch = phaseKey.match(/^round-(\d+)$/);
  if (roundMatch) {
    const targetRound = Number(roundMatch[1]);
    return Number(
      ((entries ?? [])
        .filter((entry) => entry.roundNumber === targetRound)
        .reduce((sum, entry) => sum + Number(entry.points ?? 0), 0)
      ).toFixed(1)
    );
  }

  return 0;
}

async function syncLeaguePointsLedger(
  env: Env,
  userId: string | number,
  scoringPeriod: ScoringPeriodContext,
  points: number
) {
  if (!scoringPeriod) {
    return 0;
  }

  const numericPoints = Number(points ?? 0);
  const ledger = await readLeaguePointsLedger(env);
  const userKey = String(userId);
  const existingUserLedger = ledger[userKey] ?? {};
  const nextEntry: LeaguePointsLedgerEntry = {
    periodKey: scoringPeriod.key,
    label: scoringPeriod.label,
    roundNumber: Number(scoringPeriod.roundNumber ?? 0),
    dayNumber: Number(scoringPeriod.dayNumber ?? 0),
    points: Number(numericPoints.toFixed(1)),
    recordedAt: new Date().toISOString()
  };

  const currentEntry = existingUserLedger[scoringPeriod.key];
  const entryChanged =
    !currentEntry ||
    Number(currentEntry.points ?? 0) !== nextEntry.points ||
    currentEntry.label !== nextEntry.label ||
    Number(currentEntry.roundNumber ?? 0) !== nextEntry.roundNumber ||
    Number(currentEntry.dayNumber ?? 0) !== nextEntry.dayNumber;

  if (entryChanged) {
    ledger[userKey] = {
      ...existingUserLedger,
      [scoringPeriod.key]: nextEntry
    };
    await writeLeaguePointsLedger(env, ledger);
  }

  return sumLeagueLedgerPoints(Object.values(ledger[userKey] ?? {}));
}

async function syncLeaguePointsAdjustment(
  env: Env,
  userId: string | number,
  adjustment: {
    key: string;
    label: string;
    roundNumber: number;
    dayNumber: number;
    points: number;
  }
) {
  const numericPoints = Number(adjustment.points ?? 0);
  const ledger = await readLeaguePointsLedger(env);
  const userKey = String(userId);
  const existingUserLedger = ledger[userKey] ?? {};
  const entryKey = adjustment.key;
  const baseEntries = Object.fromEntries(
    Object.entries(existingUserLedger).filter(([key]) => key !== entryKey && !key.startsWith(`${entryKey}:`))
  );

  if (numericPoints === 0) {
    if (Object.keys(baseEntries).length !== Object.keys(existingUserLedger).length) {
      ledger[userKey] = baseEntries;
      await writeLeaguePointsLedger(env, ledger);
    }
    return sumLeagueLedgerPoints(Object.values(ledger[userKey] ?? {}));
  }

  ledger[userKey] = {
    ...baseEntries,
    [entryKey]: {
      periodKey: entryKey,
      label: adjustment.label,
      roundNumber: Number(adjustment.roundNumber ?? 0),
      dayNumber: Number(adjustment.dayNumber ?? 0),
      points: Number(numericPoints.toFixed(1)),
      recordedAt: new Date().toISOString()
    }
  };

  await writeLeaguePointsLedger(env, ledger);
  return sumLeagueLedgerPoints(Object.values(ledger[userKey] ?? {}));
}

function buildRankedMembers(members: LeagueMemberEntry[], phaseKey: string, ledger: LeaguePointsLedger) {
  const overallMembers = members
    .map((member) => {
      const entries = Object.values(ledger[member.userId] ?? {});
      const ledgerTotal = sumLeagueLedgerPoints(entries);
      const totalPoints = Number((entries.length ? ledgerTotal : Number(member.totalPoints ?? 0)).toFixed(1));

      return {
        ...member,
        totalPoints,
        phasePoints: totalPoints
      };
    })
    .sort((left, right) => {
      const pointsDiff = Number(right.totalPoints ?? 0) - Number(left.totalPoints ?? 0);
      if (pointsDiff !== 0) {
        return pointsDiff;
      }

      return String(left.gameId).localeCompare(String(right.gameId), undefined, { sensitivity: "base" });
    })
    .map((member, index) => ({
      ...member,
      rank: index + 1,
      previousRank: index + 1
    }));

  const overallRankByUserId = new Map(overallMembers.map((member) => [member.userId, member.rank]));

  if (phaseKey === "overall") {
    return overallMembers;
  }

  return overallMembers
    .map((member) => {
      const entries = Object.values(ledger[member.userId] ?? {});
      return {
        ...member,
        phasePoints: getLeaguePhasePoints(entries, phaseKey),
        previousRank: overallRankByUserId.get(member.userId) ?? member.rank
      };
    })
    .sort((left, right) => {
      const phaseDiff = Number(right.phasePoints ?? 0) - Number(left.phasePoints ?? 0);
      if (phaseDiff !== 0) {
        return phaseDiff;
      }

      const totalDiff = Number(right.totalPoints ?? 0) - Number(left.totalPoints ?? 0);
      if (totalDiff !== 0) {
        return totalDiff;
      }

      return String(left.gameId).localeCompare(String(right.gameId), undefined, { sensitivity: "base" });
    })
    .map((member, index) => ({
      ...member,
      rank: index + 1
    }));
}

async function buildLeagueDetailPayload(env: Env, league: LeagueEntry, requestedPhaseKey: string | null) {
  const selectedPhaseKey = getLeaguePhaseOptions().some((option) => option.key === requestedPhaseKey)
    ? String(requestedPhaseKey)
    : "overall";

  for (const member of league.members ?? []) {
    const state = await safeLoadState(env, member.userId);
    if (!state || !hasCreatedTeam(state)) {
      continue;
    }

    const chips = await getUserChipsState(env, member.userId);
    await backfillOfficialPointsLedger(env, member.userId, state, chips);
    await saveStateForUser(env, member.userId, state);
  }

  const ledger = await readLeaguePointsLedger(env);
  return {
    ...league,
    selectedPhaseKey,
    phaseOptions: getLeaguePhaseOptions(),
    members: buildRankedMembers(league.members ?? [], selectedPhaseKey, ledger)
  } satisfies LeagueEntry;
}

async function buildStandingPayload(env: Env, requestedPhaseKey: string | null) {
  const selectedPhaseKey = getLeaguePhaseOptions().some((option) => option.key === requestedPhaseKey)
    ? String(requestedPhaseKey)
    : "overall";

  let members = await listStandingMembers(env);
  for (const member of members) {
    const state = await safeLoadState(env, member.userId);
    if (!state || !hasCreatedTeam(state)) {
      continue;
    }

    const chips = await getUserChipsState(env, member.userId);
    await backfillOfficialPointsLedger(env, member.userId, state, chips);
    await saveStateForUser(env, member.userId, state);
  }

  members = await listStandingMembers(env);
  const ledger = await readLeaguePointsLedger(env);
  return {
    selectedPhaseKey,
    phaseOptions: getLeaguePhaseOptions(),
    members: buildRankedMembers(members, selectedPhaseKey, ledger)
  };
}

async function safeLoadState(env: Env, userId: string | number) {
  const state = await getStateForUser(env, userId);
  if (!state) {
    return null;
  }

  return hydrateStateAssets(env, state);
}

async function backfillOfficialPointsLedger(env: Env, userId: string | number, state: UserState, chips: UserChipsState) {
  const summaries = await buildOfficialStartedPeriodSummaries(
    env,
    state,
    chips.allStar.activePeriodKey && chips.allStar.activeLineup
      ? {
          periodKey: chips.allStar.activePeriodKey,
          state: getScoringState(state, chips, {
            key: chips.allStar.activePeriodKey,
            label: chips.allStar.activePeriodKey,
            deadline: "",
            gamedayIndex: 0,
            roundNumber: 0,
            dayNumber: 0
          })
        }
      : undefined
  ).catch(() => []);
  let latestPoints = Number(state.gamedayPoints ?? 0);
  let overallPoints = Number(state.overallPoints ?? 0);

  for (const summary of summaries) {
    overallPoints = await syncLeaguePointsLedger(
      env,
      userId,
      {
        key: summary.key,
        label: summary.label,
        deadline: summary.deadline,
        gamedayIndex: summary.gamedayIndex,
        roundNumber: summary.roundNumber,
        dayNumber: summary.dayNumber
      },
      summary.finalPoints
    );
    latestPoints = Number(summary.finalPoints ?? latestPoints);
  }

  state.overallPoints = Number(overallPoints.toFixed(1));
  state.gamedayPoints = Number(latestPoints.toFixed(1));
  return {
    overallPoints: state.overallPoints,
    gamedayPoints: state.gamedayPoints
  };
}

async function syncProfileStandingState(env: Env, userId: string | number, state: UserState) {
  const ledger = await readLeaguePointsLedger(env);
  const rankedMembers = buildRankedMembers(await listStandingMembers(env), "overall", ledger);
  const currentMember = rankedMembers.find((member) => member.userId === String(userId));

  state.overallRank = currentMember?.rank ?? 0;
  state.totalPlayers = rankedMembers.length;
  return {
    overallRank: state.overallRank,
    totalPlayers: state.totalPlayers
  };
}

async function buildPointsPayloadForUser(env: Env, userId: string, viewerUserId: string) {
  const state = await safeLoadState(env, userId);
  if (!state) {
    return { ok: false as const, response: json({ message: "User state not found." }, { status: 500 }, env) };
  }

  if (!hasCreatedTeam(state)) {
    return { ok: false as const, response: json({ message: "Create your initial team first." }, { status: 400 }, env) };
  }

  const chips = await getUserChipsState(env, userId);
  await backfillOfficialPointsLedger(env, userId, state, chips);

  const targetUser = await getPublicUserById(env, userId);
  if (!targetUser) {
    return { ok: false as const, response: json({ message: "User not found." }, { status: 404 }, env) };
  }

  const viewer = {
    userId: targetUser.id,
    gameId: targetUser.gameId,
    teamName: state.teamName,
    managerName: state.managerName,
    isCurrentUser: targetUser.id === viewerUserId
  };

  const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
  const beforeDeadline = editableContext.beforeCompetitionStart;
  const scoringPeriod = (await getScoringPeriodContext(env)) as ScoringPeriodContext;
  const scoringState = getScoringState(state, chips, scoringPeriod);
  const preserveRosterPoints =
    Boolean(scoringPeriod) && isChipActiveForPeriod(chips.allStar.activePeriodKey, scoringPeriod?.key) && Boolean(chips.allStar.activeLineup);
  const livePreview = await buildOfficialLivePointsPreview(env, scoringState, beforeDeadline).catch(() => null);
  if (livePreview) {
    syncPointsSnapshot(scoringState, livePreview.lineup, livePreview.finalPoints);
    syncPersistedPointsState(state, livePreview.lineup, livePreview.finalPoints, preserveRosterPoints);
    const overallPoints = await syncLeaguePointsLedger(env, userId, scoringPeriod, livePreview.finalPoints);
    state.overallPoints = Number(overallPoints.toFixed(1));
    await saveStateForUser(env, userId, state);
    return { ok: true as const, payload: { ...livePreview, viewer } };
  }

  if (beforeDeadline) {
    return {
      ok: true as const,
      payload: {
        visible: false,
        message: "Points will unlock after Round 1 Day 1 deadline.",
        gameweek: editableContext.gameweek,
        summary: {
          final: 0
        },
        lineup: {
          starters: withVisiblePoints(scoringState.starters, true),
          bench: withVisiblePoints(scoringState.bench, true),
          captainId: scoringState.captainId
        },
        viewer
      }
    };
  }

  const fallbackPoints = buildStoredPointsSnapshot(scoringState, scoringPeriod);
  state.gamedayPoints = fallbackPoints.summary.final;
  const overallPoints = await syncLeaguePointsLedger(env, userId, scoringPeriod, fallbackPoints.summary.final);
  state.overallPoints = Number(overallPoints.toFixed(1));
  await saveStateForUser(env, userId, state);

  return {
    ok: true as const,
    payload: { ...fallbackPoints, viewer }
  };
}

async function commitTransactionBatch(params: {
  env: Env;
  userId: string;
  baseState: UserState;
  chips: UserChipsState;
  editableContext: EditablePeriodContext;
  drafts: ConfirmTransferDraft[];
  requestedChip: TransactionChipChoice | null;
}) {
  const { env, userId, baseState, chips, editableContext, drafts, requestedChip } = params;
  const activeChip = getActiveTransactionChip(chips, editableContext);
  const activatingChipNow = Boolean(requestedChip && !activeChip);
  const penaltyEntryKey = `penalty:${editableContext.transferWindow.key}`;

  if (requestedChip && activeChip && requestedChip !== activeChip) {
    return { ok: false as const, error: "Another chip is already active for this deadline." };
  }

  if (requestedChip === "wildcard" && chips.wildcard.used && !activeChip) {
    return { ok: false as const, error: "Wildcard has already been used." };
  }

  if (requestedChip === "all-star" && chips.allStar.used && !activeChip) {
    return { ok: false as const, error: "All-Star has already been used." };
  }

  const effectiveChip = requestedChip ?? activeChip;
  const currentWindowSnapshot = getWindowSnapshotForContext(chips, editableContext.period.key);
  if (activatingChipNow) {
    restoreTransferWindowBaseline(baseState, currentWindowSnapshot ?? buildTransferWindowSnapshot(baseState, editableContext.period.key));
    syncTransferWindowState(baseState, editableContext.transferWindow);
  }

  const workingState = getTransactionsState(baseState, chips, editableContext);
  const budget = await getInitialBudget(env);
  const nextMatchupByTeam = await getNextMatchupByTeam(env);
  const incomingPlayers = await getPlayersByIds(
    env,
    drafts.map((draft) => draft.inPlayerId),
    nextMatchupByTeam
  );
  const incomingById = new Map(incomingPlayers.map((player) => [player.id, player]));

  let usedThisWindow = workingState.history.filter((item) => item.windowKey === editableContext.transferWindow.key && item.countsTowardLimit !== false).length;
  const historyEntries: TransferHistoryItem[] = [];

  for (const [index, draft] of drafts.entries()) {
    const incoming = incomingById.get(draft.inPlayerId);
    if (!incoming) {
      return { ok: false as const, error: "Incoming player not found in transfer market." };
    }

    const applied = replacePlayerOnRoster({
      state: workingState,
      outPlayerId: draft.outPlayerId,
      incoming,
      budget,
      ignoreBudget: effectiveChip === "all-star"
    });
    if (!applied.ok) {
      return applied;
    }

    const countsTowardLimit = effectiveChip === null && editableContext.transferWindow.mode !== "LIMITLESS";
    let cost = 0;
    if (countsTowardLimit) {
      usedThisWindow += 1;
      if (usedThisWindow > editableContext.transferWindow.limit) {
        cost = -100;
      }
    }

    historyEntries.push({
      id: `tx-${Date.now()}-${index}`,
      timestamp: new Date().toISOString(),
      outPlayer: applied.outgoing.name,
      inPlayer: incoming.name,
      cost,
      note:
        effectiveChip === "wildcard"
          ? `Wildcard active for ${editableContext.gameweek.label}`
          : effectiveChip === "all-star"
            ? `All-Star active for ${editableContext.gameweek.label}`
            : editableContext.transferWindow.mode === "LIMITLESS"
              ? `Unlimited before ${editableContext.gameweek.label} deadline`
              : cost < 0
                ? `Penalty transfer for ${editableContext.transferWindow.label}`
                : `Free transfer for ${editableContext.transferWindow.label}`,
      windowKey: editableContext.transferWindow.key,
      countsTowardLimit
    });
  }

  const nextChips: UserChipsState = {
    transferWindowSnapshot: currentWindowSnapshot,
    wildcard: { ...chips.wildcard },
    allStar: { ...chips.allStar }
  };

  if (!effectiveChip && !nextChips.transferWindowSnapshot && drafts.length) {
    nextChips.transferWindowSnapshot = buildTransferWindowSnapshot(baseState, editableContext.period.key);
  }

  if (activatingChipNow) {
    nextChips.transferWindowSnapshot = null;
  }

  if (effectiveChip === "wildcard") {
    nextChips.wildcard.used = true;
    nextChips.wildcard.activePeriodKey = editableContext.period.key;
    nextChips.wildcard.activatedAt = nextChips.wildcard.activatedAt ?? new Date().toISOString();
  }

  if (effectiveChip === "all-star") {
    nextChips.allStar.used = true;
    nextChips.allStar.activePeriodKey = editableContext.period.key;
    nextChips.allStar.activatedAt = nextChips.allStar.activatedAt ?? new Date().toISOString();
    nextChips.allStar.originalLineup =
      activatingChipNow || !nextChips.allStar.originalLineup ? buildStoredLineupSnapshot(baseState) : nextChips.allStar.originalLineup;
    nextChips.allStar.activeLineup = buildStoredLineupSnapshot(workingState);
  }

  baseState.totalTransfers += drafts.length;
  baseState.history = [...historyEntries.reverse(), ...baseState.history];
  syncTransferWindowState(baseState, editableContext.transferWindow);

  if (effectiveChip !== "all-star") {
    applyStoredLineupSnapshot(baseState, buildStoredLineupSnapshot(workingState));
  }

  const transfersUsedThisRound = baseState.history.filter(
    (item) => item.windowKey === editableContext.transferWindow.key && item.countsTowardLimit !== false
  ).length;
  const roundPenalty = editableContext.transferWindow.mode === "LIMITLESS" ? 0 : -100 * Math.max(0, transfersUsedThisRound - editableContext.transferWindow.limit);
  const totalPoints = await syncLeaguePointsAdjustment(env, userId, {
    key: penaltyEntryKey,
    label: `Transfer penalty for ${editableContext.transferWindow.label}`,
    roundNumber: editableContext.period.roundNumber,
    dayNumber: editableContext.period.dayNumber,
    points: roundPenalty
  });
  baseState.overallPoints = Number(totalPoints.toFixed(1));

  await saveStateForUser(env, userId, baseState);
  await saveUserChipsState(env, userId, nextChips);

  return {
    ok: true as const,
    state: baseState,
    chips: nextChips,
    workingState
  };
}

async function requireAuth(request: Request, env: Env) {
  const token = extractBearerToken(request);
  const authUser = await getAuthenticatedUserByToken(env, token);

  if (!authUser) {
    return {
      ok: false as const,
      response: json({ message: "Unauthorized. Please log in." }, { status: 401 }, env)
    };
  }

  return {
    ok: true as const,
    authUser: {
      ...authUser,
      token: token ?? undefined
    } satisfies AuthUser
  };
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export default {
  async fetch(request: Request, env: Env) {
    const corsResponse = handleCorsPreflight(request, env);
    if (corsResponse) {
      return corsResponse;
    }

    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    try {
      if (pathname === "/api/health" && request.method === "GET") {
        return json({ status: "ok", service: "playoff-fantasy-api", dbPath: DB_PATH_LABEL }, { status: 200 }, env);
      }

      if (pathname === "/api/auth/register" && request.method === "POST") {
        const body = await parseJsonBody<{
          account?: string;
          gameId?: string;
          password?: string;
          confirmPassword?: string;
        }>(request);

        const account = String(body.account ?? "").trim();
        const gameId = String(body.gameId ?? "").trim();
        const password = String(body.password ?? "");
        const confirmPassword = String(body.confirmPassword ?? "");

        if (!account || !gameId || !password || !confirmPassword) {
          return json({ message: "account, gameId, password, and confirmPassword are required." }, { status: 400 }, env);
        }

        if (password !== confirmPassword) {
          return json({ message: "Password and confirmPassword do not match." }, { status: 400 }, env);
        }

        if (password.length < 4) {
          return json({ message: "Password must be at least 4 characters." }, { status: 400 }, env);
        }

        const existingUser = await getUserByAccount(env, account);
        if (existingUser) {
          return json({ message: "Account already exists." }, { status: 400 }, env);
        }

        const existingGameUser = await getUserByGameId(env, gameId);
        if (existingGameUser) {
          return json({ message: "Game ID already exists." }, { status: 400 }, env);
        }

        try {
          const passwordHash = bcrypt.hashSync(password, 10);
          const user = await registerUser(env, account, gameId, passwordHash);
          const token = await createSession(env, user.id);

          return json({ token, user }, { status: 201 }, env);
        } catch (error) {
          const message =
            error instanceof Error && error.message.includes("users.game_id")
              ? "Game ID already exists."
              : error instanceof Error && error.message.includes("UNIQUE constraint failed")
                ? "Account already exists."
                : "Failed to register user.";
          return json({ message }, { status: 500 }, env);
        }
      }

      if (pathname === "/api/auth/login" && request.method === "POST") {
        const body = await parseJsonBody<{ account?: string; password?: string }>(request);
        const account = String(body.account ?? "").trim();
        const password = String(body.password ?? "");

        if (!account || !password) {
          return json({ message: "account and password are required." }, { status: 400 }, env);
        }

        const user = await getUserByAccount(env, account);
        if (!user?.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
          return json({ message: "Invalid account or password." }, { status: 401 }, env);
        }

        const token = await createSession(env, user.id);
        return json({ token, user: buildPublicUser({ id: user.id, account: user.account, gameId: user.gameId }) }, { status: 200 }, env);
      }

      if (pathname === "/api/auth/logout" && request.method === "POST") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        if (auth.authUser.token) {
          await deleteSession(env, auth.authUser.token);
        }

        return json({ ok: true }, { status: 200 }, env);
      }

      if (pathname === "/api/auth/me" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        return json({ user: buildPublicUser(auth.authUser) }, { status: 200 }, env);
      }

      if (pathname === "/api/meta/player-data" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        return json(await getPlayerDataSummary(env), { status: 200 }, env);
      }

      if (pathname === "/api/players" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const state = await getStateForUser(env, auth.authUser.id);
        let excludeIds: string[] = [];
        if (state) {
          const chips = await getUserChipsState(env, auth.authUser.id);
          const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
          const effectiveState = getTransactionsState(state, chips, editableContext);
          excludeIds = getRosterPlayers(effectiveState).map((player) => player.id);
        }
        const nextMatchupByTeam = await getNextMatchupByTeam(env);
        const players = await searchPlayerPool(
          env,
          {
            search: url.searchParams.get("search"),
            position: url.searchParams.get("position"),
            teamId: url.searchParams.get("teamId"),
            maxSalary: url.searchParams.get("maxSalary"),
            excludeIds,
            limit: url.searchParams.get("limit"),
            sort: url.searchParams.get("sort")
          },
          nextMatchupByTeam
        );

        return json(
          {
            players,
            meta: await getPlayerDataSummary(env)
          },
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/team/create" && request.method === "POST") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const body = await parseJsonBody<{ playerIds?: unknown }>(request);
        const playerIds = [...new Set(asStringArray(body.playerIds))];
        const state = await safeLoadState(env, auth.authUser.id);

        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const nextMatchupByTeam = await getNextMatchupByTeam(env);
        const players = await getPlayersByIds(env, playerIds, nextMatchupByTeam);
        if (players.length !== 10) {
          return json({ message: "Some selected players were not found." }, { status: 400 }, env);
        }

        const result = createInitialTeamForState({
          state,
          players,
          budget: await getInitialBudget(env),
          weeklyFreeTransfers: await getWeeklyFreeTransfers(env)
        });

        if (!result.ok) {
          return json({ message: result.error }, { status: 400 }, env);
        }

        await saveStateForUser(env, auth.authUser.id, state);
        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        syncTransferWindowState(state, editableContext.transferWindow);
        return json(
          buildLineupPayload({
            state,
            gameweek: editableContext.gameweek,
            budget: await getInitialBudget(env),
            beforeFirstDeadline: editableContext.beforeCompetitionStart,
            transferWindow: editableContext.transferWindow
          }),
          { status: 201 },
          env
        );
      }

      if (pathname === "/api/profile" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const chips = await getUserChipsState(env, auth.authUser.id);
        if (hasCreatedTeam(state)) {
          await backfillOfficialPointsLedger(env, auth.authUser.id, state, chips);
        }
        await syncProfileStandingState(env, auth.authUser.id, state);

        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        syncTransferWindowState(state, editableContext.transferWindow);
        const beforeDeadline = editableContext.beforeCompetitionStart;
        const displayState = getDisplayProfileState(state, beforeDeadline);
        const currentScoringPeriod = (await getScoringPeriodContext(env)) as ScoringPeriodContext;
        const scoringState = getScoringState(state, chips, currentScoringPeriod);
        const preserveRosterPoints =
          Boolean(currentScoringPeriod) &&
          isChipActiveForPeriod(chips.allStar.activePeriodKey, currentScoringPeriod?.key) &&
          Boolean(chips.allStar.activeLineup);
        const livePreview = hasCreatedTeam(state) ? await buildOfficialLivePointsPreview(env, scoringState, beforeDeadline).catch(() => null) : null;
        const fallbackProfilePoints = !beforeDeadline ? buildStoredPointsSnapshot(scoringState, currentScoringPeriod) : null;

        if (livePreview) {
          syncPointsSnapshot(scoringState, livePreview.lineup, livePreview.finalPoints);
          syncPersistedPointsState(state, livePreview.lineup, livePreview.finalPoints, preserveRosterPoints);
        }

        if (!beforeDeadline) {
          const currentPoints = Number(livePreview?.finalPoints ?? fallbackProfilePoints?.summary.final ?? displayState.gamedayPoints ?? 0);
          state.gamedayPoints = currentPoints;
          const overallPoints = await syncLeaguePointsLedger(env, auth.authUser.id, currentScoringPeriod, currentPoints);
          state.overallPoints = Number(overallPoints.toFixed(1));
          displayState.overallPoints = state.overallPoints;
          displayState.gamedayPoints = currentPoints;
          await saveStateForUser(env, auth.authUser.id, state);
        } else if (livePreview) {
          await saveStateForUser(env, auth.authUser.id, state);
        }

        return json(
          {
            profile: {
              teamName: displayState.teamName,
              managerName: displayState.managerName,
              overallPoints: displayState.overallPoints,
              overallRank: displayState.overallRank,
              totalPlayers: displayState.totalPlayers,
              gamedayPoints: livePreview?.finalPoints ?? displayState.gamedayPoints,
              fanLeague: displayState.fanLeague
            },
            transactions: {
              freeLeft: editableContext.transferWindow.mode === "LIMITLESS" ? 999 : Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
              total: state.totalTransfers,
              rosterValue: state.rosterValue,
              bank: state.bank
            },
            leagues: {
              global: [],
              privateClassic: []
            }
          },
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/lineup" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        syncTransferWindowState(state, editableContext.transferWindow);
        return json(
          buildLineupPayload({
            state,
            gameweek: editableContext.gameweek,
            budget: await getInitialBudget(env),
            beforeFirstDeadline: editableContext.beforeCompetitionStart,
            transferWindow: editableContext.transferWindow
          }),
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/lineup" && request.method === "PUT") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const body = await parseJsonBody<{
          starters?: Player[];
          bench?: Player[];
          captainId?: string;
        }>(request);

        const proposedStarters = Array.isArray(body.starters) ? body.starters : state.starters;
        const proposedBench = Array.isArray(body.bench) ? body.bench : state.bench;

        if (proposedStarters.length !== 5) {
          return json({ message: "starters must contain 5 players." }, { status: 400 }, env);
        }

        if (proposedBench.length !== 5) {
          return json({ message: "bench must contain 5 players." }, { status: 400 }, env);
        }

        if (!isValidStarterMix(proposedStarters)) {
          return json({ message: "Starting 5 must stay in a 3BC/2FC or 3FC/2BC shape." }, { status: 400 }, env);
        }

        const currentIds = [...state.starters, ...state.bench].map((player) => player.id).sort();
        const proposedIds = [...proposedStarters, ...proposedBench].map((player) => player.id).sort();
        if (currentIds.join("|") !== proposedIds.join("|")) {
          return json({ message: "Line-up save can only reorder players already in your roster." }, { status: 400 }, env);
        }

        const proposedCaptainId = body.captainId ?? state.captainId;
        if (proposedCaptainId && !proposedStarters.some((player) => player.id === proposedCaptainId)) {
          return json({ message: "Captain must be selected from your Starting 5." }, { status: 400 }, env);
        }

        state.starters = proposedStarters;
        state.bench = proposedBench;
        state.captainId = proposedCaptainId ?? "";
        state.captainDecisionLocked = false;

        await saveStateForUser(env, auth.authUser.id, state);
        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        syncTransferWindowState(state, editableContext.transferWindow);

        return json(
          buildLineupPayload({
            state,
            gameweek: editableContext.gameweek,
            budget: await getInitialBudget(env),
            beforeFirstDeadline: editableContext.beforeCompetitionStart,
            transferWindow: editableContext.transferWindow
          }),
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/points/today" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const result = await buildPointsPayloadForUser(env, auth.authUser.id, auth.authUser.id);
        return result.ok ? json(result.payload, { status: 200 }, env) : result.response;
      }

      if (pathname === "/api/standings" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        return json(await buildStandingPayload(env, url.searchParams.get("phase")), { status: 200 }, env);
      }

      if (pathname === "/api/standings/preview" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const targetUserId = String(url.searchParams.get("userId") ?? "").trim();
        if (!targetUserId) {
          return json({ message: "userId is required." }, { status: 400 }, env);
        }

        const result = await buildPointsPayloadForUser(env, targetUserId, auth.authUser.id);
        return result.ok ? json(result.payload, { status: 200 }, env) : result.response;
      }

      if (pathname === "/api/transactions/options" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const chips = await getUserChipsState(env, auth.authUser.id);
        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        syncTransferWindowState(state, editableContext.transferWindow);
        const transactionsState = getTransactionsState(state, chips, editableContext);
        const nextMatchupByTeam = await getNextMatchupByTeam(env);
        const market = await searchPlayerPool(
          env,
          {
            excludeIds: getRosterPlayers(transactionsState).map((player) => player.id),
            limit: 80
          },
          nextMatchupByTeam
        );

        return json(
          buildTransactionsPayload({
            state: transactionsState,
            gameweek: editableContext.gameweek,
            market,
            beforeFirstDeadline: editableContext.beforeCompetitionStart,
            transferWindow: editableContext.transferWindow,
            chips: getTransactionsChipCards(chips, editableContext)
          }),
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/transactions/confirm" && request.method === "POST") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const body = await parseJsonBody<{
          transfers?: Array<{ outPlayerId?: string; inPlayerId?: string }>;
          chip?: string | null;
        }>(request);
        const drafts = Array.isArray(body.transfers)
          ? body.transfers
              .map((item) => ({
                outPlayerId: String(item.outPlayerId ?? "").trim(),
                inPlayerId: String(item.inPlayerId ?? "").trim()
              }))
              .filter((item) => item.outPlayerId && item.inPlayerId)
          : [];
        const requestedChip = body.chip === "wildcard" || body.chip === "all-star" ? body.chip : null;

        if (!drafts.length) {
          return json({ message: "At least one transfer is required." }, { status: 400 }, env);
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const chips = await getUserChipsState(env, auth.authUser.id);
        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        const committed = await commitTransactionBatch({
          env,
          userId: auth.authUser.id,
          baseState: state,
          chips,
          editableContext,
          drafts,
          requestedChip
        });

        if (!committed.ok) {
          return json({ message: committed.error }, { status: 400 }, env);
        }

        const payloadState = getTransactionsState(committed.state, committed.chips, editableContext);
        const nextMatchupByTeam = await getNextMatchupByTeam(env);
        const market = await searchPlayerPool(
          env,
          {
            excludeIds: getRosterPlayers(payloadState).map((player) => player.id),
            limit: 80
          },
          nextMatchupByTeam
        );

        return json(
          {
            ok: true,
            payload: buildTransactionsPayload({
              state: payloadState,
              gameweek: editableContext.gameweek,
              market,
              beforeFirstDeadline: editableContext.beforeCompetitionStart,
              transferWindow: editableContext.transferWindow,
              chips: getTransactionsChipCards(committed.chips, editableContext)
            })
          },
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/transactions" && request.method === "POST") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const body = await parseJsonBody<{ outPlayerId?: string; inPlayerId?: string }>(request);
        const outPlayerId = String(body.outPlayerId ?? "").trim();
        const inPlayerId = String(body.inPlayerId ?? "").trim();

        if (!outPlayerId || !inPlayerId) {
          return json({ message: "outPlayerId and inPlayerId are required." }, { status: 400 }, env);
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const chips = await getUserChipsState(env, auth.authUser.id);
        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        const committed = await commitTransactionBatch({
          env,
          userId: auth.authUser.id,
          baseState: state,
          chips,
          editableContext,
          drafts: [{ outPlayerId, inPlayerId }],
          requestedChip: null
        });

        if (!committed.ok) {
          return json({ message: committed.error }, { status: 400 }, env);
        }

        const payloadState = getTransactionsState(committed.state, committed.chips, editableContext);
        const nextMatchupByTeam = await getNextMatchupByTeam(env);
        const market = await searchPlayerPool(
          env,
          {
            excludeIds: getRosterPlayers(payloadState).map((player) => player.id),
            limit: 80
          },
          nextMatchupByTeam
        );

        return json(
          {
            ok: true,
            payload: buildTransactionsPayload({
              state: payloadState,
              gameweek: editableContext.gameweek,
              market,
              beforeFirstDeadline: editableContext.beforeCompetitionStart,
              transferWindow: editableContext.transferWindow,
              chips: getTransactionsChipCards(committed.chips, editableContext)
            })
          },
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/leagues" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        return json(
          {
            privateClassic: await listPrivateLeaguesForUser(env, auth.authUser.id),
            publicClassic: [],
            global: []
          },
          { status: 200 },
          env
        );
      }

      const leagueMatch = pathname.match(/^\/api\/leagues\/([^/]+)$/);
      if (leagueMatch && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const leagues = await listPrivateLeaguesForUser(env, auth.authUser.id);
        const league = leagues.find((item) => item.id === String(leagueMatch[1]));
        if (!league) {
          return json({ message: "League not found." }, { status: 404 }, env);
        }

        return json(
          { league: await buildLeagueDetailPayload(env, league, url.searchParams.get("phase")) },
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/leagues/create" && request.method === "POST") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const body = await parseJsonBody<{ name?: string }>(request);
        const name = String(body.name ?? "").trim();

        if (!name) {
          return json({ message: "League name is required." }, { status: 400 }, env);
        }

        if (name.length > 30) {
          return json({ message: "League name must be 30 characters or fewer." }, { status: 400 }, env);
        }

        try {
          const league = await createPrivateLeague(env, auth.authUser.id, name);
          return json(
            {
              league,
              leagues: {
                privateClassic: await listPrivateLeaguesForUser(env, auth.authUser.id),
                publicClassic: [],
                global: []
              }
            },
            { status: 201 },
            env
          );
        } catch (error) {
          return json({ message: error instanceof Error ? error.message : "Failed to create league." }, { status: 500 }, env);
        }
      }

      if (pathname === "/api/leagues/join" && request.method === "POST") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const body = await parseJsonBody<{ code?: string }>(request);
        const result = await joinPrivateLeague(env, auth.authUser.id, String(body.code ?? ""));
        if (!result.ok) {
          return json({ message: result.error }, { status: 400 }, env);
        }

        return json(
          {
            league: result.league,
            leagues: {
              privateClassic: await listPrivateLeaguesForUser(env, auth.authUser.id),
              publicClassic: [],
              global: []
            }
          },
          { status: 201 },
          env
        );
      }

      if (pathname === "/api/schedule" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (state && hasCreatedTeam(state)) {
          const chips = await getUserChipsState(env, auth.authUser.id);
          await backfillOfficialPointsLedger(env, auth.authUser.id, state, chips);
          await saveStateForUser(env, auth.authUser.id, state);
        }

        const officialTimeline = await getOfficialScheduleTimeline(env).catch(() => null);
        if (officialTimeline?.games?.length) {
          return json(
            {
              gameweek: officialTimeline.gameweek,
              deadline: officialTimeline.deadline,
              games: officialTimeline.games.map((game) => ({
                id: game.id,
                date: game.date,
                tipoff: game.tipoff,
                gamedayKey: game.gamedayKey,
                gamedayLabel: game.gamedayLabel,
                gamedayDateLabel: game.gamedayDateLabel,
                gamedayIndex: game.gamedayIndex,
                home: game.home,
                away: game.away,
                homeTeam: game.homeTeam ?? undefined,
                awayTeam: game.awayTeam ?? undefined,
                status: game.status,
                homeScore: game.homeScore,
                awayScore: game.awayScore,
                statusText: game.statusText,
                stageLabel: game.stageLabel
              }))
            },
            { status: 200 },
            env
          );
        }

        return json(await buildSchedulePayload(env), { status: 200 }, env);
      }

      if (pathname === "/api/help/rules" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        return json(HELP_RULES, { status: 200 }, env);
      }

      return json({ message: "Not found." }, { status: 404 }, env);
    } catch (error) {
      console.error(error);
      return json(
        {
          message: error instanceof Error ? error.message : "Internal server error"
        },
        { status: 500 },
        env
      );
    }
  }
};
