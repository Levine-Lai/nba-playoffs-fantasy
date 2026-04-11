import { db, dbPath, getRuleValue, setRuleValue } from "./db.js";

const DEFAULT_BOOTSTRAP_URL = "https://nbafantasy.nba.com/api/bootstrap-static/";
const bootstrapUrl = process.env.NBA_BOOTSTRAP_URL ?? DEFAULT_BOOTSTRAP_URL;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBoolInt(value) {
  return value ? 1 : 0;
}

function findNextDeadline(events = []) {
  const now = Date.now();
  const nextEvent = events.find((event) => new Date(event.deadline_time).getTime() > now);
  return nextEvent?.deadline_time ?? events[0]?.deadline_time ?? "2026-04-10T06:30:00Z";
}

async function main() {
  const response = await fetch(bootstrapUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch bootstrap data: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const now = new Date().toISOString();

  const importTx = db.transaction(() => {
    const upsertTeam = db.prepare(`
      INSERT INTO teams (id, code, name, short_name, city, conference, division, raw_json, updated_at)
      VALUES (@id, @code, @name, @shortName, @city, @conference, @division, @rawJson, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        name = excluded.name,
        short_name = excluded.short_name,
        city = excluded.city,
        conference = excluded.conference,
        division = excluded.division,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);

    const upsertElementType = db.prepare(`
      INSERT INTO element_types (id, plural_name, singular_name, short_name, squad_select, raw_json, updated_at)
      VALUES (@id, @pluralName, @singularName, @shortName, @squadSelect, @rawJson, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        plural_name = excluded.plural_name,
        singular_name = excluded.singular_name,
        short_name = excluded.short_name,
        squad_select = excluded.squad_select,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);

    const upsertPlayer = db.prepare(`
      INSERT INTO players (
        id, code, first_name, second_name, web_name, known_name, team_id, team_short_name,
        element_type, position_short, now_cost, salary, total_points, event_points,
        points_per_game, selected_by_percent, status, can_select, can_transact, news,
        points_scored, rebounds, assists, blocks, steals, raw_json, updated_at
      )
      VALUES (
        @id, @code, @firstName, @secondName, @webName, @knownName, @teamId, @teamShortName,
        @elementType, @positionShort, @nowCost, @salary, @totalPoints, @eventPoints,
        @pointsPerGame, @selectedByPercent, @status, @canSelect, @canTransact, @news,
        @pointsScored, @rebounds, @assists, @blocks, @steals, @rawJson, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        first_name = excluded.first_name,
        second_name = excluded.second_name,
        web_name = excluded.web_name,
        known_name = excluded.known_name,
        team_id = excluded.team_id,
        team_short_name = excluded.team_short_name,
        element_type = excluded.element_type,
        position_short = excluded.position_short,
        now_cost = excluded.now_cost,
        salary = excluded.salary,
        total_points = excluded.total_points,
        event_points = excluded.event_points,
        points_per_game = excluded.points_per_game,
        selected_by_percent = excluded.selected_by_percent,
        status = excluded.status,
        can_select = excluded.can_select,
        can_transact = excluded.can_transact,
        news = excluded.news,
        points_scored = excluded.points_scored,
        rebounds = excluded.rebounds,
        assists = excluded.assists,
        blocks = excluded.blocks,
        steals = excluded.steals,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);

    const teamsById = new Map();
    for (const team of data.teams ?? []) {
      teamsById.set(team.id, team);
      upsertTeam.run({
        id: team.id,
        code: team.code ?? null,
        name: team.name,
        shortName: team.short_name,
        city: team.city ?? null,
        conference: team.conference ?? null,
        division: team.division ?? null,
        rawJson: JSON.stringify(team),
        updatedAt: now
      });
    }

    const elementTypesById = new Map();
    for (const elementType of data.element_types ?? []) {
      elementTypesById.set(elementType.id, elementType);
      upsertElementType.run({
        id: elementType.id,
        pluralName: elementType.plural_name,
        singularName: elementType.singular_name,
        shortName: elementType.singular_name_short,
        squadSelect: elementType.squad_select,
        rawJson: JSON.stringify(elementType),
        updatedAt: now
      });
    }

    for (const player of data.elements ?? []) {
      const team = teamsById.get(player.team);
      const elementType = elementTypesById.get(player.element_type);
      upsertPlayer.run({
        id: player.id,
        code: player.code ?? null,
        firstName: player.first_name ?? "",
        secondName: player.second_name ?? "",
        webName: player.web_name ?? `${player.first_name ?? ""} ${player.second_name ?? ""}`.trim(),
        knownName: player.known_name ?? "",
        teamId: player.team,
        teamShortName: team?.short_name ?? String(player.team),
        elementType: player.element_type,
        positionShort: elementType?.singular_name_short ?? String(player.element_type),
        nowCost: toNumber(player.now_cost),
        salary: toNumber(player.now_cost) / 10,
        totalPoints: toNumber(player.total_points),
        eventPoints: toNumber(player.event_points),
        pointsPerGame: toNumber(player.points_per_game),
        selectedByPercent: toNumber(player.selected_by_percent),
        status: player.status ?? "u",
        canSelect: toBoolInt(player.can_select),
        canTransact: toBoolInt(player.can_transact),
        news: player.news ?? "",
        pointsScored: toNumber(player.points_scored),
        rebounds: toNumber(player.rebounds),
        assists: toNumber(player.assists),
        blocks: toNumber(player.blocks),
        steals: toNumber(player.steals),
        rawJson: JSON.stringify(player),
        updatedAt: now
      });
    }

    setRuleValue(
      "initial_budget",
      process.env.PLAYOFF_INITIAL_BUDGET ?? getRuleValue("initial_budget", data.game_settings?.squad_budget ?? 100)
    );
    setRuleValue("weekly_free_transfers", process.env.PLAYOFF_WEEKLY_FREE_TRANSFERS ?? getRuleValue("weekly_free_transfers", 2));
    setRuleValue("first_deadline", process.env.PLAYOFF_FIRST_DEADLINE ?? getRuleValue("first_deadline", findNextDeadline(data.events)));
  });

  importTx();

  console.log(`Imported ${data.elements?.length ?? 0} players into ${dbPath}`);
  console.log(`Source: ${bootstrapUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
