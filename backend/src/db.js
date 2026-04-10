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
  saveStateForUser
};
