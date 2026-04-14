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
const scheduleCachePath = path.join(dataDir, "live-schedule-cache.json");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL UNIQUE COLLATE NOCASE,
      game_id TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS private_leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      owner_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS private_league_members (
      league_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (league_id, user_id),
      FOREIGN KEY (league_id) REFERENCES private_leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

initSchema();

function migrateUsersTableIfNeeded() {
  const usersSql = getTableSql("users");
  const userIndexes = db.prepare("PRAGMA index_list(users)").all();
  const hasUniqueGameId = userIndexes.some((index) => {
    if (!index.unique) {
      return false;
    }

    const columns = db.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all();
    return columns.some((column) => column.name === "game_id");
  });

  const hasCaseInsensitiveAccount = /account\s+TEXT\s+NOT\s+NULL\s+UNIQUE\s+COLLATE\s+NOCASE/i.test(usersSql);

  if (!hasUniqueGameId && hasCaseInsensitiveAccount) {
    return;
  }

  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    ALTER TABLE users RENAME TO users_legacy;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL UNIQUE COLLATE NOCASE,
      game_id TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO users (id, account, game_id, password_hash, created_at)
    SELECT id, account, game_id, password_hash, created_at
    FROM users_legacy;
    DROP TABLE users_legacy;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

migrateUsersTableIfNeeded();

function getTableSql(tableName) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)?.sql ?? "";
}

function repairUserForeignKeysIfNeeded() {
  const tablesWithBrokenUserRef = ["sessions", "user_states", "private_leagues", "private_league_members"].filter((tableName) =>
    getTableSql(tableName).includes("users_legacy")
  );

  if (!tablesWithBrokenUserRef.length) {
    return;
  }

  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    ALTER TABLE sessions RENAME TO sessions_legacy;
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO sessions (token, user_id, created_at)
    SELECT token, user_id, created_at FROM sessions_legacy;
    DROP TABLE sessions_legacy;

    ALTER TABLE user_states RENAME TO user_states_legacy;
    CREATE TABLE user_states (
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
    INSERT INTO user_states (
      user_id, team_name, manager_name, overall_points, overall_rank, total_players, gameday_points,
      fan_league, captain_id, starters_json, bench_json, market_json, used_this_week,
      weekly_free_limit, total_transfers, roster_value, bank, history_json, updated_at
    )
    SELECT
      user_id, team_name, manager_name, overall_points, overall_rank, total_players, gameday_points,
      fan_league, captain_id, starters_json, bench_json, market_json, used_this_week,
      weekly_free_limit, total_transfers, roster_value, bank, history_json, updated_at
    FROM user_states_legacy;
    DROP TABLE user_states_legacy;

    ALTER TABLE private_leagues RENAME TO private_leagues_legacy;
    CREATE TABLE private_leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      owner_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO private_leagues (id, name, code, owner_user_id, created_at)
    SELECT id, name, code, owner_user_id, created_at FROM private_leagues_legacy;
    DROP TABLE private_leagues_legacy;

    ALTER TABLE private_league_members RENAME TO private_league_members_legacy;
    CREATE TABLE private_league_members (
      league_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (league_id, user_id),
      FOREIGN KEY (league_id) REFERENCES private_leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO private_league_members (league_id, user_id, joined_at)
    SELECT league_id, user_id, joined_at FROM private_league_members_legacy;
    DROP TABLE private_league_members_legacy;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

repairUserForeignKeysIfNeeded();

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
const getPrivateLeagueByCode = db.prepare(`
  SELECT
    id,
    name,
    code,
    owner_user_id AS ownerUserId,
    created_at AS createdAt
  FROM private_leagues
  WHERE code = ?
`);
const getPrivateLeagueMembership = db.prepare(`
  SELECT league_id AS leagueId, user_id AS userId
  FROM private_league_members
  WHERE league_id = ? AND user_id = ?
`);
const insertPrivateLeague = db.prepare(`
  INSERT INTO private_leagues (name, code, owner_user_id, created_at)
  VALUES (?, ?, ?, ?)
`);
const insertPrivateLeagueMember = db.prepare(`
  INSERT INTO private_league_members (league_id, user_id, joined_at)
  VALUES (?, ?, ?)
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

function loadScheduleCache() {
  if (!fs.existsSync(scheduleCachePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(scheduleCachePath, "utf-8"));
  } catch {
    return null;
  }
}

function buildNextMatchupByTeam() {
  const cache = loadScheduleCache();
  const games = Array.isArray(cache?.games) ? cache.games : [];
  const lookup = new Map();

  games
    .filter((game) => game?.status !== "final")
    .slice()
    .sort((left, right) => new Date(left.date ?? 0).getTime() - new Date(right.date ?? 0).getTime())
    .forEach((game) => {
      const homeTeam = game.homeTeam ?? null;
      const awayTeam = game.awayTeam ?? null;

      if (homeTeam?.code && awayTeam && !lookup.has(String(homeTeam.code))) {
        lookup.set(String(homeTeam.code), {
          opponent: awayTeam,
          gamedayLabel: game.gamedayLabel ?? null,
          tipoff: game.tipoff ?? null
        });
      }

      if (awayTeam?.code && homeTeam && !lookup.has(String(awayTeam.code))) {
        lookup.set(String(awayTeam.code), {
          opponent: homeTeam,
          gamedayLabel: game.gamedayLabel ?? null,
          tipoff: game.tipoff ?? null
        });
      }
    });

  return lookup;
}

function normalizePlayerRow(row, nextMatchupByTeam = new Map()) {
  const playerCode = row.code ? String(row.code) : null;
  const teamCode = row.teamCode ? String(row.teamCode) : null;
  const totalPoints = Number((Number(row.totalPoints) / 10).toFixed(1));
  const points = Number((Number(row.points) / 10).toFixed(1));
  const recentAverage = Number((Number(row.recentAverage) / 10).toFixed(1));
  const color = row.position === "FC" ? "hot" : "cold";
  const nextMatchup = teamCode ? nextMatchupByTeam.get(teamCode) ?? null : null;
  const nextOpponent = nextMatchup?.opponent?.triCode || nextMatchup?.opponent?.name || "TBD";

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
    nextOpponent,
    nextOpponentName: nextMatchup?.opponent?.name ?? null,
    nextOpponentLogoUrl: nextMatchup?.opponent?.logoUrl ?? null,
    nextOpponentLogoFallbackUrl: nextMatchup?.opponent?.logoFallbackUrl ?? null,
    upcoming: nextMatchup ? [nextMatchup.gamedayLabel ?? "Upcoming", nextMatchup.tipoff ?? "-"] : ["TBD", "TBD"]
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

  const nextMatchupByTeam = buildNextMatchupByTeam();
  return rows.map((row) => normalizePlayerRow(row, nextMatchupByTeam));
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

  const nextMatchupByTeam = buildNextMatchupByTeam();
  return rows.map((row) => normalizePlayerRow(row, nextMatchupByTeam));
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

const clearAllUserDataTx = db.transaction(() => {
  db.prepare("DELETE FROM private_league_members").run();
  db.prepare("DELETE FROM private_leagues").run();
  db.prepare("DELETE FROM sessions").run();
  db.prepare("DELETE FROM user_states").run();
  db.prepare("DELETE FROM users").run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('users', 'private_leagues')").run();
});

function clearAllUserData() {
  clearAllUserDataTx();
}

function generateLeagueCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    if (!getPrivateLeagueByCode.get(code)) {
      return code;
    }
  }

  return `${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

function buildLeagueMembers(leagueId) {
  const rows = db
    .prepare(`
      SELECT
        u.id AS userId,
        u.game_id AS gameId,
        s.team_name AS teamName,
        s.manager_name AS managerName,
        s.overall_points AS overallPoints,
        s.gameday_points AS gamedayPoints
      FROM private_league_members m
      JOIN users u ON u.id = m.user_id
      JOIN user_states s ON s.user_id = u.id
      WHERE m.league_id = ?
      ORDER BY s.overall_points DESC, u.game_id COLLATE NOCASE ASC
    `)
    .all(leagueId);

  return rows.map((row, index) => ({
    userId: String(row.userId),
    gameId: row.gameId,
    teamName: row.teamName,
    managerName: row.managerName,
    rank: index + 1,
    gamedayPoints: Number(row.gamedayPoints ?? 0),
    totalPoints: Number(row.overallPoints ?? 0)
  }));
}

function listPrivateLeaguesForUser(userId) {
  const leagues = db
    .prepare(`
      SELECT
        l.id,
        l.name,
        l.code,
        l.owner_user_id AS ownerUserId,
        l.created_at AS createdAt,
        COUNT(all_members.user_id) AS memberCount
      FROM private_leagues l
      JOIN private_league_members my_membership
        ON my_membership.league_id = l.id AND my_membership.user_id = ?
      LEFT JOIN private_league_members all_members
        ON all_members.league_id = l.id
      GROUP BY l.id, l.name, l.code, l.owner_user_id, l.created_at
      ORDER BY l.created_at DESC, l.id DESC
    `)
    .all(userId);

  return leagues.map((league) => {
    const members = buildLeagueMembers(league.id);
    const currentMember = members.find((member) => member.userId === String(userId));

    return {
      id: String(league.id),
      name: league.name,
      code: league.code,
      rank: currentMember?.rank ?? 0,
      lastRank: currentMember?.rank ?? 0,
      memberCount: Number(league.memberCount ?? 0),
      isOwner: Number(league.ownerUserId) === Number(userId),
      members
    };
  });
}

const createPrivateLeagueTx = db.transaction((ownerUserId, name) => {
  const createdAt = new Date().toISOString();
  const code = generateLeagueCode();
  const result = insertPrivateLeague.run(name, code, ownerUserId, createdAt);
  const leagueId = Number(result.lastInsertRowid);
  insertPrivateLeagueMember.run(leagueId, ownerUserId, createdAt);
  return getPrivateLeagueByCode.get(code);
});

function createPrivateLeague(ownerUserId, name) {
  return createPrivateLeagueTx(ownerUserId, name);
}

function joinPrivateLeague(userId, rawCode) {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "League code is required." };
  }

  const league = getPrivateLeagueByCode.get(code);
  if (!league) {
    return { ok: false, error: "League code not found." };
  }

  if (getPrivateLeagueMembership.get(league.id, userId)) {
    return { ok: false, error: "You are already in this league." };
  }

  insertPrivateLeagueMember.run(league.id, userId, new Date().toISOString());
  return { ok: true, league };
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
  getGameRules,
  listPrivateLeaguesForUser,
  createPrivateLeague,
  joinPrivateLeague,
  clearAllUserData
};
