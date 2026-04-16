import bcrypt from "bcryptjs";
import { HELP_RULES, POINTS_BASELINE } from "./shared/gameTemplate";
import { buildLineupPayload, buildTransactionsPayload, calcFinalPoints, createInitialTeamForState, getDisplayProfileState, getRosterPlayers, hasCreatedTeam, isValidStarterMix, replacePlayerForState, syncTransferWindowState, withVisiblePoints } from "./worker/gameplay";
import { handleCorsPreflight, json, parseJsonBody } from "./worker/http";
import { buildOfficialLivePointsPreview, buildOfficialStartedPeriodSummaries, buildSchedulePayload, getEditablePeriodContext, getGameweekPayload, getNextMatchupByTeam, getOfficialScheduleTimeline, getScoringPeriodContext } from "./worker/liveData";
import { buildPublicUser, createPrivateLeague, createSession, DB_PATH_LABEL, deleteSession, getAuthenticatedUserByToken, getPlayerDataSummary, getPlayersByIds, getPublicUserById, getRuleValue, getStateForUser, getUserByAccount, joinPrivateLeague, listPrivateLeaguesForUser, listStandingMembers, readAppState, registerUser, saveStateForUser, searchPlayerPool, writeAppState } from "./worker/store";
import type { AuthUser, Env, LeagueEntry, LeagueMemberEntry, LeaguePhaseOption, Player, UserState } from "./worker/types";

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
  return Number((await getRuleValue(env, "weekly_free_transfers", "2")) ?? "2");
}

async function getFirstDeadline(env: Env) {
  return (await getRuleValue(env, "first_deadline", "2026-04-10T06:30:00Z")) ?? "2026-04-10T06:30:00Z";
}

async function isBeforeFirstDeadline(env: Env) {
  return (await getEditablePeriodContext(env, await getFirstDeadline(env))).beforeCompetitionStart;
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

function buildStoredPointsSnapshot(state: UserState, scoringPeriod: { key: string; label: string; deadline: string; gamedayIndex: number } | null) {
  const apply = (players: Player[]) =>
    players.map((player) => ({
      ...player,
      points: player.pointsWindowKey === scoringPeriod?.key ? Number(player.points ?? 0) : 0
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
      average: starters.length ? Number((starters.reduce((sum, player) => sum + Number(player.points ?? 0), 0) / starters.length).toFixed(1)) : 0,
      final: finalPoints,
      top: starters.length ? Number(Math.max(...starters.map((player) => Number(player.points ?? 0))).toFixed(1)) : 0
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

function buildRankedMembers(members: LeagueMemberEntry[], phaseKey: string, ledger: LeaguePointsLedger) {
  const overallMembers = members
    .map((member) => {
      const entries = Object.values(ledger[member.userId] ?? {});
      const ledgerTotal = sumLeagueLedgerPoints(entries);
      const totalPoints = Number(Math.max(Number(member.totalPoints ?? 0), ledgerTotal).toFixed(1));

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
  const scoringPeriod = (await getScoringPeriodContext(env)) as ScoringPeriodContext;

  if (scoringPeriod) {
    for (const member of league.members ?? []) {
      await syncLeaguePointsLedger(env, member.userId, scoringPeriod, Number(member.gamedayPoints ?? 0));
    }
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

    await backfillOfficialPointsLedger(env, member.userId, state);
    await saveStateForUser(env, member.userId, state);
  }

  members = await listStandingMembers(env);
  const scoringPeriod = (await getScoringPeriodContext(env)) as ScoringPeriodContext;
  if (scoringPeriod) {
    for (const member of members) {
      await syncLeaguePointsLedger(env, member.userId, scoringPeriod, Number(member.gamedayPoints ?? 0));
    }
  }

  const ledger = await readLeaguePointsLedger(env);
  return {
    selectedPhaseKey,
    phaseOptions: getLeaguePhaseOptions(),
    members: buildRankedMembers(members, selectedPhaseKey, ledger)
  };
}

async function safeLoadState(env: Env, userId: string) {
  const state = await getStateForUser(env, userId);
  if (!state) {
    return null;
  }

  return hydrateStateAssets(env, state);
}

async function backfillOfficialPointsLedger(env: Env, userId: string | number, state: UserState) {
  const summaries = await buildOfficialStartedPeriodSummaries(env, state).catch(() => []);
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

  await backfillOfficialPointsLedger(env, userId, state);

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
  const livePreview = await buildOfficialLivePointsPreview(env, state, beforeDeadline).catch(() => null);
  if (livePreview) {
    syncPointsSnapshot(state, livePreview.lineup, livePreview.finalPoints);
    const scoringPeriod = (await getScoringPeriodContext(env)) as ScoringPeriodContext;
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
          average: 0,
          final: 0,
          top: 0
        },
        lineup: {
          starters: withVisiblePoints(state.starters, true),
          bench: withVisiblePoints(state.bench, true),
          captainId: state.captainId
        },
        viewer
      }
    };
  }

  const scoringPeriod = (await getScoringPeriodContext(env)) as ScoringPeriodContext;
  const fallbackPoints = buildStoredPointsSnapshot(state, scoringPeriod);
  state.gamedayPoints = fallbackPoints.summary.final;
  const overallPoints = await syncLeaguePointsLedger(env, userId, scoringPeriod, fallbackPoints.summary.final);
  state.overallPoints = Number(overallPoints.toFixed(1));
  await saveStateForUser(env, userId, state);

  return {
    ok: true as const,
    payload: { ...fallbackPoints, viewer }
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

        try {
          const passwordHash = bcrypt.hashSync(password, 10);
          const user = await registerUser(env, account, gameId, passwordHash);
          const token = await createSession(env, user.id);

          return json({ token, user }, { status: 201 }, env);
        } catch (error) {
          const message = error instanceof Error && error.message.includes("UNIQUE constraint failed") ? "Account already exists." : "Failed to register user.";
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
        const excludeIds = state ? getRosterPlayers(state).map((player) => player.id) : [];
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

        if (hasCreatedTeam(state)) {
          await backfillOfficialPointsLedger(env, auth.authUser.id, state);
        }
        await syncProfileStandingState(env, auth.authUser.id, state);

        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        syncTransferWindowState(state, editableContext.transferWindow);
        const beforeDeadline = editableContext.beforeCompetitionStart;
        const displayState = getDisplayProfileState(state, beforeDeadline);
        const livePreview = hasCreatedTeam(state) ? await buildOfficialLivePointsPreview(env, state, beforeDeadline).catch(() => null) : null;

        if (livePreview) {
          syncPointsSnapshot(state, livePreview.lineup, livePreview.finalPoints);
        }

        if (!beforeDeadline) {
          const scoringPeriod = (await getScoringPeriodContext(env)) as ScoringPeriodContext;
          const currentPoints = Number(livePreview?.finalPoints ?? displayState.gamedayPoints ?? 0);
          state.gamedayPoints = currentPoints;
          const overallPoints = await syncLeaguePointsLedger(env, auth.authUser.id, scoringPeriod, currentPoints);
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

        const nextMatchupByTeam = await getNextMatchupByTeam(env);
        const market = await searchPlayerPool(
          env,
          {
            excludeIds: getRosterPlayers(state).map((player) => player.id),
            limit: 80
          },
          nextMatchupByTeam
        );
        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        syncTransferWindowState(state, editableContext.transferWindow);

        return json(
          buildTransactionsPayload({
            state,
            gameweek: editableContext.gameweek,
            market,
            beforeFirstDeadline: editableContext.beforeCompetitionStart,
            transferWindow: editableContext.transferWindow
          }),
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

        const nextMatchupByTeam = await getNextMatchupByTeam(env);
        const incoming = (await getPlayersByIds(env, [inPlayerId], nextMatchupByTeam))[0];
        if (!incoming) {
          return json({ message: "Incoming player not found in transfer market." }, { status: 400 }, env);
        }

        const editableContext = await getEditablePeriodContext(env, await getFirstDeadline(env));
        const result = replacePlayerForState({
          state,
          outPlayerId,
          incoming,
          budget: await getInitialBudget(env),
          beforeFirstDeadline: editableContext.beforeCompetitionStart,
          transferWindow: editableContext.transferWindow
        });

        if (!result.ok) {
          return json({ message: result.error }, { status: 400 }, env);
        }

        await saveStateForUser(env, auth.authUser.id, state);

        const market = await searchPlayerPool(
          env,
          {
            excludeIds: getRosterPlayers(state).map((player) => player.id),
            limit: 80
          },
          nextMatchupByTeam
        );

        return json(
          {
            ok: true,
            transfer: result.transfer,
            payload: buildTransactionsPayload({
              state,
              gameweek: editableContext.gameweek,
              market,
              beforeFirstDeadline: editableContext.beforeCompetitionStart,
              transferWindow: editableContext.transferWindow
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
          await backfillOfficialPointsLedger(env, auth.authUser.id, state);
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
