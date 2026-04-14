import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { backendRoot, buildInsert, readJsonIfExists, writeSqlFile } from "./sql-helpers.mjs";

const sourceDbPath = path.join(backendRoot, "data", "playoff-fantasy.db");
const sourceScheduleCachePath = path.join(backendRoot, "data", "live-schedule-cache.json");
const outputRelativePath = path.join("tmp", "d1-seed.sql");

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

const statements = [
  "PRAGMA foreign_keys = OFF;",
  "BEGIN TRANSACTION;"
];

for (const tableName of deleteOrder) {
  statements.push(`DELETE FROM ${tableName};`);
}

statements.push("DELETE FROM sqlite_sequence WHERE name IN ('users', 'private_leagues');");

for (const tableName of insertOrder) {
  const columns = tableColumns[tableName];
  const rows = db.prepare(`SELECT ${columns.join(", ")} FROM ${tableName}`).all();
  for (const row of rows) {
    statements.push(buildInsert(tableName, columns, row));
  }
}

const scheduleCache = readJsonIfExists(sourceScheduleCachePath, null);
if (scheduleCache) {
  statements.push(
    buildInsert(
      "app_state",
      ["key", "value", "updated_at"],
      {
        key: "live_schedule_cache",
        value: JSON.stringify(scheduleCache),
        updated_at: new Date().toISOString()
      }
    )
  );
}

statements.push("COMMIT;");
statements.push("PRAGMA foreign_keys = ON;");

const outputPath = writeSqlFile(outputRelativePath, statements);
console.log(`Exported local SQLite data to ${outputPath}`);
