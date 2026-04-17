import path from "path";
import { buildInsert, writeSqlFile } from "./sql-helpers.mjs";

const DEFAULT_BOOTSTRAP_URL = "https://nbafantasy.nba.com/api/bootstrap-static/";
const bootstrapUrl = process.env.NBA_BOOTSTRAP_URL ?? DEFAULT_BOOTSTRAP_URL;
const outputRelativePath = path.join("tmp", "d1-seed.sql");
const TRUE_PLAYOFF_DAY1_DEADLINE = "2026-04-18T16:30:00Z";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBoolInt(value) {
  return value ? 1 : 0;
}

const response = await fetch(bootstrapUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch bootstrap data: ${response.status} ${response.statusText}`);
}

const data = await response.json();
const now = new Date().toISOString();
const statements = [
  "DELETE FROM players;",
  "DELETE FROM element_types;",
  "DELETE FROM teams;",
  "DELETE FROM game_rules;",
  "DELETE FROM app_state WHERE key = 'live_schedule_cache';"
];

for (const team of data.teams ?? []) {
  statements.push(
    buildInsert("teams", ["id", "code", "name", "short_name", "city", "conference", "division", "raw_json", "updated_at"], {
      id: team.id,
      code: team.code ?? null,
      name: team.name,
      short_name: team.short_name,
      city: team.city ?? null,
      conference: team.conference ?? null,
      division: team.division ?? null,
      raw_json: JSON.stringify(team),
      updated_at: now
    })
  );
}

for (const elementType of data.element_types ?? []) {
  statements.push(
    buildInsert("element_types", ["id", "plural_name", "singular_name", "short_name", "squad_select", "raw_json", "updated_at"], {
      id: elementType.id,
      plural_name: elementType.plural_name,
      singular_name: elementType.singular_name,
      short_name: elementType.singular_name_short,
      squad_select: elementType.squad_select,
      raw_json: JSON.stringify(elementType),
      updated_at: now
    })
  );
}

const teamsById = new Map((data.teams ?? []).map((team) => [team.id, team]));
const elementTypesById = new Map((data.element_types ?? []).map((elementType) => [elementType.id, elementType]));

for (const player of data.elements ?? []) {
  const team = teamsById.get(player.team);
  const elementType = elementTypesById.get(player.element_type);
  const status = player.status ?? "u";
  statements.push(
    buildInsert(
      "players",
      [
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
      {
        id: player.id,
        code: player.code ?? null,
        first_name: player.first_name ?? "",
        second_name: player.second_name ?? "",
        web_name: player.web_name ?? `${player.first_name ?? ""} ${player.second_name ?? ""}`.trim(),
        known_name: player.known_name ?? "",
        team_id: player.team,
        team_short_name: team?.short_name ?? String(player.team),
        element_type: player.element_type,
        position_short: elementType?.singular_name_short ?? String(player.element_type),
        now_cost: toNumber(player.now_cost),
        salary: toNumber(player.now_cost) / 10,
        total_points: toNumber(player.total_points),
        event_points: toNumber(player.event_points),
        points_per_game: toNumber(player.points_per_game),
        selected_by_percent: toNumber(player.selected_by_percent),
        status,
        // In this game, status only affects availability messaging; all statuses remain selectable.
        can_select: 1,
        can_transact: toBoolInt(player.can_transact),
        news: player.news ?? "",
        points_scored: toNumber(player.points_scored),
        rebounds: toNumber(player.rebounds),
        assists: toNumber(player.assists),
        blocks: toNumber(player.blocks),
        steals: toNumber(player.steals),
        raw_json: JSON.stringify(player),
        updated_at: now
      }
    )
  );
}

statements.push(
  buildInsert("game_rules", ["key", "value", "updated_at"], {
    key: "initial_budget",
    value: String(process.env.PLAYOFF_INITIAL_BUDGET ?? data.game_settings?.squad_budget ?? 100),
    updated_at: now
  })
);
statements.push(
  buildInsert("game_rules", ["key", "value", "updated_at"], {
    key: "weekly_free_transfers",
    value: String(process.env.PLAYOFF_WEEKLY_FREE_TRANSFERS ?? 0),
    updated_at: now
  })
);
statements.push(
  buildInsert("game_rules", ["key", "value", "updated_at"], {
    key: "first_deadline",
    value: String(process.env.PLAYOFF_FIRST_DEADLINE ?? TRUE_PLAYOFF_DAY1_DEADLINE),
    updated_at: now
  })
);
statements.push(
  buildInsert("game_rules", ["key", "value", "updated_at"], {
    key: "transfer_penalty",
    value: String(process.env.PLAYOFF_TRANSFER_PENALTY ?? 50),
    updated_at: now
  })
);

const outputPath = writeSqlFile(outputRelativePath, statements);
console.log(`Generated bootstrap seed SQL at ${outputPath}`);
console.log(`Source: ${bootstrapUrl}`);
