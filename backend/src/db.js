import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import Database from "better-sqlite3";
import { buildInitialUserState } from "./gameTemplate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "playoff-fantasy.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL UNIQUE,
      game_id TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_states (
      user_id INTEGER PRIMARY KEY,
      team_name TEXT NOT NULL,
      manager_name TEXT NOT NULL,
      overall_points INTEGER NOT NULL,
      overall_rank INTEGER NOT NULL,
      total_players INTEGER NOT NULL,
      gameday_points INTEGER NOT NULL,
      fan_league TEXT NOT NULL,
      captain_id TEXT NOT NULL,
      starters_json TEXT NOT NULL,
      bench_json TEXT NOT NULL,
      market_json TEXT NOT NULL,
      used_this_week INTEGER NOT NULL,
      weekly_free_limit INTEGER NOT NULL,
      total_transfers INTEGER NOT NULL,
      roster_value REAL NOT NULL,
      bank REAL NOT NULL,
      history_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      code INTEGER,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      city TEXT,
      conference TEXT,
      division TEXT,
      raw_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS element_types (
      id INTEGER PRIMARY KEY,
      plural_name TEXT NOT NULL,
      singular_name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      squad_select INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      code INTEGER,
      first_name TEXT NOT NULL,
      second_name TEXT NOT NULL,
      web_name TEXT NOT NULL,
      known_name TEXT,
      team_id INTEGER NOT NULL,
      team_short_name TEXT NOT NULL,
      element_type INTEGER NOT NULL,
      position_short TEXT NOT NULL,
      now_cost INTEGER NOT NULL,
      salary REAL NOT NULL,
      total_points INTEGER NOT NULL,
      event_points INTEGER NOT NULL,
      points_per_game REAL NOT NULL,
      selected_by_percent REAL NOT NULL,
      status TEXT NOT NULL,
      can_select INTEGER NOT NULL,
      can_transact INTEGER NOT NULL,
      news TEXT,
      points_scored INTEGER NOT NULL,
      rebounds INTEGER NOT NULL,
      assists INTEGER NOT NULL,
      blocks INTEGER NOT NULL,
      steals INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (element_type) REFERENCES element_types(id)
    );

    CREATE TABLE IF NOT EXISTS game_rules (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

initSchema();

const insertUser = db.prepare(
  `INSERT INTO users (account, game_id, password_hash, created_at) VALUES (?, ?, ?, ?)`
);
const insertUserState = db.prepare(`
  INSERT INTO user_states (
    user_id, team_name, manager_name, overall_points, overall_rank, total_players, gameday_points,
    fan_league, captain_id, starters_json, bench_json, market_json, used_this_week,
    weekly_free_limit, total_transfers, roster_value, bank, history_json, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const getUserByAccount = db.prepare(
  `SELECT id, account, game_id AS gameId, password_hash AS passwordHash FROM users WHERE account = ?`
);
const getUserByGameId = db.prepare(
  `SELECT id, account, game_id AS gameId FROM users WHERE game_id = ?`
);
const getUserById = db.prepare(
  `SELECT id, account, game_id AS gameId FROM users WHERE id = ?`
);
const getSession = db.prepare(
  `SELECT s.token, s.user_id AS userId, u.account, u.game_id AS gameId, u.id
   FROM sessions s
   JOIN users u ON u.id = s.user_id
   WHERE s.token = ?`
);
const insertSession = db.prepare(
  `INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`
);
const deleteSession = db.prepare(`DELETE FROM sessions WHERE token = ?`);
const getRule = db.prepare(`SELECT value FROM game_rules WHERE key = ?`);
const upsertRule = db.prepare(`
  INSERT INTO game_rules (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);
const getStateByUserId = db.prepare(`
  SELECT
    team_name AS teamName,
    manager_name AS managerName,
    overall_points AS overallPoints,
    overall_rank AS overallRank,
    total_players AS totalPlayers,
    gameday_points AS gamedayPoints,
    fan_league AS fanLeague,
    captain_id AS captainId,
    starters_json AS startersJson,
    bench_json AS benchJson,
    market_json AS marketJson,
    used_this_week AS usedThisWeek,
    weekly_free_limit AS weeklyFreeLimit,
    total_transfers AS totalTransfers,
    roster_value AS rosterValue,
    bank,
    history_json AS historyJson
  FROM user_states
  WHERE user_id = ?
`);

const updateStateByUserId = db.prepare(`
  UPDATE user_states SET
    team_name = ?,
    manager_name = ?,
    overall_points = ?,
    overall_rank = ?,
    total_players = ?,
    gameday_points = ?,
    fan_league = ?,
    captain_id = ?,
    starters_json = ?,
    bench_json = ?,
    market_json = ?,
    used_this_week = ?,
    weekly_free_limit = ?,
    total_transfers = ?,
    roster_value = ?,
    bank = ?,
    history_json = ?,
    updated_at = ?
  WHERE user_id = ?
`);

const countPlayers = db.prepare(`SELECT COUNT(*) AS count FROM players`);
const getAllTeams = db.prepare(`SELECT id, code, name, short_name AS shortName FROM teams ORDER BY name`);
const getAllElementTypes = db.prepare(
  `SELECT id, singular_name AS singularName, short_name AS shortName, squad_select AS squadSelect FROM element_types ORDER BY id`
);
const getAllRules = db.prepare(`SELECT key, value, updated_at AS updatedAt FROM game_rules ORDER BY key`);

const registerUserTx = db.transaction((account, gameId, passwordHash) => {
  const createdAt = new Date().toISOString();
  const userInsert = insertUser.run(account, gameId, passwordHash, createdAt);
  const userId = Number(userInsert.lastInsertRowid);

  const initial = buildInitialUserState(gameId);
  insertUserState.run(
    userId,
    initial.teamName,
    initial.managerName,
    initial.overallPoints,
    initial.overallRank,
    initial.totalPlayers,
    initial.gamedayPoints,
    initial.fanLeague,
    initial.captainId,
    JSON.stringify(initial.starters),
    JSON.stringify(initial.bench),
    JSON.stringify(initial.market),
    initial.usedThisWeek,
    initial.weeklyFreeLimit,
    initial.totalTransfers,
    initial.rosterValue,
    initial.bank,
    JSON.stringify(initial.history),
    createdAt
  );

  return { id: userId, account, gameId };
});

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  insertSession.run(token, userId, new Date().toISOString());
  return token;
}

function getAuthenticatedUserByToken(token) {
  if (!token) {
    return null;
  }

  return getSession.get(token) ?? null;
}

function getStateForUser(userId) {
  const row = getStateByUserId.get(userId);
  if (!row) {
    return null;
  }

  return {
    ...row,
    starters: JSON.parse(row.startersJson),
    bench: JSON.parse(row.benchJson),
    market: JSON.parse(row.marketJson),
    history: JSON.parse(row.historyJson)
  };
}

function normalizePlayerRow(row) {
  const playerCode = row.code ? String(row.code) : null;
  const teamCode = row.teamCode ? String(row.teamCode) : null;
  const totalPoints = Number((Number(row.totalPoints) / 10).toFixed(1));
  const points = Number((Number(row.points) / 10).toFixed(1));
  const recentAverage = Number((Number(row.recentAverage) / 10).toFixed(1));
  const color = row.position === "FC" ? "hot" : "cold";

  return {
    id: String(row.id),
    code: playerCode,
    name: row.name,
    teamId: row.teamId ? Number(row.teamId) : null,
    teamCode,
    team: row.team,
    position: row.position,
    salary: Number(row.salary),
    totalPoints,
    points,
    recentAverage,
    selectedByPercent: Number(row.selectedByPercent),
    status: row.status,
    canSelect: Boolean(row.canSelect),
    canTransact: Boolean(row.canTransact),
    color,
    headshotUrl: playerCode ? `/nba/headshots/${playerCode}.png` : null,
    headshotFallbackUrl: playerCode ? `https://cdn.nba.com/headshots/nba/latest/520x380/${playerCode}.png` : null,
    teamLogoUrl: teamCode ? `/nba/team-logos/${teamCode}.png` : null,
    teamLogoFallbackUrl: teamCode ? `https://cdn.nba.com/logos/nba/${teamCode}/global/L/logo.svg` : null,
    nextOpponent: "TBD",
    upcoming: ["TBD", "TBD"]
  };
}

function getPlayersByIds(playerIds) {
  const ids = [...new Set(playerIds.map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`
      SELECT
        p.id,
        p.code,
        p.web_name AS name,
        p.team_id AS teamId,
        t.code AS teamCode,
        p.team_short_name AS team,
        p.position_short AS position,
        p.salary,
        p.total_points AS totalPoints,
        p.event_points AS points,
        p.points_per_game AS recentAverage,
        p.selected_by_percent AS selectedByPercent,
        p.status,
        p.can_select AS canSelect,
        p.can_transact AS canTransact
      FROM players p
      LEFT JOIN teams t ON t.id = p.team_id
      WHERE p.id IN (${placeholders})
    `)
    .all(...ids);

  return rows.map(normalizePlayerRow);
}

function searchPlayerPool(filters = {}) {
  const clauses = ["p.can_select = 1"];
  const params = {};

  if (filters.search) {
    clauses.push("(p.web_name LIKE @search OR p.first_name LIKE @search OR p.second_name LIKE @search)");
    params.search = `%${filters.search}%`;
  }

  if (filters.position) {
    clauses.push("p.position_short = @position");
    params.position = filters.position;
  }

  if (filters.teamId) {
    clauses.push("p.team_id = @teamId");
    params.teamId = Number(filters.teamId);
  }

  if (filters.maxSalary) {
    clauses.push("p.salary <= @maxSalary");
    params.maxSalary = Number(filters.maxSalary);
  }

  if (Array.isArray(filters.excludeIds) && filters.excludeIds.length) {
    const ids = filters.excludeIds.map((id) => Number(id)).filter(Number.isFinite);
    if (ids.length) {
      clauses.push(`p.id NOT IN (${ids.map((_, index) => `@exclude${index}`).join(",")})`);
      ids.forEach((id, index) => {
        params[`exclude${index}`] = id;
      });
    }
  }

  const limit = Math.min(Math.max(Number(filters.limit ?? 80), 1), 200);
  const sortSql =
    {
      salary: "p.salary DESC, p.total_points DESC",
      totalPoints: "p.total_points DESC, p.salary DESC",
      recentAverage: "p.points_per_game DESC, p.salary DESC"
    }[filters.sort] ?? "p.salary DESC, p.total_points DESC";
  const rows = db
    .prepare(`
      SELECT
        p.id,
        p.code,
        p.web_name AS name,
        p.team_id AS teamId,
        t.code AS teamCode,
        p.team_short_name AS team,
        p.position_short AS position,
        p.salary,
        p.total_points AS totalPoints,
        p.event_points AS points,
        p.points_per_game AS recentAverage,
        p.selected_by_percent AS selectedByPercent,
        p.status,
        p.can_select AS canSelect,
        p.can_transact AS canTransact
      FROM players p
      LEFT JOIN teams t ON t.id = p.team_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${sortSql}
      LIMIT ${limit}
    `)
    .all(params);

  return rows.map(normalizePlayerRow);
}

function getPlayerDataSummary() {
  return {
    players: countPlayers.get().count,
    teams: getAllTeams.all(),
    elementTypes: getAllElementTypes.all(),
    firstDeadline: getRuleValue("first_deadline", null),
    weeklyFreeTransfers: Number(getRuleValue("weekly_free_transfers", "2")),
    initialBudget: Number(getRuleValue("initial_budget", "100"))
  };
}

function getRuleValue(key, fallback) {
  const row = getRule.get(key);
  return row ? row.value : fallback;
}

function setRuleValue(key, value) {
  upsertRule.run(key, String(value), new Date().toISOString());
}

function getGameRules() {
  return getAllRules.all();
}

function saveStateForUser(userId, state) {
  const updatedAt = new Date().toISOString();

  updateStateByUserId.run(
    state.teamName,
    state.managerName,
    state.overallPoints,
    state.overallRank,
    state.totalPlayers,
    state.gamedayPoints,
    state.fanLeague,
    state.captainId,
    JSON.stringify(state.starters),
    JSON.stringify(state.bench),
    JSON.stringify(state.market),
    state.usedThisWeek,
    state.weeklyFreeLimit,
    state.totalTransfers,
    state.rosterValue,
    state.bank,
    JSON.stringify(state.history),
    updatedAt,
    userId
  );
}

export {
  db,
  dbPath,
  registerUserTx,
  getUserByAccount,
  getUserByGameId,
  getUserById,
  createSession,
  deleteSession,
  getAuthenticatedUserByToken,
  getStateForUser,
  saveStateForUser,
  getPlayersByIds,
  searchPlayerPool,
  getPlayerDataSummary,
  getRuleValue,
  setRuleValue,
  getGameRules
};
