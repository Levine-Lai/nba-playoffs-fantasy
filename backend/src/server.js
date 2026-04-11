import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import {
  registerUserTx,
  getUserByAccount,
  getUserByGameId,
  createSession,
  deleteSession,
  getAuthenticatedUserByToken,
  getStateForUser,
  saveStateForUser,
  dbPath,
  getPlayersByIds,
  searchPlayerPool,
  getPlayerDataSummary,
  getRuleValue
} from "./db.js";
import {
  GAMEWEEK,
  POINTS_BASELINE,
  SCHEDULE,
  HELP_RULES,
  buildLeaguesForUser
} from "./gameTemplate.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function getInitialBudget() {
  return Number(getRuleValue("initial_budget", "100"));
}

function getWeeklyFreeTransfers() {
  return Number(getRuleValue("weekly_free_transfers", "2"));
}

function getFirstDeadline() {
  return getRuleValue("first_deadline", GAMEWEEK.deadline);
}

function isBeforeFirstDeadline() {
  const deadline = new Date(getFirstDeadline()).getTime();
  return Number.isFinite(deadline) ? Date.now() < deadline : false;
}

function getGameweekPayload() {
  return {
    ...GAMEWEEK,
    deadline: getFirstDeadline()
  };
}

function hasCreatedTeam(state) {
  return state.starters.length + state.bench.length === 10;
}

function getRosterPlayers(state) {
  return [...state.starters, ...state.bench];
}

function enrichRosterPlayers(players = []) {
  const freshPlayers = getPlayersByIds(players.map((player) => player.id));
  const freshById = new Map(freshPlayers.map((player) => [player.id, player]));

  return players.map((player) => {
    const fresh = freshById.get(String(player.id));
    if (!fresh) {
      return player;
    }

    return {
      ...player,
      ...fresh,
      nextOpponent: player.nextOpponent ?? fresh.nextOpponent,
      upcoming: player.upcoming ?? fresh.upcoming
    };
  });
}

function hydrateStateAssets(state) {
  state.starters = enrichRosterPlayers(state.starters);
  state.bench = enrichRosterPlayers(state.bench);
  return state;
}

const TEAM_CODES_BY_NAME = {
  "Atlanta Hawks": "1610612737",
  "Boston Celtics": "1610612738",
  "Brooklyn Nets": "1610612751",
  "Charlotte Hornets": "1610612766",
  "Chicago Bulls": "1610612741",
  "Cleveland Cavaliers": "1610612739",
  "Dallas Mavericks": "1610612742",
  "Denver Nuggets": "1610612743",
  "Detroit Pistons": "1610612765",
  "Golden State Warriors": "1610612744",
  "Houston Rockets": "1610612745",
  "Indiana Pacers": "1610612754",
  "LA Clippers": "1610612746",
  "Los Angeles Lakers": "1610612747",
  "Memphis Grizzlies": "1610612763",
  "Miami Heat": "1610612748",
  "Milwaukee Bucks": "1610612749",
  "Minnesota Timberwolves": "1610612750",
  "New Orleans Pelicans": "1610612740",
  "New York Knicks": "1610612752",
  "Oklahoma City Thunder": "1610612760",
  "Orlando Magic": "1610612753",
  "Philadelphia 76ers": "1610612755",
  "Phoenix Suns": "1610612756",
  "Portland Trail Blazers": "1610612757",
  "Sacramento Kings": "1610612758",
  "San Antonio Spurs": "1610612759",
  "Toronto Raptors": "1610612761",
  "Utah Jazz": "1610612762",
  "Washington Wizards": "1610612764"
};

function buildTeamAsset(name) {
  const code = TEAM_CODES_BY_NAME[name] ?? null;
  return {
    name,
    code,
    logoUrl: code ? `/nba/team-logos/${code}.png` : null,
    logoFallbackUrl: code ? `https://cdn.nba.com/logos/nba/${code}/global/L/logo.svg` : null
  };
}

function buildSchedulePayload() {
  return {
    ...SCHEDULE,
    games: SCHEDULE.games.map((game) => ({
      ...game,
      homeTeam: buildTeamAsset(game.home),
      awayTeam: buildTeamAsset(game.away)
    }))
  };
}

function buildPublicUser(user) {
  return {
    id: user.id,
    account: user.account,
    gameId: user.gameId,
    displayName: user.gameId
  };
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function authRequired(req, res, next) {
  const token = extractBearerToken(req);
  const authUser = getAuthenticatedUserByToken(token);

  if (!authUser) {
    res.status(401).json({ message: "Unauthorized. Please log in." });
    return;
  }

  req.authUser = {
    id: authUser.id,
    account: authUser.account,
    gameId: authUser.gameId,
    token
  };

  next();
}

function calcFinalPoints(state) {
  if (!hasCreatedTeam(state)) {
    return 0;
  }

  const startersTotal = state.starters.reduce((sum, item) => sum + Number(item.points ?? 0), 0);
  const captain = state.starters.find((item) => item.id === state.captainId) ?? state.bench.find((item) => item.id === state.captainId);
  const captainBonus = captain ? Number(captain.points ?? 0) * 0.5 : 0;
  return Number((startersTotal + captainBonus).toFixed(1));
}

function withVisiblePoints(players) {
  if (!isBeforeFirstDeadline()) {
    return players;
  }

  return players.map((player) => ({
    ...player,
    points: 0
  }));
}

function getLineupPayload(state) {
  return {
    gameweek: getGameweekPayload(),
    hasTeam: hasCreatedTeam(state),
    budget: getInitialBudget(),
    rosterValue: state.rosterValue,
    bank: state.bank,
    lineup: {
      starters: withVisiblePoints(state.starters),
      bench: withVisiblePoints(state.bench),
      captainId: state.captainId
    },
    transactions: {
      freeLeft: Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
      usedThisWeek: state.usedThisWeek,
      weeklyFreeLimit: state.weeklyFreeLimit
    }
  };
}

function getTransactionsPayload(state) {
  const rosterIds = getRosterPlayers(state).map((player) => player.id);
  const limitless = isBeforeFirstDeadline();

  return {
    gameweek: getGameweekPayload(),
    hasTeam: hasCreatedTeam(state),
    transferMode: limitless ? "LIMITLESS" : "LIMITED",
    freeTransfersLeft: limitless ? 999 : Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
    usedThisWeek: state.usedThisWeek,
    weeklyFreeLimit: state.weeklyFreeLimit,
    bank: state.bank,
    rosterValue: state.rosterValue,
    history: state.history,
    lineup: {
      starters: withVisiblePoints(state.starters),
      bench: withVisiblePoints(state.bench),
      captainId: state.captainId
    },
    market: withVisiblePoints(searchPlayerPool({ excludeIds: rosterIds, limit: 80 }))
  };
}

function getDisplayProfileState(state) {
  if (isBeforeFirstDeadline()) {
    return {
      ...state,
      overallPoints: 0,
      overallRank: 0,
      totalPlayers: 0,
      gamedayPoints: 0
    };
  }

  return {
    ...state,
    gamedayPoints: calcFinalPoints(state)
  };
}

function replacePlayerForState(state, outPlayerId, inPlayerId) {
  if (!hasCreatedTeam(state)) {
    return { ok: false, error: "Create your initial team first." };
  }

  const limitless = isBeforeFirstDeadline();
  const freeTransfersLeft = Math.max(0, state.weeklyFreeLimit - state.usedThisWeek);
  if (!limitless && freeTransfersLeft <= 0) {
    return { ok: false, error: "No free transfers left for this week." };
  }

  const incoming = getPlayersByIds([inPlayerId])[0];
  if (!incoming) {
    return { ok: false, error: "Incoming player not found in transfer market." };
  }

  if (!incoming.canSelect || !incoming.canTransact) {
    return { ok: false, error: "Incoming player is not available." };
  }

  if (getRosterPlayers(state).some((player) => player.id === incoming.id)) {
    return { ok: false, error: "Incoming player is already in your roster." };
  }

  let targetPool = state.starters;
  let targetIndex = targetPool.findIndex((player) => player.id === outPlayerId);

  if (targetIndex === -1) {
    targetPool = state.bench;
    targetIndex = targetPool.findIndex((player) => player.id === outPlayerId);
  }

  if (targetIndex === -1) {
    return { ok: false, error: "Outgoing player is not in your roster." };
  }

  const outgoing = targetPool[targetIndex];
  if (outgoing.position !== incoming.position) {
    return { ok: false, error: "Transfer must keep the same position group." };
  }

  const nextRosterValue = Number((state.rosterValue - Number(outgoing.salary) + Number(incoming.salary)).toFixed(1));
  if (nextRosterValue > getInitialBudget()) {
    return { ok: false, error: "Transfer would exceed your budget." };
  }

  targetPool.splice(targetIndex, 1, {
    id: incoming.id,
    code: incoming.code,
    name: incoming.name,
    teamId: incoming.teamId,
    teamCode: incoming.teamCode,
    team: incoming.team,
    position: incoming.position,
    salary: incoming.salary,
    points: incoming.points ?? 0,
    color: incoming.color ?? "cold",
    headshotUrl: incoming.headshotUrl,
    headshotFallbackUrl: incoming.headshotFallbackUrl,
    teamLogoUrl: incoming.teamLogoUrl,
    teamLogoFallbackUrl: incoming.teamLogoFallbackUrl,
    nextOpponent: "TBD",
    upcoming: ["TBD", "TBD"]
  });

  if (!limitless) {
    state.usedThisWeek += 1;
  }
  state.totalTransfers += 1;
  state.rosterValue = nextRosterValue;
  state.bank = Number((getInitialBudget() - state.rosterValue).toFixed(1));

  const record = {
    id: `tx-${Date.now()}`,
    timestamp: new Date().toISOString(),
    outPlayer: outgoing.name,
    inPlayer: incoming.name,
    cost: 0,
    note: limitless ? "Limitless before first deadline" : "Free transfer"
  };

  state.history.unshift(record);

  return {
    ok: true,
    transfer: record,
    payload: getTransactionsPayload(state)
  };
}

function createInitialTeamForState(state, playerIds) {
  if (hasCreatedTeam(state)) {
    return { ok: false, error: "Initial team has already been created." };
  }

  const uniqueIds = [...new Set((playerIds ?? []).map((id) => String(id)))];
  if (uniqueIds.length !== 10) {
    return { ok: false, error: "Please select exactly 10 unique players." };
  }

  const players = getPlayersByIds(uniqueIds);
  if (players.length !== 10) {
    return { ok: false, error: "Some selected players were not found." };
  }

  const unavailable = players.find((player) => !player.canSelect);
  if (unavailable) {
    return { ok: false, error: `${unavailable.name} is not selectable.` };
  }

  const bc = players.filter((player) => player.position === "BC");
  const fc = players.filter((player) => player.position === "FC");
  if (bc.length !== 5 || fc.length !== 5) {
    return { ok: false, error: "Initial roster must contain 5 BC and 5 FC players." };
  }

  const rosterValue = Number(players.reduce((sum, player) => sum + Number(player.salary), 0).toFixed(1));
  const budget = getInitialBudget();
  if (rosterValue > budget) {
    return { ok: false, error: `Roster value ${rosterValue.toFixed(1)} exceeds budget ${budget.toFixed(1)}.` };
  }

  state.starters = [...bc.slice(0, 2), ...fc.slice(0, 3)];
  state.bench = [...bc.slice(2), ...fc.slice(3)];
  state.captainId = state.starters[0]?.id ?? "";
  state.rosterValue = rosterValue;
  state.bank = Number((budget - rosterValue).toFixed(1));
  state.weeklyFreeLimit = getWeeklyFreeTransfers();

  return { ok: true, payload: getLineupPayload(state) };
}

function safeLoadState(userId, res) {
  const state = getStateForUser(userId);
  if (!state) {
    res.status(500).json({ message: "User state not found." });
    return null;
  }

  return hydrateStateAssets(state);
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "playoff-fantasy-api", dbPath });
});

app.post("/api/auth/register", (req, res) => {
  const { account, gameId, password, confirmPassword } = req.body ?? {};

  if (!account || !gameId || !password || !confirmPassword) {
    res.status(400).json({ message: "account, gameId, password, and confirmPassword are required." });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ message: "Password and confirmPassword do not match." });
    return;
  }

  if (password.length < 4) {
    res.status(400).json({ message: "Password must be at least 4 characters." });
    return;
  }

  if (getUserByAccount.get(account)) {
    res.status(400).json({ message: "Account already exists." });
    return;
  }

  if (getUserByGameId.get(gameId)) {
    res.status(400).json({ message: "Game ID already exists." });
    return;
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = registerUserTx(account, gameId, passwordHash);
    const token = createSession(user.id);

    res.status(201).json({ token, user: buildPublicUser(user) });
  } catch {
    res.status(500).json({ message: "Failed to register user." });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { account, password } = req.body ?? {};

  if (!account || !password) {
    res.status(400).json({ message: "account and password are required." });
    return;
  }

  const user = getUserByAccount.get(account);
  if (!user) {
    res.status(401).json({ message: "Invalid account or password." });
    return;
  }

  const matched = bcrypt.compareSync(password, user.passwordHash);
  if (!matched) {
    res.status(401).json({ message: "Invalid account or password." });
    return;
  }

  const token = createSession(user.id);
  res.json({ token, user: buildPublicUser(user) });
});

app.post("/api/auth/logout", authRequired, (req, res) => {
  deleteSession.run(req.authUser.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: buildPublicUser(req.authUser) });
});

app.get("/api/meta/player-data", authRequired, (_req, res) => {
  res.json(getPlayerDataSummary());
});

app.get("/api/players", authRequired, (req, res) => {
  const state = getStateForUser(req.authUser.id);
  const excludeIds = state ? getRosterPlayers(state).map((player) => player.id) : [];
  const players = searchPlayerPool({
    search: req.query.search,
    position: req.query.position,
    teamId: req.query.teamId,
    maxSalary: req.query.maxSalary,
    excludeIds,
    limit: req.query.limit,
    sort: req.query.sort
  });

  res.json({
    players,
    meta: getPlayerDataSummary()
  });
});

app.post("/api/team/create", authRequired, (req, res) => {
  const { playerIds } = req.body ?? {};
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const result = createInitialTeamForState(state, playerIds);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }

  saveStateForUser(req.authUser.id, state);
  res.status(201).json(result.payload);
});

app.get("/api/profile", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const displayState = getDisplayProfileState(state);
  if (!isBeforeFirstDeadline()) {
    state.gamedayPoints = displayState.gamedayPoints;
    saveStateForUser(req.authUser.id, state);
  }

  const leagues = buildLeaguesForUser(displayState, req.authUser.gameId);

  res.json({
    profile: {
      teamName: displayState.teamName,
      managerName: displayState.managerName,
      overallPoints: displayState.overallPoints,
      overallRank: displayState.overallRank,
      totalPlayers: displayState.totalPlayers,
      gamedayPoints: displayState.gamedayPoints,
      fanLeague: displayState.fanLeague
    },
    transactions: {
      freeLeft: Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
      total: state.totalTransfers,
      rosterValue: state.rosterValue,
      bank: state.bank
    },
    leagues: {
      global: leagues.global,
      privateClassic: leagues.privateClassic
    }
  });
});

app.get("/api/lineup", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  res.json(getLineupPayload(state));
});

app.put("/api/lineup", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const next = req.body ?? {};

  if (next.captainId) {
    const allPlayers = [...state.starters, ...state.bench];
    const captainExists = allPlayers.some((player) => player.id === next.captainId);
    if (!captainExists) {
      res.status(400).json({ message: "Captain must be selected from your roster." });
      return;
    }
    state.captainId = next.captainId;
  }

  if (Array.isArray(next.starters)) {
    if (next.starters.length !== 5) {
      res.status(400).json({ message: "starters must contain 5 players." });
      return;
    }
    state.starters = next.starters;
  }

  if (Array.isArray(next.bench)) {
    if (next.bench.length !== 5) {
      res.status(400).json({ message: "bench must contain 5 players." });
      return;
    }
    state.bench = next.bench;
  }

  saveStateForUser(req.authUser.id, state);
  res.json(getLineupPayload(state));
});

app.get("/api/points/today", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  if (!hasCreatedTeam(state)) {
    res.status(400).json({ message: "Create your initial team first." });
    return;
  }

  if (isBeforeFirstDeadline()) {
    res.json({
      visible: false,
      message: "Points will unlock after the first deadline.",
      gameweek: getGameweekPayload(),
      summary: {
        average: POINTS_BASELINE.average,
        final: 0,
        top: POINTS_BASELINE.top
      },
      lineup: {
        starters: withVisiblePoints(state.starters),
        bench: withVisiblePoints(state.bench),
        captainId: state.captainId
      }
    });
    return;
  }

  const finalPoints = calcFinalPoints(state);
  state.gamedayPoints = finalPoints;
  saveStateForUser(req.authUser.id, state);

  res.json({
    visible: true,
    gameweek: getGameweekPayload(),
    summary: {
      average: POINTS_BASELINE.average,
      final: finalPoints,
      top: POINTS_BASELINE.top
    },
    lineup: {
      starters: withVisiblePoints(state.starters),
      bench: withVisiblePoints(state.bench),
      captainId: state.captainId
    }
  });
});

app.get("/api/transactions/options", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  res.json(getTransactionsPayload(state));
});

app.post("/api/transactions", authRequired, (req, res) => {
  const { outPlayerId, inPlayerId } = req.body ?? {};

  if (!outPlayerId || !inPlayerId) {
    res.status(400).json({ message: "outPlayerId and inPlayerId are required." });
    return;
  }

  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const result = replacePlayerForState(state, outPlayerId, inPlayerId);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }

  saveStateForUser(req.authUser.id, state);
  res.json(result);
});

app.get("/api/leagues", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  res.json(buildLeaguesForUser(state, req.authUser.gameId));
});

app.get("/api/schedule", authRequired, (_req, res) => {
  res.json(buildSchedulePayload());
});

app.get("/api/help/rules", authRequired, (_req, res) => {
  res.json(HELP_RULES);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Playoff Fantasy API listening on http://localhost:${PORT}`);
});
