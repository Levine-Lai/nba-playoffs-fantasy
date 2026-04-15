import bcrypt from "bcryptjs";
import { HELP_RULES, POINTS_BASELINE } from "./shared/gameTemplate";
import { buildLineupPayload, buildTransactionsPayload, calcFinalPoints, createInitialTeamForState, getDisplayProfileState, getRosterPlayers, hasCreatedTeam, isValidStarterMix, replacePlayerForState, withVisiblePoints } from "./worker/gameplay";
import { handleCorsPreflight, json, parseJsonBody } from "./worker/http";
import { buildOfficialLivePointsPreview, buildSchedulePayload, getGameweekPayload, getNextMatchupByTeam, getOfficialScheduleTimeline } from "./worker/liveData";
import { buildPublicUser, createPrivateLeague, createSession, DB_PATH_LABEL, deleteSession, getAuthenticatedUserByToken, getPlayerDataSummary, getPlayersByIds, getRuleValue, getStateForUser, getUserByAccount, joinPrivateLeague, listPrivateLeaguesForUser, registerUser, saveStateForUser, searchPlayerPool } from "./worker/store";
import type { AuthUser, Env, Player, UserState } from "./worker/types";

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
  const deadline = new Date(await getFirstDeadline(env)).getTime();
  return Number.isFinite(deadline) ? Date.now() < deadline : false;
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

async function safeLoadState(env: Env, userId: string) {
  const state = await getStateForUser(env, userId);
  if (!state) {
    return null;
  }

  return hydrateStateAssets(env, state);
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
        return json(
          buildLineupPayload({
            state,
            gameweek: await getGameweekPayload(env, await getFirstDeadline(env)),
            budget: await getInitialBudget(env),
            beforeFirstDeadline: await isBeforeFirstDeadline(env)
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

        const beforeDeadline = await isBeforeFirstDeadline(env);
        const displayState = getDisplayProfileState(state, beforeDeadline);
        const livePreview = hasCreatedTeam(state) ? await buildOfficialLivePointsPreview(env, state, beforeDeadline).catch(() => null) : null;

        if (!beforeDeadline) {
          state.gamedayPoints = displayState.gamedayPoints;
          await saveStateForUser(env, auth.authUser.id, state);
        }

        const privateClassic = await listPrivateLeaguesForUser(env, auth.authUser.id);

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
              freeLeft: Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
              total: state.totalTransfers,
              rosterValue: state.rosterValue,
              bank: state.bank
            },
            leagues: {
              global: [],
              privateClassic
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

        return json(
          buildLineupPayload({
            state,
            gameweek: await getGameweekPayload(env, await getFirstDeadline(env)),
            budget: await getInitialBudget(env),
            beforeFirstDeadline: await isBeforeFirstDeadline(env)
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

        return json(
          buildLineupPayload({
            state,
            gameweek: await getGameweekPayload(env, await getFirstDeadline(env)),
            budget: await getInitialBudget(env),
            beforeFirstDeadline: await isBeforeFirstDeadline(env)
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

        const state = await safeLoadState(env, auth.authUser.id);
        if (!state) {
          return json({ message: "User state not found." }, { status: 500 }, env);
        }

        if (!hasCreatedTeam(state)) {
          return json({ message: "Create your initial team first." }, { status: 400 }, env);
        }

        const beforeDeadline = await isBeforeFirstDeadline(env);
        const livePreview = await buildOfficialLivePointsPreview(env, state, beforeDeadline).catch(() => null);
        if (livePreview) {
          return json(livePreview, { status: 200 }, env);
        }

        if (beforeDeadline) {
          return json(
            {
              visible: false,
              message: "Points will unlock after the first deadline.",
              gameweek: await getGameweekPayload(env, await getFirstDeadline(env)),
              summary: {
                average: 0,
                final: 0,
                top: 0
              },
              lineup: {
                starters: withVisiblePoints(state.starters, true),
                bench: withVisiblePoints(state.bench, true),
                captainId: state.captainId
              }
            },
            { status: 200 },
            env
          );
        }

        const finalPoints = calcFinalPoints(state);
        state.gamedayPoints = finalPoints;
        await saveStateForUser(env, auth.authUser.id, state);

        return json(
          {
            visible: true,
            gameweek: await getGameweekPayload(env, await getFirstDeadline(env)),
            summary: {
              average: POINTS_BASELINE.average,
              final: finalPoints,
              top: POINTS_BASELINE.top
            },
            lineup: {
              starters: withVisiblePoints(state.starters, false),
              bench: withVisiblePoints(state.bench, false),
              captainId: state.captainId
            }
          },
          { status: 200 },
          env
        );
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

        return json(
          buildTransactionsPayload({
            state,
            gameweek: await getGameweekPayload(env, await getFirstDeadline(env)),
            market,
            beforeFirstDeadline: await isBeforeFirstDeadline(env)
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

        const result = replacePlayerForState({
          state,
          outPlayerId,
          incoming,
          budget: await getInitialBudget(env),
          beforeFirstDeadline: await isBeforeFirstDeadline(env)
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
              gameweek: await getGameweekPayload(env, await getFirstDeadline(env)),
              market,
              beforeFirstDeadline: await isBeforeFirstDeadline(env)
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

        return json({ league }, { status: 200 }, env);
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
