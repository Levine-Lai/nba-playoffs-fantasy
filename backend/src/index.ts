import bcrypt from "bcryptjs";
import { HELP_RULES, POINTS_BASELINE } from "./shared/gameTemplate";
import {
  applyStoredLineupSnapshot,
  buildLineupPayload,
  buildStoredLineupSnapshot,
  buildTransactionsPayload,
  calcFinalPoints,
  countTrackedTotalTransfers,
  createInitialTeamForState,
  getEffectiveScoringPlayerIds,
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
import { buildHomeLeadersPayload, buildOfficialLivePointsPreview, buildOfficialPointsPreviewForPeriod, buildScheduleGameDetailPayload, buildSchedulePayload, getEditablePeriodContext, getGameweekPayload, getNextMatchupByTeam, getOfficialPlayoffPeriodByPhaseKey, getOfficialPlayoffPeriods, getOfficialScheduleTimeline, getScoringPeriodContext, getStandingPhaseOptionsByDay } from "./worker/liveData";
import {
  buildPublicUser,
  createSession,
  DB_PATH_LABEL,
  deleteSession,
  getAuthenticatedUserByToken,
  getPlayerDataSummary,
  getPlayersByIds,
  getPlayersByNames,
  getPublicUserById,
  getRuleValue,
  getStateForUser,
  getUserByAccount,
  getUserByGameId,
  getUserChipsState,
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
  LineupCorrectionOverride,
  LineupCorrectionRegistry,
  LineupLockRegistry,
  LockedLineupEntry,
  Player,
  StandingMemberEntry,
  StoredLineupSnapshot,
  TransferWindowSnapshot,
  TransferHistoryItem,
  UserChipCardState,
  UserChipsState,
  UserState
} from "./worker/types";

const LEAGUE_POINTS_LEDGER_KEY = "league_points_ledger_v1";
const LINEUP_LOCKS_KEY = "lineup_locks_v1";
const LINEUP_CORRECTIONS_KEY = "lineup_corrections_v1";

const DEFAULT_LINEUP_CORRECTIONS: LineupCorrectionRegistry = {
  kusuri: {
    "day:2026-04-18": {
      matchBy: "name",
      starters: ["S.Castle", "J.Brunson", "A.Mitchell", "D.Avdija", "N.Queta"],
      bench: ["L.James", "J.Tyson", "N.Alexander-Walker", "J.Randle", "B.Brown"],
      capturedAt: "2026-04-19T05:20:00.000Z",
      note: "Day 1 lineup restored from the 2026-04-19 13:20 standing capture."
    }
  }
};

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
type LoadStateOptions = {
  hydrateAssets?: boolean;
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
  return Number((await getRuleValue(env, "weekly_free_transfers", "6")) ?? "6");
}

async function getTransferPenalty(env: Env) {
  return Number((await getRuleValue(env, "transfer_penalty", "50")) ?? "50");
}

async function getFirstDeadline(env: Env) {
  return (await getRuleValue(env, "first_deadline", "2026-04-18T16:30:00Z")) ?? "2026-04-18T16:30:00Z";
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

function buildChipTransferNote(chip: TransactionChipChoice, gameweekLabel: string) {
  return chip === "wildcard" ? `Wildcard active for ${gameweekLabel}` : `All-Star active for ${gameweekLabel}`;
}

function neutralizeTransferWindowCosts(history: TransferHistoryItem[], periodKey: string, note: string) {
  return history.map((item) =>
    item.windowKey === periodKey
      ? {
          ...item,
          cost: 0,
          countsTowardLimit: false,
          note
        }
      : item
  );
}

function isChipActiveForPeriod(activePeriodKey: string | null | undefined, periodKey: string | null | undefined) {
  return Boolean(activePeriodKey && periodKey && activePeriodKey === periodKey);
}

function getTransactionsChipCards(chips: UserChipsState, editableContext: EditablePeriodContext): TransactionChipCards {
  const wildcardActive = isChipActiveForPeriod(chips.wildcard.activePeriodKey, editableContext.period.key);
  const allStarActive = isChipActiveForPeriod(chips.allStar.activePeriodKey, editableContext.period.key);
  const chipsUnlocked = !editableContext.beforeCompetitionStart;

  return {
    wildcard: {
      label: wildcardActive ? "Active" : chips.wildcard.used ? "Played" : "Play",
      canActivate: chipsUnlocked && !chips.wildcard.used && !allStarActive,
      isActive: wildcardActive,
      isPlayed: chips.wildcard.used && !wildcardActive
    },
    allStar: {
      label: allStarActive ? "Active" : chips.allStar.used ? "Played" : "Play",
      canActivate: chipsUnlocked && !chips.allStar.used && !wildcardActive,
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
  const effectiveIds = getEffectiveScoringPlayerIds({
    ...state,
    starters,
    bench
  });
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
      starters: starters.map((player) => ({
        ...player,
        countsForGameday: effectiveIds.has(player.id)
      })),
      bench: bench.map((player) => ({
        ...player,
        countsForGameday: effectiveIds.has(player.id)
      })),
      captainId: ""
    }
  };
}

function cloneStoredLineupSnapshot(snapshot: StoredLineupSnapshot): StoredLineupSnapshot {
  return {
    starters: snapshot.starters.map(clonePlayer),
    bench: snapshot.bench.map(clonePlayer),
    captainId: snapshot.captainId ?? "",
    rosterValue: Number(snapshot.rosterValue ?? 0),
    bank: Number(snapshot.bank ?? 0)
  };
}

function cloneLockedLineupEntry(entry: LockedLineupEntry): LockedLineupEntry {
  return {
    snapshot: cloneStoredLineupSnapshot(entry.snapshot),
    capturedAt: entry.capturedAt,
    source: entry.source,
    note: entry.note
  };
}

function cloneLineupCorrectionOverride(override: LineupCorrectionOverride): LineupCorrectionOverride {
  return {
    starters: [...override.starters],
    bench: [...override.bench],
    matchBy: override.matchBy,
    capturedAt: override.capturedAt,
    note: override.note
  };
}

function cloneLineupCorrectionRegistry(registry: LineupCorrectionRegistry): LineupCorrectionRegistry {
  return Object.fromEntries(
    Object.entries(registry).map(([userKey, periods]) => [
      userKey,
      Object.fromEntries(
        Object.entries(periods).map(([periodKey, override]) => [periodKey, cloneLineupCorrectionOverride(override)])
      )
    ])
  );
}

function mergeLineupCorrectionRegistry(
  base: LineupCorrectionRegistry,
  override: LineupCorrectionRegistry
): LineupCorrectionRegistry {
  const merged = cloneLineupCorrectionRegistry(base);
  for (const [userKey, periodOverrides] of Object.entries(override)) {
    const normalizedUserKey = String(userKey).trim().toLowerCase();
    merged[normalizedUserKey] = {
      ...(merged[normalizedUserKey] ?? {}),
      ...Object.fromEntries(
        Object.entries(periodOverrides ?? {}).map(([periodKey, correction]) => [periodKey, cloneLineupCorrectionOverride(correction)])
      )
    };
  }

  return merged;
}

async function readLineupLockRegistry(env: Env) {
  return readAppState<LineupLockRegistry>(env, LINEUP_LOCKS_KEY, {});
}

async function writeLineupLockRegistry(env: Env, registry: LineupLockRegistry) {
  await writeAppState(env, LINEUP_LOCKS_KEY, registry);
}

async function readLineupCorrectionRegistry(env: Env) {
  const stored = await readAppState<LineupCorrectionRegistry>(env, LINEUP_CORRECTIONS_KEY, {});
  return mergeLineupCorrectionRegistry(DEFAULT_LINEUP_CORRECTIONS, stored);
}

function getStoredLineupLock(
  registry: LineupLockRegistry,
  userId: string | number,
  periodKey: string
) {
  const entry = registry[String(userId)]?.[periodKey];
  return entry ? cloneLockedLineupEntry(entry) : null;
}

function setStoredLineupLock(
  registry: LineupLockRegistry,
  userId: string | number,
  periodKey: string,
  entry: LockedLineupEntry
) {
  const userKey = String(userId);
  registry[userKey] = {
    ...(registry[userKey] ?? {}),
    [periodKey]: cloneLockedLineupEntry(entry)
  };
}

function buildCorrectionLookupKeys(userId: string | number, gameId: string) {
  return [String(userId), String(gameId ?? "").trim().toLowerCase()].filter(Boolean);
}

function getLineupCorrectionOverride(
  registry: LineupCorrectionRegistry,
  userId: string | number,
  gameId: string,
  periodKey: string
) {
  for (const lookupKey of buildCorrectionLookupKeys(userId, gameId)) {
    const override = registry[lookupKey]?.[periodKey];
    if (override) {
      return cloneLineupCorrectionOverride(override);
    }
  }

  return null;
}

function getLineupCorrectionPeriodKeys(
  registry: LineupCorrectionRegistry,
  userId: string | number,
  gameId: string
) {
  const keys = new Set<string>();
  for (const lookupKey of buildCorrectionLookupKeys(userId, gameId)) {
    for (const periodKey of Object.keys(registry[lookupKey] ?? {})) {
      keys.add(periodKey);
    }
  }

  return [...keys];
}

function shouldBackfillHistoricalCorrections(
  registry: LineupCorrectionRegistry,
  userId: string | number,
  gameId: string,
  currentPeriodKey: string | null | undefined
) {
  return getLineupCorrectionPeriodKeys(registry, userId, gameId).some((periodKey) => periodKey !== currentPeriodKey);
}

function buildSnapshotFromCorrectionOverride(
  state: UserState,
  override: LineupCorrectionOverride
): StoredLineupSnapshot | null {
  const roster = getRosterPlayers(state);
  const matchByName = override.matchBy === "name";
  const rosterById = new Map(roster.map((player) => [String(player.id), player]));
  const rosterByName = new Map(roster.map((player) => [String(player.name ?? "").trim().toLowerCase(), player]));
  const resolvePlayer = (token: string) => {
    if (matchByName) {
      return rosterByName.get(String(token ?? "").trim().toLowerCase()) ?? null;
    }

    return rosterById.get(String(token ?? "").trim()) ?? null;
  };

  const starters = override.starters.map(resolvePlayer);
  const bench = override.bench.map(resolvePlayer);
  if (starters.some((player) => !player) || bench.some((player) => !player)) {
    return null;
  }

  const orderedPlayers = [...starters, ...bench] as Player[];
  const currentRosterIds = roster.map((player) => String(player.id)).sort();
  const orderedIds = orderedPlayers.map((player) => String(player.id)).sort();
  const hasSameRoster =
    orderedPlayers.length === roster.length &&
    currentRosterIds.length === orderedIds.length &&
    currentRosterIds.every((playerId, index) => playerId === orderedIds[index]);

  if (!hasSameRoster || !isValidStarterMix(starters as Player[])) {
    return null;
  }

  return {
    starters: (starters as Player[]).map(clonePlayer),
    bench: (bench as Player[]).map(clonePlayer),
    captainId: state.captainId ?? "",
    rosterValue: Number(state.rosterValue ?? 0),
    bank: Number(state.bank ?? 0)
  };
}

function resolveLineupStateForPeriod(params: {
  registry: LineupLockRegistry;
  corrections: LineupCorrectionRegistry;
  userId: string | number;
  gameId: string;
  periodKey: string;
  sourceState: UserState;
  createIfMissing: boolean;
}) {
  const { registry, corrections, userId, gameId, periodKey, sourceState, createIfMissing } = params;
  const existingEntry = getStoredLineupLock(registry, userId, periodKey);
  if (existingEntry) {
    return {
      state: buildStateFromSnapshot(sourceState, existingEntry.snapshot),
      registryChanged: false
    };
  }

  const override = getLineupCorrectionOverride(corrections, userId, gameId, periodKey);
  if (override) {
    const correctedSnapshot = buildSnapshotFromCorrectionOverride(sourceState, override);
    if (correctedSnapshot) {
      setStoredLineupLock(registry, userId, periodKey, {
        snapshot: correctedSnapshot,
        capturedAt: override.capturedAt ?? new Date().toISOString(),
        source: "manual-correction",
        note: override.note
      });
      return {
        state: buildStateFromSnapshot(sourceState, correctedSnapshot),
        registryChanged: true
      };
    }
  }

  if (!createIfMissing) {
    return {
      state: cloneState(sourceState),
      registryChanged: false
    };
  }

  const snapshot = buildStoredLineupSnapshot(sourceState);
  setStoredLineupLock(registry, userId, periodKey, {
    snapshot,
    capturedAt: new Date().toISOString(),
    source: "deadline-lock"
  });
  return {
    state: buildStateFromSnapshot(sourceState, snapshot),
    registryChanged: true
  };
}

async function readLeaguePointsLedger(env: Env) {
  return readAppState<LeaguePointsLedger>(env, LEAGUE_POINTS_LEDGER_KEY, {});
}

async function writeLeaguePointsLedger(env: Env, ledger: LeaguePointsLedger) {
  await writeAppState(env, LEAGUE_POINTS_LEDGER_KEY, ledger);
}

function isLedgerEntryAllowedForPeriods(entry: LeaguePointsLedgerEntry, allowedPeriodKeys: Set<string>) {
  const periodKey = String(entry.periodKey ?? "");
  if (allowedPeriodKeys.has(periodKey)) {
    return true;
  }

  const penaltyMatch = periodKey.match(/^penalty:(day:.+)$/);
  return Boolean(penaltyMatch && allowedPeriodKeys.has(penaltyMatch[1]));
}

async function pruneLeaguePointsLedgerForUser(env: Env, userId: string | number, allowedPeriodKeys: Set<string>) {
  const ledger = await readLeaguePointsLedger(env);
  const userKey = String(userId);
  const currentEntries = ledger[userKey];
  if (!currentEntries) {
    return;
  }

  const filteredEntries = Object.fromEntries(
    Object.entries(currentEntries).filter(([, entry]) => isLedgerEntryAllowedForPeriods(entry, allowedPeriodKeys))
  );

  if (Object.keys(filteredEntries).length === Object.keys(currentEntries).length) {
    return;
  }

  if (Object.keys(filteredEntries).length) {
    ledger[userKey] = filteredEntries;
  } else {
    delete ledger[userKey];
  }

  await writeLeaguePointsLedger(env, ledger);
}

function sumLeagueLedgerPoints(entries: LeaguePointsLedgerEntry[] | undefined) {
  return Number(
    ((entries ?? []).reduce((sum, entry) => sum + Number(entry.points ?? 0), 0)).toFixed(1)
  );
}

async function getStandingPhaseOptions(env: Env) {
  return getStandingPhaseOptionsByDay(env);
}

function getLeaguePhasePoints(entries: LeaguePointsLedgerEntry[] | undefined, phaseKey: string) {
  if (phaseKey === "overall") {
    return sumLeagueLedgerPoints(entries);
  }

  const dayMatch = phaseKey.match(/^day-(\d+)$/);
  if (dayMatch) {
    const targetDay = Number(dayMatch[1]);
    return Number(
      ((entries ?? [])
        .filter((entry) => entry.dayNumber === targetDay)
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
    Object.entries(existingUserLedger).filter(([key]) => {
      if (key === entryKey || key.startsWith(`${entryKey}:`)) {
        return false;
      }

      if (entryKey.startsWith("penalty:day:") && /^penalty:(round-|play-in-)/.test(key)) {
        return false;
      }

      return true;
    })
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

function countPenaltyTransfersForPeriod(history: TransferHistoryItem[], periodKey: string) {
  return history.filter((item) => item.windowKey === periodKey && Number(item.cost ?? 0) < 0).length;
}

function compareStandingIdentity(left: StandingMemberEntry, right: StandingMemberEntry) {
  const teamNameDiff = String(left.teamName ?? "").localeCompare(String(right.teamName ?? ""), undefined, { sensitivity: "base" });
  if (teamNameDiff !== 0) {
    return teamNameDiff;
  }

  return String(left.gameId ?? "").localeCompare(String(right.gameId ?? ""), undefined, { sensitivity: "base" });
}

function buildRankedMembers(members: StandingMemberEntry[], phaseKey: string, ledger: LeaguePointsLedger) {
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

      const transferDiff = Number(left.totalTransfers ?? 0) - Number(right.totalTransfers ?? 0);
      if (transferDiff !== 0) {
        return transferDiff;
      }

      return compareStandingIdentity(left, right);
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

      const transferDiff = Number(left.totalTransfers ?? 0) - Number(right.totalTransfers ?? 0);
      if (transferDiff !== 0) {
        return transferDiff;
      }

      return compareStandingIdentity(left, right);
    })
    .map((member, index) => ({
      ...member,
      rank: index + 1
    }));
}

async function buildStandingPayload(env: Env, requestedPhaseKey: string | null) {
  const phaseOptions = await getStandingPhaseOptions(env);
  const selectedPhaseKey = phaseOptions.some((option) => option.key === requestedPhaseKey)
    ? String(requestedPhaseKey)
    : "overall";
  const beforeDeadline = await isBeforeFirstDeadline(env);
  let members = await listStandingMembers(env);

  if (!beforeDeadline) {
    const currentScoringPeriod = ((await getScoringPeriodContext(env).catch(() => null)) ?? null) as ScoringPeriodContext | null;

    if (currentScoringPeriod) {
      const lineupLocks = await readLineupLockRegistry(env);
      const lineupCorrections = await readLineupCorrectionRegistry(env);
      let shouldPersistLineupLocks = false;

      for (const member of members) {
        const state = await safeLoadState(env, member.userId, { hydrateAssets: false });
        if (!state || !hasCreatedTeam(state)) {
          continue;
        }

        const chips = await getUserChipsState(env, member.userId);
        const resolvedScoringState = resolveLineupStateForPeriod({
          registry: lineupLocks,
          corrections: lineupCorrections,
          userId: member.userId,
          gameId: member.gameId,
          periodKey: currentScoringPeriod.key,
          sourceState: getScoringState(state, chips, currentScoringPeriod),
          createIfMissing: true
        });
        shouldPersistLineupLocks = shouldPersistLineupLocks || resolvedScoringState.registryChanged;
        const scoringState = resolvedScoringState.state;
        const livePreview = await buildOfficialLivePointsPreview(env, scoringState, false).catch(() => null);
        let nextGamedayPoints = Number(
          (livePreview?.finalPoints ?? buildStoredPointsSnapshot(scoringState, currentScoringPeriod).summary.final ?? 0).toFixed(1)
        );
        let nextOverallPoints = Number((await syncLeaguePointsLedger(env, member.userId, currentScoringPeriod, nextGamedayPoints)).toFixed(1));

        if (shouldBackfillHistoricalCorrections(lineupCorrections, member.userId, member.gameId, currentScoringPeriod.key)) {
          const recalculated = await backfillOfficialPointsLedger(env, member.userId, state, chips);
          nextGamedayPoints = Number(recalculated.gamedayPoints ?? nextGamedayPoints);
          nextOverallPoints = Number(recalculated.overallPoints ?? nextOverallPoints);
        }

        if (Number(state.gamedayPoints ?? 0) !== nextGamedayPoints || Number(state.overallPoints ?? 0) !== nextOverallPoints) {
          state.gamedayPoints = nextGamedayPoints;
          state.overallPoints = nextOverallPoints;
          await saveStateForUser(env, member.userId, state);
        }
      }

      if (shouldPersistLineupLocks) {
        await writeLineupLockRegistry(env, lineupLocks);
      }

      members = await listStandingMembers(env);
    }
  }

  const ledger = await readLeaguePointsLedger(env);
  return {
    visible: !beforeDeadline,
    message: beforeDeadline ? "Points will unlock after Day 1 deadline." : undefined,
    selectedPhaseKey,
    phaseOptions,
    members: buildRankedMembers(members, selectedPhaseKey, ledger)
  };
}

async function safeLoadState(env: Env, userId: string | number, options: LoadStateOptions = {}) {
  const state = await getStateForUser(env, userId);
  if (!state) {
    return null;
  }

  if (options.hydrateAssets === false) {
    return state;
  }

  return hydrateStateAssets(env, state);
}

async function backfillOfficialPointsLedger(env: Env, userId: string | number, state: UserState, chips: UserChipsState) {
  const transferPenalty = await getTransferPenalty(env);
  const periods = await getOfficialPlayoffPeriods(env)
    .then((items) => items.filter((period) => new Date(period.deadline).getTime() <= Date.now()))
    .catch(() => []);
  const targetUser = await getPublicUserById(env, userId);
  const lineupLocks = await readLineupLockRegistry(env);
  const lineupCorrections = await readLineupCorrectionRegistry(env);
  const allowedPeriodKeys = new Set(periods.map((period) => period.key));

  await pruneLeaguePointsLedgerForUser(env, userId, allowedPeriodKeys);

  if (!periods.length) {
    state.overallPoints = 0;
    state.gamedayPoints = 0;
    return {
      overallPoints: state.overallPoints,
      gamedayPoints: state.gamedayPoints
    };
  }

  let latestPoints = 0;
  let overallPoints = 0;

  for (const period of periods) {
    const periodState = await buildRosterStateForPeriod(
      env,
      userId,
      targetUser?.gameId ?? String(userId),
      state,
      chips,
      period,
      lineupLocks,
      lineupCorrections
    );
    const preview = await buildOfficialPointsPreviewForPeriod(env, periodState, period.key, false).catch(() => null);
    if (!preview) {
      continue;
    }

    overallPoints = await syncLeaguePointsLedger(
      env,
      userId,
      {
        key: period.key,
        label: period.label,
        deadline: period.deadline,
        gamedayIndex: period.gamedayIndex,
        roundNumber: period.roundNumber,
        dayNumber: period.dayNumber
      },
      preview.finalPoints
    );
    overallPoints = await syncLeaguePointsAdjustment(env, userId, {
      key: `penalty:${period.key}`,
      label: `Transfer penalty for ${period.label}`,
      roundNumber: period.roundNumber,
      dayNumber: period.dayNumber,
      points: -transferPenalty * countPenaltyTransfersForPeriod(state.history, period.key)
    });
    latestPoints = Number(preview.finalPoints ?? latestPoints);
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
  state.totalTransfers = countTrackedTotalTransfers(state.history);
  return {
    overallRank: state.overallRank,
    totalPlayers: state.totalPlayers
  };
}

function isRewindableRosterChange(item: TransferHistoryItem) {
  return !String(item.note ?? "").startsWith("All-Star active");
}

function replaceRosterPlayerByIdentity(state: UserState, currentPlayerId: string | null, currentPlayerName: string, replacement: Player) {
  const replaceInPool = (pool: Player[]) => {
    const index = pool.findIndex((player) => {
      if (currentPlayerId && player.id === currentPlayerId) {
        return true;
      }
      return player.name === currentPlayerName;
    });

    if (index === -1) {
      return false;
    }

    const previous = pool[index];
    pool[index] = clonePlayer(replacement);
    return true;
  };

  return replaceInPool(state.starters) || replaceInPool(state.bench);
}

async function buildRosterStateForPeriod(
  env: Env,
  userId: string | number,
  gameId: string,
  state: UserState,
  chips: UserChipsState,
  targetPeriod: { key: string; dayNumber: number; gamedayKey: string },
  lineupLocks: LineupLockRegistry,
  lineupCorrections: LineupCorrectionRegistry
) {
  if (isChipActiveForPeriod(chips.allStar.activePeriodKey, targetPeriod.key) && chips.allStar.activeLineup) {
    return resolveLineupStateForPeriod({
      registry: lineupLocks,
      corrections: lineupCorrections,
      userId,
      gameId,
      periodKey: targetPeriod.key,
      sourceState: buildStateFromSnapshot(state, chips.allStar.activeLineup),
      createIfMissing: false
    }).state;
  }

  const reconstructed = cloneState(state);
  const rewoundHistory = reconstructed.history
    .filter(
      (item) =>
        isRewindableRosterChange(item) &&
        String(item.windowKey ?? "").startsWith("day:") &&
        String(item.windowKey).slice(4) > targetPeriod.gamedayKey
    )
    .slice()
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

  if (!rewoundHistory.length) {
    return resolveLineupStateForPeriod({
      registry: lineupLocks,
      corrections: lineupCorrections,
      userId,
      gameId,
      periodKey: targetPeriod.key,
      sourceState: reconstructed,
      createIfMissing: false
    }).state;
  }

  const nextMatchupByTeam = await getNextMatchupByTeam(env);
  const playerIds = [
    ...new Set(
      rewoundHistory.flatMap((item) => [item.outPlayerId, item.inPlayerId].filter(Boolean) as string[])
    )
  ];
  const playerNames = [
    ...new Set(
      rewoundHistory.flatMap((item) => [item.outPlayer, item.inPlayer].filter(Boolean) as string[])
    )
  ];

  const playersById = new Map((await getPlayersByIds(env, playerIds, nextMatchupByTeam)).map((player) => [player.id, player]));
  const playersByName = new Map((await getPlayersByNames(env, playerNames, nextMatchupByTeam)).map((player) => [player.name, player]));

  for (const item of rewoundHistory) {
    const outgoing = (item.outPlayerId ? playersById.get(item.outPlayerId) : null) ?? playersByName.get(item.outPlayer) ?? null;
    const incomingId = (item.inPlayerId ? playersById.get(item.inPlayerId)?.id : null) ?? null;

    if (!outgoing) {
      continue;
    }

    replaceRosterPlayerByIdentity(reconstructed, incomingId, item.inPlayer, outgoing);
  }

  reconstructed.rosterValue = Number(getRosterPlayers(reconstructed).reduce((sum, player) => sum + Number(player.salary ?? 0), 0).toFixed(1));
  reconstructed.bank = Number(((await getInitialBudget(env)) - reconstructed.rosterValue).toFixed(1));
  return resolveLineupStateForPeriod({
    registry: lineupLocks,
    corrections: lineupCorrections,
    userId,
    gameId,
    periodKey: targetPeriod.key,
    sourceState: reconstructed,
    createIfMissing: false
  }).state;
}

async function buildPointsPayloadForUser(env: Env, userId: string, viewerUserId: string, phaseKey?: string | null) {
  const state = await safeLoadState(env, userId, { hydrateAssets: false });
  if (!state) {
    return { ok: false as const, response: json({ message: "User state not found." }, { status: 500 }, env) };
  }

  if (!hasCreatedTeam(state)) {
    return { ok: false as const, response: json({ message: "Create your initial team first." }, { status: 400 }, env) };
  }

  const chips = await getUserChipsState(env, userId);

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
  const buildProfileSnapshot = (gamedayPoints: number) => ({
    profile: {
      teamName: state.teamName,
      managerName: state.managerName,
      overallPoints: Number(state.overallPoints ?? 0),
      overallRank: Number(state.overallRank ?? 0),
      totalPlayers: Number(state.totalPlayers ?? 0),
      gamedayPoints: Number(gamedayPoints ?? 0),
      fanLeague: state.fanLeague === "Playoff Friends" ? "" : state.fanLeague
    },
    transactions: {
      freeLeft: Math.max(0, Number(state.weeklyFreeLimit ?? 0) - Number(state.usedThisWeek ?? 0)),
      total: Number(state.totalTransfers ?? 0),
      rosterValue: Number(state.rosterValue ?? 0),
      bank: Number(state.bank ?? 0)
    }
  });

  const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
  const beforeDeadline = editableContext.beforeCompetitionStart;
  if (beforeDeadline) {
    return {
      ok: true as const,
        payload: {
          visible: false,
          message: "Points will unlock after Day 1 deadline.",
          gameweek: editableContext.gameweek,
          profileSnapshot: buildProfileSnapshot(0),
          summary: {
            final: 0
          },
        lineup: {
          starters: withVisiblePoints(state.starters, true),
          bench: withVisiblePoints(state.bench, true),
          captainId: ""
        },
        viewer
      }
    };
  }

  const targetPhase = String(phaseKey ?? "overall");
  const ledger = await readLeaguePointsLedger(env);
  const targetEntries = Object.values(ledger[String(userId)] ?? {});
  const lineupLocks = await readLineupLockRegistry(env);
  const lineupCorrections = await readLineupCorrectionRegistry(env);
  let shouldPersistLineupLocks = false;

  if (targetPhase !== "overall") {
    const targetPeriod = await getOfficialPlayoffPeriodByPhaseKey(env, targetPhase).catch(() => null);
    if (targetPeriod) {
      const historicalState = await buildRosterStateForPeriod(
        env,
        userId,
        targetUser.gameId,
        state,
        chips,
        targetPeriod,
        lineupLocks,
        lineupCorrections
      );
      const preview = await buildOfficialPointsPreviewForPeriod(env, historicalState, targetPeriod.key, false).catch(() => null);

      if (preview) {
        const phaseTotal = getLeaguePhasePoints(targetEntries, targetPhase);
        const penaltyDelta = Number((phaseTotal - Number(preview.finalPoints ?? preview.summary.final ?? 0)).toFixed(1));
        return {
          ok: true as const,
            payload: {
              ...preview,
              profileSnapshot: buildProfileSnapshot(phaseTotal),
              summary: {
                final: phaseTotal
              },
            message:
              penaltyDelta !== 0
                ? `Includes ${penaltyDelta > 0 ? "+" : ""}${penaltyDelta.toFixed(1)} adjustment for transfer penalties on ${targetPeriod.label}.`
                : preview.message,
            viewer
          }
        };
      }
    }
  }

  const scoringPeriod = (await getScoringPeriodContext(env)) as ScoringPeriodContext;
  if (shouldBackfillHistoricalCorrections(lineupCorrections, userId, targetUser.gameId, scoringPeriod?.key ?? null)) {
    await backfillOfficialPointsLedger(env, userId, state, chips);
  }
  const resolvedScoringState = resolveLineupStateForPeriod({
    registry: lineupLocks,
    corrections: lineupCorrections,
    userId,
    gameId: targetUser.gameId,
    periodKey: scoringPeriod?.key ?? "",
    sourceState: getScoringState(state, chips, scoringPeriod),
    createIfMissing: Boolean(scoringPeriod?.key)
  });
  shouldPersistLineupLocks = shouldPersistLineupLocks || resolvedScoringState.registryChanged;
  if (shouldPersistLineupLocks) {
    await writeLineupLockRegistry(env, lineupLocks);
    shouldPersistLineupLocks = false;
  }
  const scoringState = resolvedScoringState.state;
  const preserveRosterPoints =
    Boolean(scoringPeriod) && isChipActiveForPeriod(chips.allStar.activePeriodKey, scoringPeriod?.key) && Boolean(chips.allStar.activeLineup);
  const livePreview = await buildOfficialLivePointsPreview(env, scoringState, beforeDeadline).catch(() => null);
  if (livePreview) {
    syncPointsSnapshot(scoringState, livePreview.lineup, livePreview.finalPoints);
    syncPersistedPointsState(state, livePreview.lineup, livePreview.finalPoints, preserveRosterPoints);
    const overallPoints = await syncLeaguePointsLedger(env, userId, scoringPeriod, livePreview.finalPoints);
    state.overallPoints = Number(overallPoints.toFixed(1));
    await saveStateForUser(env, userId, state);
    return {
      ok: true as const,
      payload: {
        ...livePreview,
        viewer,
        profileSnapshot: buildProfileSnapshot(livePreview.finalPoints)
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
    payload: {
      ...fallbackPoints,
      viewer,
      profileSnapshot: buildProfileSnapshot(fallbackPoints.summary.final)
    }
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
  const transferPenalty = await getTransferPenalty(env);
  const activeChip = getActiveTransactionChip(chips, editableContext);
  const activatingChipNow = Boolean(requestedChip && !activeChip);

  if (requestedChip && activeChip && requestedChip !== activeChip) {
    return { ok: false as const, error: "Another chip is already active for this deadline." };
  }

  if (requestedChip && editableContext.beforeCompetitionStart) {
    return { ok: false as const, error: "Wildcard and All-Star unlock after the Day 1 deadline." };
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
    const activatingChip = requestedChip;
    if (!activatingChip) {
      return { ok: false as const, error: "Chip activation state is invalid." };
    }
    baseState.history = neutralizeTransferWindowCosts(
      baseState.history,
      editableContext.period.key,
      buildChipTransferNote(activatingChip, editableContext.gameweek.label)
    );
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

  const historyEntries: TransferHistoryItem[] = [];
  let remainingFreeTransfers = Math.max(0, Number(baseState.weeklyFreeLimit ?? editableContext.transferWindow.limit ?? 0) - Number(baseState.usedThisWeek ?? 0));

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
      // Batch-confirmed transfers should validate against the final roster cost,
      // not fail midway just because the user selected an upgrade before a downgrade.
      ignoreBudget: true
    });
    if (!applied.ok) {
      return applied;
    }

    const usesFreeTransfer =
      effectiveChip === null &&
      editableContext.transferWindow.mode !== "LIMITLESS" &&
      remainingFreeTransfers > 0;
    const countsTowardLimit = usesFreeTransfer;
    const cost =
      effectiveChip === null && editableContext.transferWindow.mode !== "LIMITLESS" && !usesFreeTransfer ? -transferPenalty : 0;

    if (usesFreeTransfer) {
      remainingFreeTransfers -= 1;
    }

    historyEntries.push({
      id: `tx-${Date.now()}-${index}`,
      timestamp: new Date().toISOString(),
      outPlayer: applied.outgoing.name,
      inPlayer: incoming.name,
      outPlayerId: applied.outgoing.id,
      inPlayerId: incoming.id,
      cost,
      note:
        effectiveChip !== null
          ? buildChipTransferNote(effectiveChip, editableContext.gameweek.label)
          : usesFreeTransfer
            ? `Uses playoff FT ${editableContext.transferWindow.limit - remainingFreeTransfers}/${editableContext.transferWindow.limit}`
            : editableContext.transferWindow.mode === "LIMITLESS"
              ? `Unlimited before ${editableContext.gameweek.label} deadline`
              : `Transfer penalty queued for ${editableContext.gameweek.label}`,
      windowKey: editableContext.period.key,
      countsTowardLimit
    });
  }

  if (effectiveChip !== "all-star" && Number(workingState.rosterValue ?? 0) > budget) {
    return { ok: false as const, error: "Transfer would exceed your budget." };
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
      activatingChipNow || !nextChips.allStar.originalLineup
        ? currentWindowSnapshot?.lineup ?? buildStoredLineupSnapshot(baseState)
        : nextChips.allStar.originalLineup;
    nextChips.allStar.activeLineup = buildStoredLineupSnapshot(workingState);
  }

  baseState.history = [...historyEntries.reverse(), ...baseState.history];
  baseState.totalTransfers = countTrackedTotalTransfers(baseState.history);
  syncTransferWindowState(baseState, editableContext.transferWindow);

  if (effectiveChip !== "all-star") {
    applyStoredLineupSnapshot(baseState, buildStoredLineupSnapshot(workingState));
  }

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

      if (pathname === "/api/home-leaders" && request.method === "GET") {
        return json(await buildHomeLeadersPayload(env), { status: 200 }, env);
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

        const state = await safeLoadState(env, auth.authUser.id, { hydrateAssets: false });
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        const chips = await getUserChipsState(env, auth.authUser.id);
        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        syncTransferWindowState(state, editableContext.transferWindow);
        const beforeDeadline = editableContext.beforeCompetitionStart;
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

        let stateChanged = false;
        if (!beforeDeadline) {
          const currentPoints = Number(livePreview?.finalPoints ?? fallbackProfilePoints?.summary.final ?? state.gamedayPoints ?? 0);
          state.gamedayPoints = currentPoints;
          const overallPoints = await syncLeaguePointsLedger(env, auth.authUser.id, currentScoringPeriod, currentPoints);
          state.overallPoints = Number(overallPoints.toFixed(1));
          stateChanged = true;
        } else if (livePreview) {
          stateChanged = true;
        }

        if (stateChanged) {
          await saveStateForUser(env, auth.authUser.id, state);
        }

        if (hasCreatedTeam(state)) {
          const previousRank = state.overallRank;
          const previousTotalPlayers = state.totalPlayers;
          await syncProfileStandingState(env, auth.authUser.id, state);
          if (state.overallRank !== previousRank || state.totalPlayers !== previousTotalPlayers) {
            stateChanged = true;
          }
        }

        if (stateChanged) {
          await saveStateForUser(env, auth.authUser.id, state);
        }

        const displayState = getDisplayProfileState(state, beforeDeadline);
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
              freeLeft: Math.max(0, Number(state.weeklyFreeLimit ?? 0) - Number(state.usedThisWeek ?? 0)),
              total: state.totalTransfers,
              rosterValue: state.rosterValue,
              bank: state.bank
            }
          },
          { status: 200 },
          env
        );
      }

      if (pathname === "/api/profile/team-name" && request.method === "PUT") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const body = await parseJsonBody<{ teamName?: string }>(request);
        const teamName = String(body.teamName ?? "").trim();

        if (!teamName) {
          return json({ message: "Team name is required." }, { status: 400 }, env);
        }

        if (teamName.length > 30) {
          return json({ message: "Team name must be 30 characters or fewer." }, { status: 400 }, env);
        }

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        state.teamName = teamName;
        await saveStateForUser(env, auth.authUser.id, state);
        return json({ teamName: state.teamName }, { status: 200 }, env);
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

        const currentScoringPeriod = ((await getScoringPeriodContext(env).catch(() => null)) ?? null) as ScoringPeriodContext | null;
        if (currentScoringPeriod?.key) {
          const chips = await getUserChipsState(env, auth.authUser.id);
          const lineupLocks = await readLineupLockRegistry(env);
          const resolvedCurrentLineup = resolveLineupStateForPeriod({
            registry: lineupLocks,
            corrections: await readLineupCorrectionRegistry(env),
            userId: auth.authUser.id,
            gameId: auth.authUser.gameId,
            periodKey: currentScoringPeriod.key,
            sourceState: getScoringState(state, chips, currentScoringPeriod),
            createIfMissing: true
          });
          if (resolvedCurrentLineup.registryChanged) {
            await writeLineupLockRegistry(env, lineupLocks);
          }
        }

        state.starters = proposedStarters;
        state.bench = proposedBench;
        state.captainId = "";
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

        const result = await buildPointsPayloadForUser(env, targetUserId, auth.authUser.id, url.searchParams.get("phase"));
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

        if (!drafts.length && !requestedChip) {
          return json({ message: "At least one transfer or chip activation is required." }, { status: 400 }, env);
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

      if (pathname === "/api/schedule" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
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

      if (pathname === "/api/schedule/game" && request.method === "GET") {
        const auth = await requireAuth(request, env);
        if (!auth.ok) {
          return auth.response;
        }

        const gameId = String(url.searchParams.get("gameId") ?? "").trim();
        if (!gameId) {
          return json({ message: "gameId is required." }, { status: 400 }, env);
        }

        const payload = await buildScheduleGameDetailPayload(env, gameId);
        if (!payload) {
          return json({ message: "Game not found." }, { status: 404 }, env);
        }

        return json(payload, { status: 200 }, env);
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
