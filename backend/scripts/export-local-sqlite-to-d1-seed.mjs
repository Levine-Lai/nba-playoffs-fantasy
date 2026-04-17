import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { backendRoot, buildInsert, readJsonIfExists, writeSqlFile } from "./sql-helpers.mjs";

const sourceDbPath = path.join(backendRoot, "data", "playoff-fantasy.db");
const sourceScheduleCachePath = path.join(backendRoot, "data", "live-schedule-cache.json");
const outputRelativePath = path.join("tmp", "d1-seed.sql");
const TRUE_PLAYOFF_DAY1_DEADLINE = "2026-04-18T16:30:00Z";

if (!fs.existsSync(sourceDbPath)) {
  throw new Error(`Local SQLite database not found: ${sourceDbPath}`);
}

const db = new Database(sourceDbPath, { readonly: true });

const tableColumns = {
  users: ["id", "account", "game_id", "password_hash", "created_at"],
  sessions: ["token", "user_id", "created_at"],
  user_states: [
    "user_id",
    "team_name",
    "manager_name",
    "overall_points",
    "overall_rank",
    "total_players",
    "gameday_points",
    "fan_league",
    "captain_id",
    "starters_json",
    "bench_json",
    "market_json",
    "used_this_week",
    "weekly_free_limit",
    "total_transfers",
    "roster_value",
    "bank",
    "history_json",
    "updated_at"
  ],
  teams: ["id", "code", "name", "short_name", "city", "conference", "division", "raw_json", "updated_at"],
  element_types: ["id", "plural_name", "singular_name", "short_name", "squad_select", "raw_json", "updated_at"],
  players: [
    "id",
    "code",
    "first_name",
    "second_name",
    "web_name",
    "known_name",
    "team_id",
    "team_short_name",
    "element_type",
    "position_short",
    "now_cost",
    "salary",
    "total_points",
    "event_points",
    "points_per_game",
    "selected_by_percent",
    "status",
    "can_select",
    "can_transact",
    "news",
    "points_scored",
    "rebounds",
    "assists",
    "blocks",
    "steals",
    "raw_json",
    "updated_at"
  ],
  game_rules: ["key", "value", "updated_at"],
  private_leagues: ["id", "name", "code", "owner_user_id", "created_at"],
  private_league_members: ["league_id", "user_id", "joined_at"]
};

const deleteOrder = [
  "private_league_members",
  "private_leagues",
  "sessions",
  "user_states",
  "users",
  "players",
  "element_types",
  "teams",
  "game_rules",
  "app_state"
];

const insertOrder = [
  "teams",
  "element_types",
  "players",
  "game_rules",
  "users",
  "user_states",
  "sessions",
  "private_leagues",
  "private_league_members"
];

const statements = [];
const now = new Date().toISOString();

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeScheduleDateKey(dateInput) {
  if (!dateInput) {
    return "";
  }

  const stringValue = String(dateInput);
  const directMatch = stringValue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function formatScheduleDateLabel(dateKey) {
  if (!dateKey) {
    return "";
  }

  const date = new Date(`${dateKey}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function isTruePlayoffGameId(gameId) {
  return String(gameId ?? "").startsWith("004");
}

function resetStoredPlayers(rawValue) {
  return safeJsonParse(rawValue, []).map((player) => ({
    ...player,
    points: 0,
    pointsWindowKey: null
  }));
}

function sanitizeUserStateRow(row) {
  return {
    ...row,
    overall_points: 0,
    overall_rank: 0,
    total_players: 0,
    gameday_points: 0,
    starters_json: JSON.stringify(resetStoredPlayers(row.starters_json)),
    bench_json: JSON.stringify(resetStoredPlayers(row.bench_json)),
    market_json: JSON.stringify(resetStoredPlayers(row.market_json)),
    used_this_week: 0,
    weekly_free_limit: 0,
    total_transfers: 0,
    history_json: "[]",
    updated_at: now
  };
}

function sanitizeScheduleCache(cache) {
  const sourceGames = (Array.isArray(cache?.games) ? cache.games : [])
    .filter((game) => isTruePlayoffGameId(game.id))
    .slice()
    .sort((left, right) => new Date(left.date ?? 0).getTime() - new Date(right.date ?? 0).getTime());

  if (!sourceGames.length) {
    return null;
  }

  const dateKeys = [...new Set(sourceGames.map((game) => normalizeScheduleDateKey(game.gamedayKey ?? game.date)).filter(Boolean))];
  const dayByDateKey = new Map(
    dateKeys.map((dateKey, index) => [
      dateKey,
      {
        index: index + 1,
        label: `Day ${index + 1}`,
        dateLabel: formatScheduleDateLabel(dateKey)
      }
    ])
  );

  const games = sourceGames.map((game) => {
    const dateKey = normalizeScheduleDateKey(game.gamedayKey ?? game.date);
    const meta = dayByDateKey.get(dateKey) ?? { index: 1, label: "Day 1", dateLabel: formatScheduleDateLabel(dateKey) };
    return {
      ...game,
      gamedayKey: dateKey,
      gamedayLabel: meta.label,
      gamedayDateLabel: meta.dateLabel,
      gamedayIndex: meta.index,
      status: "upcoming",
      statusText: "",
      homeScore: null,
      awayScore: null
    };
  });

  const firstDay = dayByDateKey.get(dateKeys[0]) ?? { index: 1, label: "Day 1", dateLabel: formatScheduleDateLabel(dateKeys[0] ?? "") };
  return {
    ready: false,
    updatedAt: now,
    deadline: TRUE_PLAYOFF_DAY1_DEADLINE,
    gameweek: "Postseason",
    currentGameday: {
      key: dateKeys[0] ?? "",
      label: firstDay.label,
      dateLabel: firstDay.dateLabel,
      index: firstDay.index,
      gameweekNumber: 1,
      gamedayNumber: 1,
      deadline: TRUE_PLAYOFF_DAY1_DEADLINE
    },
    games
  };
}

for (const tableName of deleteOrder) {
  statements.push(`DELETE FROM ${tableName};`);
}

for (const tableName of insertOrder) {
  const columns = tableColumns[tableName];
  let rows = db.prepare(`SELECT ${columns.join(", ")} FROM ${tableName}`).all();
  if (tableName === "user_states") {
    rows = rows.map((row) => sanitizeUserStateRow(row));
  }
  if (tableName === "game_rules") {
    rows = rows.filter((row) => !["first_deadline", "weekly_free_transfers", "transfer_penalty"].includes(row.key));
  }
  for (const row of rows) {
    statements.push(buildInsert(tableName, columns, row));
  }
}

statements.push(
  buildInsert("game_rules", ["key", "value", "updated_at"], {
    key: "first_deadline",
    value: TRUE_PLAYOFF_DAY1_DEADLINE,
    updated_at: now
  })
);
statements.push(
  buildInsert("game_rules", ["key", "value", "updated_at"], {
    key: "weekly_free_transfers",
    value: "0",
    updated_at: now
  })
);
statements.push(
  buildInsert("game_rules", ["key", "value", "updated_at"], {
    key: "transfer_penalty",
    value: "50",
    updated_at: now
  })
);

const scheduleCache = sanitizeScheduleCache(readJsonIfExists(sourceScheduleCachePath, null));
if (scheduleCache) {
  statements.push(
    buildInsert(
      "app_state",
      ["key", "value", "updated_at"],
      {
        key: "live_schedule_cache",
        value: JSON.stringify(scheduleCache),
        updated_at: now
      }
    )
  );
}

const outputPath = writeSqlFile(outputRelativePath, statements);
console.log(`Exported local SQLite data to ${outputPath}`);
