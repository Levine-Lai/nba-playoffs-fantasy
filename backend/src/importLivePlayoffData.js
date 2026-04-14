import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, dbPath, getRuleValue, setRuleValue } from "./db.js";
import {
  annotateGamesWithGamedays,
  findCurrentOrNextGameday,
  isPostseasonGameId,
  normalizeScheduleDateKey
} from "./scheduleUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
const scheduleCachePath = path.join(dataDir, "live-schedule-cache.json");

const SCHEDULE_URL = "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/staticData/scheduleLeagueV2_1.json";
const BOX_SCORE_URL = "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/liveData/boxscore/boxscore_{gameId}.json";
const REQUEST_TIMEOUT_MS = Number(process.env.NBA_LIVE_TIMEOUT_MS ?? 12000);
const MAX_IMPORTED_GAMES = Number(process.env.PLAYOFF_IMPORT_MAX_GAMES ?? 40);
const IMPORT_CONCURRENCY = Number(process.env.PLAYOFF_IMPORT_CONCURRENCY ?? 12);

function buildHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*"
  };
}

async function fetchJson(url, { tolerateMissing = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: buildHeaders(),
    signal: controller.signal
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    if (tolerateMissing && (response.status === 403 || response.status === 404)) {
      return null;
    }

    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function formatTipoff(dateInput) {
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function toFantasyPoints(statistics = {}) {
  const points = Number(statistics.points ?? 0);
  const rebounds = Number(statistics.reboundsTotal ?? 0);
  const assists = Number(statistics.assists ?? 0);
  const steals = Number(statistics.steals ?? 0);
  const blocks = Number(statistics.blocks ?? 0);
  const turnovers = Number(statistics.turnovers ?? 0);

  return Number((points + rebounds * 1.2 + assists * 1.5 + steals * 3 + blocks * 3 - turnovers).toFixed(1));
}

function toPositionGroup(position = "") {
  const normalized = String(position).toUpperCase();
  return normalized.includes("G") ? "BC" : "FC";
}

function scaleSalary(average, minAverage, maxAverage) {
  if (!Number.isFinite(average)) {
    return 4.5;
  }

  if (maxAverage <= minAverage) {
    return 10;
  }

  const normalized = (average - minAverage) / (maxAverage - minAverage);
  const salary = 4.5 + normalized * (23 - 4.5);
  return Number(Math.min(23, Math.max(4.5, salary)).toFixed(1));
}

async function mapLimit(items, limit, iteratee) {
  const results = [];
  const queue = [...items];

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) {
        return;
      }

      results.push(await iteratee(item));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return results;
}

function buildScheduleCache(playoffGames) {
  const annotatedGames = annotateGamesWithGamedays(
    playoffGames
      .map((game) => ({
        ...game,
        date: game.gameDateTimeUTC ?? game.gameDateEst ?? "",
        status: game.gameStatus === 3 ? "final" : game.gameStatus === 2 ? "live" : "upcoming"
      }))
      .filter((game) => normalizeScheduleDateKey(game.gameDateEst ?? game.scheduleDate ?? game.date)),
    (game) => normalizeScheduleDateKey(game.gameDateEst ?? game.scheduleDate ?? game.date)
  );

  const currentGameday = findCurrentOrNextGameday(annotatedGames);
  const currentGamedayIndex = currentGameday?.gamedayIndex ?? 1;
  const nextGames = annotatedGames
    .filter((game) => game.gamedayIndex >= currentGamedayIndex)
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
    .map((game) => ({
      id: String(game.gameId),
      date: game.gameDateTimeUTC ?? game.gameDateEst ?? "",
      tipoff: formatTipoff(game.gameDateTimeUTC ?? game.gameDateEst ?? ""),
      gamedayKey: game.gamedayKey,
      gamedayLabel: game.gamedayLabel,
      gamedayDateLabel: game.gamedayDateLabel,
      gamedayIndex: game.gamedayIndex,
      home: game.homeTeam?.teamName ? `${game.homeTeam.teamCity} ${game.homeTeam.teamName}` : "TBD",
      away: game.awayTeam?.teamName ? `${game.awayTeam.teamCity} ${game.awayTeam.teamName}` : "TBD",
      status: game.gameStatus === 3 ? "final" : game.gameStatus === 2 ? "live" : "upcoming",
      homeTeam: game.homeTeam?.teamId
        ? {
            name: `${game.homeTeam.teamCity} ${game.homeTeam.teamName}`,
            code: String(game.homeTeam.teamId),
            triCode: game.homeTeam.teamTricode ?? "",
            logoUrl: `/nba/team-logos/${game.homeTeam.teamId}.png`,
            logoFallbackUrl: `https://cdn.nba.com/logos/nba/${game.homeTeam.teamId}/global/L/logo.svg`
          }
        : null,
      awayTeam: game.awayTeam?.teamId
        ? {
            name: `${game.awayTeam.teamCity} ${game.awayTeam.teamName}`,
            code: String(game.awayTeam.teamId),
            triCode: game.awayTeam.teamTricode ?? "",
            logoUrl: `/nba/team-logos/${game.awayTeam.teamId}.png`,
            logoFallbackUrl: `https://cdn.nba.com/logos/nba/${game.awayTeam.teamId}/global/L/logo.svg`
          }
        : null
    }));

  const nextDeadline = nextGames[0]?.date ?? playoffGames.find((game) => Number(game.gameStatus) !== 3)?.gameDateTimeUTC ?? null;

  return {
    ready: false,
    updatedAt: new Date().toISOString(),
    deadline: nextDeadline,
    gameweek: currentGameday?.gamedayLabel ?? "Gameweek1 Gameday1",
    currentGameday: currentGameday
      ? {
          key: currentGameday.gamedayKey,
          label: currentGameday.gamedayLabel,
          dateLabel: currentGameday.gamedayDateLabel,
          index: currentGameday.gamedayIndex,
          gameweekNumber: currentGameday.gameweekNumber,
          gamedayNumber: currentGameday.gamedayNumber,
          deadline: nextDeadline
        }
      : null,
    games: nextGames
  };
}

function extractPlayoffGames(scheduleData) {
  return (scheduleData?.leagueSchedule?.gameDates ?? [])
    .flatMap((gameDate) => (gameDate.games ?? []).map((game) => ({ ...game, scheduleDate: gameDate.gameDate })))
    .filter((game) => isPostseasonGameId(game.gameId));
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });

  const scheduleData = await fetchJson(SCHEDULE_URL);
  const playoffGames = extractPlayoffGames(scheduleData);

  const scheduleCache = buildScheduleCache(playoffGames);
  fs.writeFileSync(scheduleCachePath, JSON.stringify(scheduleCache, null, 2));

  if (scheduleCache.deadline) {
    setRuleValue("first_deadline", scheduleCache.deadline);
  }

  const startedPlayoffGames = playoffGames.filter((game) => Number(game.gameStatus ?? 0) >= 2);
  const recentStartedPlayoffGames = startedPlayoffGames
    .slice()
    .sort((left, right) => new Date(right.gameDateTimeUTC ?? 0).getTime() - new Date(left.gameDateTimeUTC ?? 0).getTime())
    .slice(0, MAX_IMPORTED_GAMES);

  console.log(`Fetched playoff schedule with ${playoffGames.length} playoff games, ${startedPlayoffGames.length} started.`);
  console.log(`Importing up to ${recentStartedPlayoffGames.length} recent box scores.`);

  const boxscores = (
    await mapLimit(recentStartedPlayoffGames, IMPORT_CONCURRENCY, async (game) =>
      fetchJson(BOX_SCORE_URL.replace("{gameId}", String(game.gameId)), { tolerateMissing: true })
    )
  )
    .filter(Boolean)
    .map((payload) => payload.game);

  if (!boxscores.length) {
    console.log("No playoff box scores available yet. Schedule cache updated and existing player pool preserved.");
    console.log(`Schedule cache: ${scheduleCachePath}`);
    return;
  }

  scheduleCache.ready = true;
  fs.writeFileSync(scheduleCachePath, JSON.stringify(scheduleCache, null, 2));

  const teams = new Map();
  const players = new Map();
  const activeTeamIds = new Set(
    playoffGames
      .filter((game) => Number(game.gameStatus ?? 0) !== 3)
      .flatMap((game) => [game.homeTeam?.teamId, game.awayTeam?.teamId])
      .filter(Boolean)
      .map((value) => Number(value))
  );

  for (const game of boxscores) {
    for (const teamKey of ["homeTeam", "awayTeam"]) {
      const team = game[teamKey];
      if (!team?.teamId) {
        continue;
      }

      teams.set(Number(team.teamId), {
        id: Number(team.teamId),
        code: Number(team.teamId),
        name: `${team.teamCity} ${team.teamName}`.trim(),
        shortName: team.teamTricode,
        city: team.teamCity ?? null,
        conference: null,
        division: null
      });

      for (const player of team.players ?? []) {
        if (!player?.personId) {
          continue;
        }

        const stats = player.statistics ?? {};
        const fantasyPoints = toFantasyPoints(stats);
        const personId = Number(player.personId);
        const existing = players.get(personId) ?? {
          id: personId,
          code: personId,
          firstName: player.firstName ?? "",
          secondName: player.familyName ?? player.name ?? "",
          webName: player.name ?? [player.firstName, player.familyName].filter(Boolean).join(" ").trim(),
          knownName: player.nameI ?? "",
          teamId: Number(team.teamId),
          teamShortName: team.teamTricode,
          positionShort: toPositionGroup(player.position),
          totalFantasyPoints: 0,
          lastFantasyPoints: 0,
          gamesPlayed: 0,
          pointsScored: 0,
          rebounds: 0,
          assists: 0,
          blocks: 0,
          steals: 0,
          latestStatus: player.status ?? "ACTIVE",
          latestGameTimeUTC: game.gameTimeUTC ?? game.gameEt ?? null,
          raw: []
        };

        existing.teamId = Number(team.teamId);
        existing.teamShortName = team.teamTricode;
        existing.positionShort = toPositionGroup(player.position);
        existing.totalFantasyPoints = Number((existing.totalFantasyPoints + fantasyPoints).toFixed(1));
        existing.gamesPlayed += Number(player.played === "1");
        existing.pointsScored += Number(stats.points ?? 0);
        existing.rebounds += Number(stats.reboundsTotal ?? 0);
        existing.assists += Number(stats.assists ?? 0);
        existing.blocks += Number(stats.blocks ?? 0);
        existing.steals += Number(stats.steals ?? 0);
        existing.latestStatus = player.status ?? existing.latestStatus;
        existing.raw.push({
          gameId: game.gameId,
          teamId: team.teamId,
          statistics: stats
        });

        const gameTime = new Date(game.gameTimeUTC ?? game.gameEt ?? "").getTime();
        const existingLatest = new Date(existing.latestGameTimeUTC ?? 0).getTime();
        if (!Number.isFinite(existingLatest) || gameTime >= existingLatest) {
          existing.latestGameTimeUTC = game.gameTimeUTC ?? game.gameEt ?? null;
          existing.lastFantasyPoints = fantasyPoints;
        }

        players.set(personId, existing);
      }
    }
  }

  const averages = [...players.values()]
    .map((player) => (player.gamesPlayed ? player.totalFantasyPoints / player.gamesPlayed : player.totalFantasyPoints))
    .filter((value) => Number.isFinite(value));

  const minAverage = Math.min(...averages);
  const maxAverage = Math.max(...averages);
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

    db.prepare("DELETE FROM players").run();

    for (const team of teams.values()) {
      upsertTeam.run({
        ...team,
        rawJson: JSON.stringify(team),
        updatedAt: now
      });
    }

    upsertElementType.run({
      id: 1,
      pluralName: "Back Court",
      singularName: "Back Court",
      shortName: "BC",
      squadSelect: 5,
      rawJson: JSON.stringify({ id: 1, shortName: "BC" }),
      updatedAt: now
    });

    upsertElementType.run({
      id: 2,
      pluralName: "Front Court",
      singularName: "Front Court",
      shortName: "FC",
      squadSelect: 5,
      rawJson: JSON.stringify({ id: 2, shortName: "FC" }),
      updatedAt: now
    });

    for (const player of players.values()) {
      const averageFantasyPoints = player.gamesPlayed ? player.totalFantasyPoints / player.gamesPlayed : player.totalFantasyPoints;
      const salary = scaleSalary(averageFantasyPoints, minAverage, maxAverage);
      const positionShort = player.positionShort === "BC" ? "BC" : "FC";

      upsertPlayer.run({
        id: player.id,
        code: player.code,
        firstName: player.firstName,
        secondName: player.secondName,
        webName: player.webName,
        knownName: player.knownName,
        teamId: player.teamId,
        teamShortName: player.teamShortName,
        elementType: positionShort === "BC" ? 1 : 2,
        positionShort,
        nowCost: Math.round(salary * 10),
        salary,
        totalPoints: Math.round(player.totalFantasyPoints * 10),
        eventPoints: Math.round(player.lastFantasyPoints * 10),
        pointsPerGame: Math.round(averageFantasyPoints * 10),
        selectedByPercent: 0,
        status: player.latestStatus,
        canSelect: activeTeamIds.has(player.teamId) ? 1 : 0,
        canTransact: activeTeamIds.has(player.teamId) ? 1 : 0,
        news: "",
        pointsScored: player.pointsScored,
        rebounds: player.rebounds,
        assists: player.assists,
        blocks: player.blocks,
        steals: player.steals,
        rawJson: JSON.stringify(player.raw),
        updatedAt: now
      });
    }

    setRuleValue("initial_budget", getRuleValue("initial_budget", 100));
    setRuleValue("weekly_free_transfers", getRuleValue("weekly_free_transfers", 2));
  });

  importTx();

  console.log(`Imported ${players.size} playoff players into ${dbPath}`);
  console.log(`Schedule cache: ${scheduleCachePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
