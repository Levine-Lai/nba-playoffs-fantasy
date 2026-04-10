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
  dbPath
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
  const startersTotal = state.starters.reduce((sum, item) => sum + Number(item.points ?? 0), 0);
  const captain = state.starters.find((item) => item.id === state.captainId) ?? state.bench.find((item) => item.id === state.captainId);
  const captainBonus = captain ? Number(captain.points ?? 0) * 0.5 : 0;
  return Math.round(startersTotal + captainBonus);
}

function getLineupPayload(state) {
  return {
    gameweek: GAMEWEEK,
    lineup: {
      starters: state.starters,
      bench: state.bench,
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
  return {
    freeTransfersLeft: Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
    usedThisWeek: state.usedThisWeek,
    weeklyFreeLimit: state.weeklyFreeLimit,
    bank: state.bank,
    rosterValue: state.rosterValue,
    history: state.history,
    lineup: {
      starters: state.starters,
      bench: state.bench,
      captainId: state.captainId
    },
    market: state.market
  };
}

function replacePlayerForState(state, outPlayerId, inPlayerId) {
  const freeTransfersLeft = Math.max(0, state.weeklyFreeLimit - state.usedThisWeek);
  if (freeTransfersLeft <= 0) {
    return { ok: false, error: "No free transfers left for this week." };
  }

  const incoming = state.market.find((player) => player.id === inPlayerId);
  if (!incoming) {
    return { ok: false, error: "Incoming player not found in transfer market." };
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

  targetPool.splice(targetIndex, 1, {
    id: incoming.id,
    name: incoming.name,
    team: incoming.team,
    position: incoming.position,
    salary: incoming.salary,
    points: 0,
    color: incoming.trend === "up" ? "hot" : "cold",
    nextOpponent: "TBD",
    upcoming: ["TBD", "TBD"]
  });

  state.market = state.market
    .filter((player) => player.id !== incoming.id)
    .concat({
      id: outgoing.id,
      name: outgoing.name,
      team: outgoing.team,
      position: outgoing.position,
      salary: outgoing.salary,
      recentAverage: Number(outgoing.points ?? 0),
      trend: outgoing.color === "hot" ? "up" : "down"
    });

  state.usedThisWeek += 1;
  state.totalTransfers += 1;

  const record = {
    id: `tx-${Date.now()}`,
    timestamp: new Date().toISOString(),
    outPlayer: outgoing.name,
    inPlayer: incoming.name,
    cost: 0,
    note: "Free transfer"
  };

  state.history.unshift(record);

  return {
    ok: true,
    transfer: record,
    payload: getTransactionsPayload(state)
  };
}

function safeLoadState(userId, res) {
  const state = getStateForUser(userId);
  if (!state) {
    res.status(500).json({ message: "User state not found." });
    return null;
  }

  return state;
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

app.get("/api/profile", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const finalPoints = calcFinalPoints(state);
  state.gamedayPoints = finalPoints;
  saveStateForUser(req.authUser.id, state);

  const leagues = buildLeaguesForUser(state, req.authUser.gameId);

  res.json({
    profile: {
      teamName: state.teamName,
      managerName: state.managerName,
      overallPoints: state.overallPoints,
      overallRank: state.overallRank,
      totalPlayers: state.totalPlayers,
      gamedayPoints: state.gamedayPoints,
      fanLeague: state.fanLeague
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

  const finalPoints = calcFinalPoints(state);
  state.gamedayPoints = finalPoints;
  saveStateForUser(req.authUser.id, state);

  res.json({
    gameweek: GAMEWEEK,
    summary: {
      average: POINTS_BASELINE.average,
      final: finalPoints,
      top: POINTS_BASELINE.top
    },
    lineup: {
      starters: state.starters,
      bench: state.bench,
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
  res.json(SCHEDULE);
});

app.get("/api/help/rules", authRequired, (_req, res) => {
  res.json(HELP_RULES);
});

app.listen(PORT, () => {
  console.log(`Playoff Fantasy API listening on http://localhost:${PORT}`);
});
