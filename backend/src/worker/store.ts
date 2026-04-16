import { buildInitialUserState } from "../shared/gameTemplate";
import { buildPlayoffPeriods, findEditablePlayoffPeriod, getPlayoffGameweekNumber, normalizeScheduleDateKey } from "../shared/scheduleUtils";
import type {
  AuthUser,
  Env,
  LeagueEntry,
  LeagueMemberEntry,
  NextMatchup,
  Player,
  UserChipsState,
  PublicUser,
  StoredScheduleCache,
  TeamAsset,
  UserState
} from "./types";

export const DB_PATH_LABEL = "d1://PLAYOFF_FANTASY_DB";
const USER_CHIPS_STATE_KEY = "user_chips_v1";

type UserRow = {
  id: number;
  account: string;
  gameId: string;
  passwordHash?: string;
};

type StateRow = {
  teamName: string;
  managerName: string;
  overallPoints: number;
  overallRank: number;
  totalPlayers: number;
  gamedayPoints: number;
  fanLeague: string;
  captainId: string;
  startersJson: string;
  benchJson: string;
  marketJson: string;
  usedThisWeek: number;
  weeklyFreeLimit: number;
  totalTransfers: number;
  rosterValue: number;
  bank: number;
  historyJson: string;
};

type PlayerRow = {
  id: number;
  code: number | null;
  name: string;
  teamId: number | null;
  teamCode: number | null;
  team: string;
  position: string;
  salary: number;
  totalPoints: number;
  points: number;
  recentAverage: number;
  selectedByPercent: number;
  status: string;
  canSelect: number;
  canTransact: number;
};

function safeJsonParse<T>(value: string, fallback: T) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function first<T>(env: Env, sql: string, ...bindings: unknown[]) {
  return (await env.PLAYOFF_FANTASY_DB.prepare(sql).bind(...bindings).first<T>()) ?? null;
}

async function all<T>(env: Env, sql: string, ...bindings: unknown[]) {
  const result = await env.PLAYOFF_FANTASY_DB.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

async function run(env: Env, sql: string, ...bindings: unknown[]) {
  return env.PLAYOFF_FANTASY_DB.prepare(sql).bind(...bindings).run();
}

function buildHeadshotUrl(playerCode: string | null) {
  return playerCode ? `/nba/headshots/${playerCode}.png` : null;
}

function buildHeadshotFallbackUrl(playerCode: string | null) {
  return playerCode ? `https://cdn.nba.com/headshots/nba/latest/520x380/${playerCode}.png` : null;
}

function buildTeamLogoUrl(teamCode: string | null) {
  return teamCode ? `/nba/team-logos/${teamCode}.png` : null;
}

function buildTeamLogoFallbackUrl(teamCode: string | null) {
  return teamCode ? `https://cdn.nba.com/logos/nba/${teamCode}/global/L/logo.svg` : null;
}

function normalizePlayerRow(row: PlayerRow, nextMatchupByTeam = new Map<string, NextMatchup>()) {
  const playerCode = row.code ? String(row.code) : null;
  const teamCode = row.teamCode ? String(row.teamCode) : null;
  const totalPoints = Number((Number(row.totalPoints) / 10).toFixed(1));
  const points = Number((Number(row.points) / 10).toFixed(1));
  const recentAverage = Number((Number(row.recentAverage) / 10).toFixed(1));
  const color = row.position === "FC" ? "hot" : "cold";
  const nextMatchup = teamCode ? nextMatchupByTeam.get(teamCode) ?? null : null;
  const nextOpponent = nextMatchup?.opponent?.triCode || nextMatchup?.opponent?.name;

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
    headshotUrl: buildHeadshotUrl(playerCode),
    headshotFallbackUrl: buildHeadshotFallbackUrl(playerCode),
    teamLogoUrl: buildTeamLogoUrl(teamCode),
    teamLogoFallbackUrl: buildTeamLogoFallbackUrl(teamCode),
    nextOpponent,
    nextOpponentName: nextMatchup?.opponent?.name ?? null,
    nextOpponentLogoUrl: nextMatchup?.opponent?.logoUrl ?? null,
    nextOpponentLogoFallbackUrl: nextMatchup?.opponent?.logoFallbackUrl ?? null,
    upcoming: nextMatchup ? [nextMatchup.gamedayLabel ?? "Upcoming", nextMatchup.tipoff ?? "-"] : [],
    upcomingSchedule: nextMatchup?.upcomingSchedule ?? []
  } satisfies Player;
}

function buildDefaultUserChipsState(): UserChipsState {
  return {
    wildcard: {
      used: false,
      activePeriodKey: null,
      activatedAt: null
    },
    allStar: {
      used: false,
      activePeriodKey: null,
      activatedAt: null,
      originalLineup: null,
      activeLineup: null
    }
  };
}

function buildPublicUser(user: { id: string | number; account: string; gameId: string }): PublicUser {
  return {
    id: String(user.id),
    account: user.account,
    gameId: user.gameId,
    displayName: user.gameId
  };
}

function randomTokenHex(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function randomLeagueCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export async function readAppState<T>(env: Env, key: string, fallback: T) {
  const row = await first<{ value: string }>(env, "SELECT value FROM app_state WHERE key = ?", key);
  if (!row?.value) {
    return fallback;
  }

  return safeJsonParse<T>(row.value, fallback);
}

export async function writeAppState(env: Env, key: string, value: unknown) {
  const now = new Date().toISOString();
  await run(
    env,
    `
      INSERT INTO app_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
    key,
    JSON.stringify(value),
    now
  );
}

export async function getRuleValue(env: Env, key: string, fallback: string | null) {
  const row = await first<{ value: string }>(env, "SELECT value FROM game_rules WHERE key = ?", key);
  return row ? row.value : fallback;
}

export async function getAllRules(env: Env) {
  return all<{ key: string; value: string; updatedAt: string }>(
    env,
    "SELECT key, value, updated_at AS updatedAt FROM game_rules ORDER BY key"
  );
}

export async function getUserByAccount(env: Env, account: string) {
  return first<UserRow>(
    env,
    "SELECT id, account, game_id AS gameId, password_hash AS passwordHash FROM users WHERE account = ?",
    account
  );
}

export async function getUserChipsState(env: Env, userId: string | number) {
  const registry = await readAppState<Record<string, UserChipsState>>(env, USER_CHIPS_STATE_KEY, {});
  return registry[String(userId)] ?? buildDefaultUserChipsState();
}

export async function saveUserChipsState(env: Env, userId: string | number, chips: UserChipsState) {
  const registry = await readAppState<Record<string, UserChipsState>>(env, USER_CHIPS_STATE_KEY, {});
  registry[String(userId)] = chips;
  await writeAppState(env, USER_CHIPS_STATE_KEY, registry);
}

export async function getPublicUserById(env: Env, userId: string | number) {
  return first<PublicUser>(
    env,
    "SELECT id, account, game_id AS gameId, game_id AS displayName FROM users WHERE id = ?",
    Number(userId)
  );
}

export async function getAuthenticatedUserByToken(env: Env, token: string | null) {
  if (!token) {
    return null;
  }

  return first<AuthUser>(
    env,
    `
      SELECT
        u.id AS id,
        u.account AS account,
        u.game_id AS gameId
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `,
    token
  );
}

export async function createSession(env: Env, userId: string | number) {
  const token = randomTokenHex(32);
  await run(env, "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, Number(userId), new Date().toISOString());
  return token;
}

export async function deleteSession(env: Env, token: string) {
  await run(env, "DELETE FROM sessions WHERE token = ?", token);
}

export async function registerUser(env: Env, account: string, gameId: string, passwordHash: string) {
  const createdAt = new Date().toISOString();
  let userId = 0;

  try {
    const insertResult = await run(
      env,
      "INSERT INTO users (account, game_id, password_hash, created_at) VALUES (?, ?, ?, ?)",
      account,
      gameId,
      passwordHash,
      createdAt
    );
    userId = Number(insertResult.meta.last_row_id ?? 0);

    if (!userId) {
      const row = await getUserByAccount(env, account);
      userId = Number(row?.id ?? 0);
    }

    const initial = buildInitialUserState(gameId);
    await run(
      env,
      `
        INSERT INTO user_states (
          user_id, team_name, manager_name, overall_points, overall_rank, total_players, gameday_points,
          fan_league, captain_id, starters_json, bench_json, market_json, used_this_week,
          weekly_free_limit, total_transfers, roster_value, bank, history_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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

    return buildPublicUser({ id: userId, account, gameId });
  } catch (error) {
    if (userId) {
      await run(env, "DELETE FROM users WHERE id = ?", userId);
    }
    throw error;
  }
}

export async function getStateForUser(env: Env, userId: string | number) {
  const row = await first<StateRow>(
    env,
    `
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
        bank AS bank,
        history_json AS historyJson
      FROM user_states
      WHERE user_id = ?
    `,
    Number(userId)
  );

  if (!row) {
    return null;
  }

  return {
    teamName: row.teamName,
    managerName: row.managerName,
    overallPoints: Number(row.overallPoints ?? 0),
    overallRank: Number(row.overallRank ?? 0),
    totalPlayers: Number(row.totalPlayers ?? 0),
    gamedayPoints: Number(row.gamedayPoints ?? 0),
    fanLeague: row.fanLeague,
    captainId: row.captainId ?? "",
    captainDecisionLocked: false,
    starters: safeJsonParse<Player[]>(row.startersJson, []),
    bench: safeJsonParse<Player[]>(row.benchJson, []),
    market: safeJsonParse<Player[]>(row.marketJson, []),
    usedThisWeek: Number(row.usedThisWeek ?? 0),
    weeklyFreeLimit: Number(row.weeklyFreeLimit ?? 0),
    totalTransfers: Number(row.totalTransfers ?? 0),
    rosterValue: Number(row.rosterValue ?? 0),
    bank: Number(row.bank ?? 0),
    history: safeJsonParse(row.historyJson, [])
  } satisfies UserState;
}

export async function saveStateForUser(env: Env, userId: string | number, state: UserState) {
  await run(
    env,
    `
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
    `,
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
    new Date().toISOString(),
    Number(userId)
  );
}

export async function getPlayersByIds(env: Env, playerIds: string[], nextMatchupByTeam = new Map<string, NextMatchup>()) {
  const ids = [...new Set(playerIds.map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = await all<PlayerRow>(
    env,
    `
      SELECT
        p.id AS id,
        p.code AS code,
        p.web_name AS name,
        p.team_id AS teamId,
        t.code AS teamCode,
        p.team_short_name AS team,
        p.position_short AS position,
        p.salary AS salary,
        p.total_points AS totalPoints,
        p.event_points AS points,
        p.points_per_game AS recentAverage,
        p.selected_by_percent AS selectedByPercent,
        p.status AS status,
        p.can_select AS canSelect,
        p.can_transact AS canTransact
      FROM players p
      LEFT JOIN teams t ON t.id = p.team_id
      WHERE p.id IN (${placeholders})
    `,
    ...ids
  );

  return rows.map((row) => normalizePlayerRow(row, nextMatchupByTeam));
}

export async function searchPlayerPool(
  env: Env,
  filters: {
    search?: string | null;
    position?: string | null;
    teamId?: string | null;
    maxSalary?: string | null;
    excludeIds?: string[];
    limit?: string | number | null;
    sort?: string | null;
  },
  nextMatchupByTeam = new Map<string, NextMatchup>()
) {
  const clauses = ["p.can_select = 1"];
  const bindings: unknown[] = [];

  if (filters.search) {
    clauses.push("(p.web_name LIKE ? OR p.first_name LIKE ? OR p.second_name LIKE ?)");
    const search = `%${filters.search}%`;
    bindings.push(search, search, search);
  }

  if (filters.position) {
    clauses.push("p.position_short = ?");
    bindings.push(filters.position);
  }

  if (filters.teamId) {
    clauses.push("p.team_id = ?");
    bindings.push(Number(filters.teamId));
  }

  if (filters.maxSalary) {
    clauses.push("p.salary <= ?");
    bindings.push(Number(filters.maxSalary));
  }

  if (Array.isArray(filters.excludeIds) && filters.excludeIds.length) {
    const ids = filters.excludeIds.map((id) => Number(id)).filter(Number.isFinite);
    if (ids.length) {
      clauses.push(`p.id NOT IN (${ids.map(() => "?").join(",")})`);
      bindings.push(...ids);
    }
  }

  const limit = Math.min(Math.max(Number(filters.limit ?? 80), 1), 200);
  const sortSql =
    {
      salary: "p.salary DESC, p.total_points DESC",
      totalPoints: "p.total_points DESC, p.salary DESC",
      recentAverage: "p.points_per_game DESC, p.salary DESC"
    }[filters.sort ?? ""] ?? "p.salary DESC, p.total_points DESC";

  const rows = await all<PlayerRow>(
    env,
    `
      SELECT
        p.id AS id,
        p.code AS code,
        p.web_name AS name,
        p.team_id AS teamId,
        t.code AS teamCode,
        p.team_short_name AS team,
        p.position_short AS position,
        p.salary AS salary,
        p.total_points AS totalPoints,
        p.event_points AS points,
        p.points_per_game AS recentAverage,
        p.selected_by_percent AS selectedByPercent,
        p.status AS status,
        p.can_select AS canSelect,
        p.can_transact AS canTransact
      FROM players p
      LEFT JOIN teams t ON t.id = p.team_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${sortSql}
      LIMIT ${limit}
    `,
    ...bindings
  );

  return rows.map((row) => normalizePlayerRow(row, nextMatchupByTeam));
}

export async function getPlayerDataSummary(env: Env) {
  const [countRow, teams, elementTypes] = await Promise.all([
    first<{ count: number }>(env, "SELECT COUNT(*) AS count FROM players"),
    all<{ id: number; code: number | null; name: string; shortName: string }>(
      env,
      "SELECT id, code, name, short_name AS shortName FROM teams ORDER BY name"
    ),
    all<{ id: number; singularName: string; shortName: string; squadSelect: number }>(
      env,
      "SELECT id, singular_name AS singularName, short_name AS shortName, squad_select AS squadSelect FROM element_types ORDER BY id"
    )
  ]);

  const [firstDeadline, weeklyFreeTransfers, initialBudget] = await Promise.all([
    getRuleValue(env, "first_deadline", null),
    getRuleValue(env, "weekly_free_transfers", "2"),
    getRuleValue(env, "initial_budget", "100")
  ]);

  return {
    players: Number(countRow?.count ?? 0),
    teams,
    elementTypes,
    firstDeadline,
    weeklyFreeTransfers: Number(weeklyFreeTransfers ?? 2),
    initialBudget: Number(initialBudget ?? 100)
  };
}

async function getPrivateLeagueByCode(env: Env, code: string) {
  return first<{ id: number; name: string; code: string; ownerUserId: number; createdAt: string }>(
    env,
    `
      SELECT
        id,
        name,
        code,
        owner_user_id AS ownerUserId,
        created_at AS createdAt
      FROM private_leagues
      WHERE code = ?
    `,
    code
  );
}

async function getPrivateLeagueMembership(env: Env, leagueId: number, userId: number) {
  return first<{ leagueId: number; userId: number }>(
    env,
    "SELECT league_id AS leagueId, user_id AS userId FROM private_league_members WHERE league_id = ? AND user_id = ?",
    leagueId,
    userId
  );
}

export async function usersSharePrivateLeague(env: Env, leftUserId: string | number, rightUserId: string | number) {
  if (Number(leftUserId) === Number(rightUserId)) {
    return true;
  }

  const row = await first<{ sharedLeagueId: number }>(
    env,
    `
      SELECT lm1.league_id AS sharedLeagueId
      FROM private_league_members lm1
      JOIN private_league_members lm2
        ON lm2.league_id = lm1.league_id
      WHERE lm1.user_id = ? AND lm2.user_id = ?
      LIMIT 1
    `,
    Number(leftUserId),
    Number(rightUserId)
  );

  return Boolean(row?.sharedLeagueId);
}

export async function listStandingMembers(env: Env) {
  const rows = await all<{
    userId: number;
    gameId: string;
    teamName: string;
    managerName: string;
    overallPoints: number;
    gamedayPoints: number;
  }>(
    env,
    `
      SELECT
        u.id AS userId,
        u.game_id AS gameId,
        s.team_name AS teamName,
        s.manager_name AS managerName,
        s.overall_points AS overallPoints,
        s.gameday_points AS gamedayPoints
      FROM users u
      JOIN user_states s ON s.user_id = u.id
      ORDER BY s.overall_points DESC, u.game_id COLLATE NOCASE ASC
    `
  );

  return rows.map((row, index) => {
    return {
      userId: String(row.userId),
      gameId: row.gameId,
      teamName: row.teamName,
      managerName: row.managerName,
      rank: index + 1,
      gamedayPoints: Number(row.gamedayPoints ?? 0),
      totalPoints: Number(row.overallPoints ?? 0)
    } satisfies LeagueMemberEntry;
  });
}

async function buildLeagueMembers(env: Env, leagueId: number) {
  const rows = await all<{
    userId: number;
    gameId: string;
    teamName: string;
    managerName: string;
    overallPoints: number;
    gamedayPoints: number;
  }>(
    env,
    `
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
    `,
    leagueId
  );

  return rows.map((row, index) => {
    return {
      userId: String(row.userId),
      gameId: row.gameId,
      teamName: row.teamName,
      managerName: row.managerName,
      rank: index + 1,
      gamedayPoints: Number(row.gamedayPoints ?? 0),
      totalPoints: Number(row.overallPoints ?? 0)
    } satisfies LeagueMemberEntry;
  });
}

export async function listPrivateLeaguesForUser(env: Env, userId: string | number) {
  const leagues = await all<{
    id: number;
    name: string;
    code: string;
    ownerUserId: number;
    createdAt: string;
    memberCount: number;
  }>(
    env,
    `
      SELECT
        l.id AS id,
        l.name AS name,
        l.code AS code,
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
    `,
    Number(userId)
  );

  const entries: LeagueEntry[] = [];
  for (const league of leagues) {
    const members = await buildLeagueMembers(env, league.id);
    const currentMember = members.find((member) => member.userId === String(userId));
    entries.push({
      id: String(league.id),
      name: league.name,
      code: league.code,
      rank: currentMember?.rank ?? 0,
      lastRank: currentMember?.rank ?? 0,
      memberCount: Number(league.memberCount ?? 0),
      isOwner: Number(league.ownerUserId) === Number(userId),
      members
    });
  }

  return entries;
}

export async function createPrivateLeague(env: Env, ownerUserId: string | number, name: string) {
  const now = new Date().toISOString();
  const numericOwnerId = Number(ownerUserId);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = randomLeagueCode();
    const existing = await getPrivateLeagueByCode(env, code);
    if (existing) {
      continue;
    }

    try {
      const insertResult = await run(
        env,
        "INSERT INTO private_leagues (name, code, owner_user_id, created_at) VALUES (?, ?, ?, ?)",
        name,
        code,
        numericOwnerId,
        now
      );
      const leagueId = Number(insertResult.meta.last_row_id ?? 0);
      await run(
        env,
        "INSERT INTO private_league_members (league_id, user_id, joined_at) VALUES (?, ?, ?)",
        leagueId,
        numericOwnerId,
        now
      );

      return {
        id: String(leagueId),
        name,
        code
      };
    } catch {
      // Retry on rare code collisions.
    }
  }

  throw new Error("Failed to create league code.");
}

export async function joinPrivateLeague(env: Env, userId: string | number, rawCode: string) {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code) {
    return { ok: false as const, error: "League code is required." };
  }

  const league = await getPrivateLeagueByCode(env, code);
  if (!league) {
    return { ok: false as const, error: "League code not found." };
  }

  const membership = await getPrivateLeagueMembership(env, league.id, Number(userId));
  if (membership) {
    return { ok: false as const, error: "You are already in this league." };
  }

  await run(
    env,
    "INSERT INTO private_league_members (league_id, user_id, joined_at) VALUES (?, ?, ?)",
    league.id,
    Number(userId),
    new Date().toISOString()
  );

  return {
    ok: true as const,
    league: {
      id: String(league.id),
      name: league.name,
      code: league.code
    }
  };
}

export async function getStoredScheduleCache(env: Env) {
  return readAppState<StoredScheduleCache | null>(env, "live_schedule_cache", null);
}

export function buildNextMatchupByTeamFromCache(cache: StoredScheduleCache | null) {
  const games = Array.isArray(cache?.games) ? cache.games : [];
  const lookup = new Map<string, NextMatchup>();
  const editablePeriod = findEditablePlayoffPeriod(
    buildPlayoffPeriods(
      games,
      (game) => game.gamedayKey ?? normalizeScheduleDateKey(game.date),
      (game) => game.id
    )
  );

  if (!editablePeriod) {
    return lookup;
  }

  const buildDateKey = (offset: number) => {
    const date = new Date(`${editablePeriod.gamedayKey}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }

    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const dateKeys = Array.from({ length: 5 }, (_, index) => buildDateKey(index)).filter(Boolean);
  const dateIndexByKey = new Map(dateKeys.map((dateKey, index) => [dateKey, index]));
  const scheduleByTeam = new Map<string, NonNullable<NextMatchup["upcomingSchedule"]>>();
  const ensureSchedule = (teamCode: string) => {
    if (!scheduleByTeam.has(teamCode)) {
      scheduleByTeam.set(
        teamCode,
        dateKeys.map((dateKey) => ({
          dateKey,
          hasGame: false
        }))
      );
    }

    return scheduleByTeam.get(teamCode)!;
  };

  games.forEach((game) => {
    const dateKey = game.gamedayKey ?? normalizeScheduleDateKey(game.date);
    const targetIndex = dateIndexByKey.get(dateKey);
    const homeCode = String(game.homeTeam?.code ?? "");
    const awayCode = String(game.awayTeam?.code ?? "");

    if (targetIndex === undefined || !homeCode || !awayCode) {
      return;
    }

    const homeSchedule = ensureSchedule(homeCode);
    const awaySchedule = ensureSchedule(awayCode);

    homeSchedule[targetIndex] = {
      dateKey,
      hasGame: true,
      opponentName: game.awayTeam?.name ?? null,
      opponentTriCode: game.awayTeam?.triCode ?? null,
      opponentLogoUrl: game.awayTeam?.logoUrl ?? null,
      opponentLogoFallbackUrl: game.awayTeam?.logoFallbackUrl ?? null
    };
    awaySchedule[targetIndex] = {
      dateKey,
      hasGame: true,
      opponentName: game.homeTeam?.name ?? null,
      opponentTriCode: game.homeTeam?.triCode ?? null,
      opponentLogoUrl: game.homeTeam?.logoUrl ?? null,
      opponentLogoFallbackUrl: game.homeTeam?.logoFallbackUrl ?? null
    };
  });

  games
    .filter(
      (game) =>
        Number(getPlayoffGameweekNumber(game.id) ?? 0) === editablePeriod.roundNumber &&
        (game.gamedayKey ?? normalizeScheduleDateKey(game.date)) === editablePeriod.gamedayKey &&
        game?.status !== "final"
    )
    .slice()
    .sort((left, right) => new Date(left.date ?? 0).getTime() - new Date(right.date ?? 0).getTime())
    .forEach((game) => {
      const homeTeam = game.homeTeam ?? null;
      const awayTeam = game.awayTeam ?? null;

      if (homeTeam?.code && awayTeam && !lookup.has(String(homeTeam.code))) {
        lookup.set(String(homeTeam.code), {
          opponent: awayTeam,
          gamedayLabel: game.gamedayLabel ?? null,
          tipoff: game.tipoff ?? null,
          upcomingSchedule: scheduleByTeam.get(String(homeTeam.code)) ?? []
        });
      }

      if (awayTeam?.code && homeTeam && !lookup.has(String(awayTeam.code))) {
        lookup.set(String(awayTeam.code), {
          opponent: homeTeam,
          gamedayLabel: game.gamedayLabel ?? null,
          tipoff: game.tipoff ?? null,
          upcomingSchedule: scheduleByTeam.get(String(awayTeam.code)) ?? []
        });
      }
    });

  return lookup;
}

export function toTeamAsset(team: {
  teamId?: number | string | null;
  teamCity?: string | null;
  teamName?: string | null;
  teamTricode?: string | null;
}): TeamAsset {
  const code = team.teamId ? String(team.teamId) : null;
  return {
    name: `${team.teamCity ?? ""} ${team.teamName ?? ""}`.trim() || team.teamTricode || "TBD",
    code,
    triCode: team.teamTricode ?? "",
    id: team.teamId ? Number(team.teamId) : null,
    logoUrl: buildTeamLogoUrl(code),
    logoFallbackUrl: buildTeamLogoFallbackUrl(code)
  };
}

export { buildPublicUser };
