import type {
  GameweekPayload,
  Player,
  StoredLineupSnapshot,
  TransactionsPayload,
  TransferHistoryItem,
  TransferWindowContext,
  UserChipCardState,
  UserState
} from "./types";

export function hasCreatedTeam(state: UserState) {
  return state.starters.length + state.bench.length === 10;
}

export function getRosterPlayers(state: UserState) {
  return [...state.starters, ...state.bench];
}

function clonePlayers(players: Player[]) {
  return players.map((player) => ({ ...player, upcoming: [...(player.upcoming ?? [])], upcomingSchedule: [...(player.upcomingSchedule ?? [])] }));
}

export function buildStoredLineupSnapshot(state: UserState): StoredLineupSnapshot {
  return {
    starters: clonePlayers(state.starters),
    bench: clonePlayers(state.bench),
    captainId: state.captainId,
    rosterValue: Number(state.rosterValue ?? 0),
    bank: Number(state.bank ?? 0)
  };
}

export function applyStoredLineupSnapshot(state: UserState, snapshot: StoredLineupSnapshot) {
  state.starters = clonePlayers(snapshot.starters);
  state.bench = clonePlayers(snapshot.bench);
  state.captainId = snapshot.captainId ?? "";
  state.rosterValue = Number(snapshot.rosterValue ?? 0);
  state.bank = Number(snapshot.bank ?? 0);
  return state;
}

export function calcFinalPoints(state: UserState) {
  if (!hasCreatedTeam(state)) {
    return 0;
  }

  const startersTotal = state.starters.reduce((sum, item) => sum + Number(item.points ?? 0), 0);
  const captain = state.starters.find((item) => item.id === state.captainId) ?? state.bench.find((item) => item.id === state.captainId);
  const captainBonus = captain ? Number(captain.points ?? 0) * 0.5 : 0;
  return Number((startersTotal + captainBonus).toFixed(1));
}

export function isValidStarterMix(starters: Player[]) {
  const bcCount = starters.filter((player) => player.position === "BC").length;
  const fcCount = starters.filter((player) => player.position === "FC").length;
  return starters.length === 5 && ((bcCount === 3 && fcCount === 2) || (bcCount === 2 && fcCount === 3));
}

export function withVisiblePoints(players: Player[], beforeFirstDeadline: boolean) {
  if (!beforeFirstDeadline) {
    return players;
  }

  return players.map((player) => ({
    ...player,
    points: 0
  }));
}

function countTransfersForWindow(history: TransferHistoryItem[], windowKey: string) {
  return history.filter((item) => item.windowKey === windowKey && item.countsTowardLimit !== false).length;
}

export function syncTransferWindowState(state: UserState, transferWindow: TransferWindowContext) {
  state.weeklyFreeLimit = transferWindow.limit;
  state.usedThisWeek = countTransfersForWindow(state.history, transferWindow.key);
  return state;
}

export function buildLineupPayload(params: {
  state: UserState;
  gameweek: GameweekPayload;
  budget: number;
  beforeFirstDeadline: boolean;
  transferWindow: TransferWindowContext;
}) {
  const { state, gameweek, budget, beforeFirstDeadline, transferWindow } = params;
  const usedThisWeek = countTransfersForWindow(state.history, transferWindow.key);
  const freeLeft = transferWindow.mode === "LIMITLESS" ? 999 : Math.max(0, transferWindow.limit - usedThisWeek);

  return {
    gameweek,
    hasTeam: hasCreatedTeam(state),
    budget,
    rosterValue: state.rosterValue,
    bank: state.bank,
    captainDecisionLocked: false,
    lineup: {
      starters: withVisiblePoints(state.starters, beforeFirstDeadline),
      bench: withVisiblePoints(state.bench, beforeFirstDeadline),
      captainId: state.captainId
    },
    transactions: {
      transferMode: transferWindow.mode,
      freeLeft,
      usedThisWeek,
      weeklyFreeLimit: transferWindow.limit
    }
  };
}

export function buildTransactionsPayload(params: {
  state: UserState;
  gameweek: GameweekPayload;
  market: Player[];
  beforeFirstDeadline: boolean;
  transferWindow: TransferWindowContext;
  chips: {
    wildcard: UserChipCardState;
    allStar: UserChipCardState;
  };
}): TransactionsPayload {
  const { state, gameweek, market, beforeFirstDeadline, transferWindow, chips } = params;
  const usedThisWeek = countTransfersForWindow(state.history, transferWindow.key);
  const limitless = transferWindow.mode === "LIMITLESS";

  return {
    gameweek,
    hasTeam: hasCreatedTeam(state),
    transferMode: limitless ? "LIMITLESS" : "LIMITED",
    freeTransfersLeft: limitless ? 999 : Math.max(0, transferWindow.limit - usedThisWeek),
    usedThisWeek,
    weeklyFreeLimit: transferWindow.limit,
    bank: state.bank,
    rosterValue: state.rosterValue,
    history: state.history,
    chips,
    lineup: {
      starters: withVisiblePoints(state.starters, beforeFirstDeadline),
      bench: withVisiblePoints(state.bench, beforeFirstDeadline),
      captainId: state.captainId
    },
    market: withVisiblePoints(market, beforeFirstDeadline)
  };
}

export function getDisplayProfileState(state: UserState, beforeFirstDeadline: boolean) {
  if (beforeFirstDeadline) {
    return {
      ...state,
      overallPoints: 0,
      overallRank: 0,
      totalPlayers: 0,
      gamedayPoints: 0,
      fanLeague: ""
    };
  }

  return {
    ...state,
    gamedayPoints: calcFinalPoints(state),
    fanLeague: state.fanLeague === "Playoff Friends" ? "" : state.fanLeague
  };
}

export function createInitialTeamForState(params: {
  state: UserState;
  players: Player[];
  budget: number;
  weeklyFreeTransfers: number;
}) {
  const { state, players, budget, weeklyFreeTransfers } = params;

  if (hasCreatedTeam(state)) {
    return { ok: false as const, error: "Initial team has already been created." };
  }

  const uniqueIds = [...new Set(players.map((player) => String(player.id)))];
  if (uniqueIds.length !== 10 || players.length !== 10) {
    return { ok: false as const, error: "Please select exactly 10 unique players." };
  }

  const unavailable = players.find((player) => !player.canSelect);
  if (unavailable) {
    return { ok: false as const, error: `${unavailable.name} is not selectable.` };
  }

  const bc = players.filter((player) => player.position === "BC");
  const fc = players.filter((player) => player.position === "FC");
  if (bc.length !== 5 || fc.length !== 5) {
    return { ok: false as const, error: "Initial roster must contain 5 BC and 5 FC players." };
  }

  const rosterValue = Number(players.reduce((sum, player) => sum + Number(player.salary), 0).toFixed(1));
  if (rosterValue > budget) {
    return { ok: false as const, error: `Roster value ${rosterValue.toFixed(1)} exceeds budget ${budget.toFixed(1)}.` };
  }

  state.starters = [...bc.slice(0, 2), ...fc.slice(0, 3)];
  state.bench = [...bc.slice(2), ...fc.slice(3)];
  state.captainId = "";
  state.captainDecisionLocked = false;
  state.rosterValue = rosterValue;
  state.bank = Number((budget - rosterValue).toFixed(1));
  state.weeklyFreeLimit = weeklyFreeTransfers;

  return { ok: true as const };
}

function buildRosterIncomingPlayer(incoming: Player): Player {
  return {
    id: incoming.id,
    code: incoming.code,
    name: incoming.name,
    teamId: incoming.teamId,
    teamCode: incoming.teamCode,
    team: incoming.team,
    position: incoming.position,
    salary: incoming.salary,
    points: incoming.points ?? 0,
    pointsWindowKey: incoming.pointsWindowKey ?? null,
    color: incoming.color ?? "cold",
    headshotUrl: incoming.headshotUrl,
    headshotFallbackUrl: incoming.headshotFallbackUrl,
    teamLogoUrl: incoming.teamLogoUrl,
    teamLogoFallbackUrl: incoming.teamLogoFallbackUrl,
    nextOpponent: incoming.nextOpponent ?? "TBD",
    nextOpponentName: incoming.nextOpponentName ?? null,
    nextOpponentLogoUrl: incoming.nextOpponentLogoUrl ?? null,
    nextOpponentLogoFallbackUrl: incoming.nextOpponentLogoFallbackUrl ?? null,
    upcoming: [...(incoming.upcoming ?? [])],
    upcomingSchedule: [...(incoming.upcomingSchedule ?? [])],
    totalPoints: incoming.totalPoints,
    recentAverage: incoming.recentAverage,
    selectedByPercent: incoming.selectedByPercent,
    canSelect: incoming.canSelect,
    canTransact: incoming.canTransact,
    status: incoming.status
  };
}

export function replacePlayerOnRoster(params: {
  state: UserState;
  outPlayerId: string;
  incoming: Player;
  budget: number;
  ignoreBudget?: boolean;
}) {
  const { state, outPlayerId, incoming, budget, ignoreBudget } = params;

  if (!hasCreatedTeam(state)) {
    return { ok: false as const, error: "Create your initial team first." };
  }

  if (!incoming.canSelect || !incoming.canTransact) {
    return { ok: false as const, error: "Incoming player is not available." };
  }

  if (getRosterPlayers(state).some((player) => player.id === incoming.id)) {
    return { ok: false as const, error: "Incoming player is already in your roster." };
  }

  let targetPool = state.starters;
  let targetIndex = targetPool.findIndex((player) => player.id === outPlayerId);

  if (targetIndex === -1) {
    targetPool = state.bench;
    targetIndex = targetPool.findIndex((player) => player.id === outPlayerId);
  }

  if (targetIndex === -1) {
    return { ok: false as const, error: "Outgoing player is not in your roster." };
  }

  const outgoing = targetPool[targetIndex];
  if (outgoing.position !== incoming.position) {
    return { ok: false as const, error: "Transfer must keep the same position group." };
  }

  const nextRosterValue = Number((state.rosterValue - Number(outgoing.salary) + Number(incoming.salary)).toFixed(1));
  if (!ignoreBudget && nextRosterValue > budget) {
    return { ok: false as const, error: "Transfer would exceed your budget." };
  }

  targetPool.splice(targetIndex, 1, buildRosterIncomingPlayer(incoming));
  state.rosterValue = nextRosterValue;
  state.bank = Number((budget - state.rosterValue).toFixed(1));

  return {
    ok: true as const,
    outgoing,
    incoming: buildRosterIncomingPlayer(incoming)
  };
}

export function replacePlayerForState(params: {
  state: UserState;
  outPlayerId: string;
  incoming: Player;
  budget: number;
  beforeFirstDeadline: boolean;
  transferWindow: TransferWindowContext;
}) {
  const { state, outPlayerId, incoming, budget, beforeFirstDeadline, transferWindow } = params;

  if (!hasCreatedTeam(state)) {
    return { ok: false as const, error: "Create your initial team first." };
  }

  const usedThisWeek = countTransfersForWindow(state.history, transferWindow.key);
  const freeTransfersLeft = Math.max(0, transferWindow.limit - usedThisWeek);
  if (transferWindow.mode !== "LIMITLESS" && !beforeFirstDeadline && freeTransfersLeft <= 0) {
    return { ok: false as const, error: `No free transfers left for ${transferWindow.label.toLowerCase()}.` };
  }

  const applied = replacePlayerOnRoster({
    state,
    outPlayerId,
    incoming,
    budget
  });
  if (!applied.ok) {
    return applied;
  }

  state.totalTransfers += 1;
  state.usedThisWeek = usedThisWeek + 1;
  state.weeklyFreeLimit = transferWindow.limit;

  const record = {
    id: `tx-${Date.now()}`,
    timestamp: new Date().toISOString(),
    outPlayer: applied.outgoing.name,
    inPlayer: incoming.name,
    cost: 0,
    note: transferWindow.mode === "LIMITLESS" ? `Unlimited before ${gameweekLabelFromWindow(transferWindow)} deadline` : `Free transfer for ${transferWindow.label}`,
    windowKey: transferWindow.key,
    countsTowardLimit: transferWindow.mode !== "LIMITLESS"
  };

  state.history.unshift(record);

  return {
    ok: true as const,
    transfer: record
  };
}

function gameweekLabelFromWindow(transferWindow: TransferWindowContext) {
  return transferWindow.label === "Round 1" ? "Round 1 Day 1" : transferWindow.label;
}
