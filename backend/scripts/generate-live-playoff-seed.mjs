import path from "path";
import { buildInsert, writeSqlFile } from "./sql-helpers.mjs";

const SCHEDULE_URL = "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/staticData/scheduleLeagueV2_1.json";
const BOX_SCORE_URL = "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/liveData/boxscore/boxscore_{gameId}.json";
const REQUEST_TIMEOUT_MS = Number(process.env.NBA_LIVE_TIMEOUT_MS ?? 12000);
const MAX_IMPORTED_GAMES = Number(process.env.PLAYOFF_IMPORT_MAX_GAMES ?? 40);
const IMPORT_CONCURRENCY = Number(process.env.PLAYOFF_IMPORT_CONCURRENCY ?? 12);
const outputRelativePath = path.join("tmp", "d1-seed.sql");

const GAMEDAYS_PER_WEEK = 7;

function buildHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*"
  };
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

function buildGamedayMeta(dayIndex) {
  const safeIndex = Math.max(1, Number(dayIndex) || 1);
  const gameweekNumber = Math.floor((safeIndex - 1) / GAMEDAYS_PER_WEEK) + 1;
  const gamedayNumber = ((safeIndex - 1) % GAMEDAYS_PER_WEEK) + 1;

  return {
    gamedayIndex: safeIndex,
    gameweekNumber,
    gamedayNumber,
    gamedayLabel: `Gameweek${gameweekNumber} Gameday${gamedayNumber}`
  };
}

function buildGamedayLookup(games, getDateKey) {
  const uniqueDateKeys = [...new Set(games.map((game) => getDateKey(game)).filter(Boolean))].sort();
  const lookup = new Map();

  uniqueDateKeys.forEach((dateKey, index) => {
    lookup.set(dateKey, {
      gamedayKey: dateKey,
      gamedayDateLabel: formatScheduleDateLabel(dateKey),
      ...buildGamedayMeta(index + 1)
    });
  });

  return lookup;
}

function annotateGamesWithGamedays(games, getDateKey) {
  const lookup = buildGamedayLookup(games, getDateKey);

  return games.map((game) => {
    const gamedayKey = getDateKey(game);
    const meta =
      lookup.get(gamedayKey) ??
      ({
        gamedayKey,
        gamedayDateLabel: formatScheduleDateLabel(gamedayKey),
        ...buildGamedayMeta(1)
      });

    return {
      ...game,
      ...meta
    };
  });
}

function findCurrentOrNextGameday(games) {
  if (!games.length) {
    return null;
  }

  const sortedGames = [...games].sort((left, right) => {
    const leftTime = new Date(left.date ?? left.gameDateTimeUTC ?? `${left.gamedayKey ?? ""}T00:00:00Z`).getTime();
    const rightTime = new Date(right.date ?? right.gameDateTimeUTC ?? `${right.gamedayKey ?? ""}T00:00:00Z`).getTime();
    return leftTime - rightTime;
  });

  const unfinishedGames = sortedGames.filter((game) => game.status !== "final");
  const sourceGames = unfinishedGames.length ? unfinishedGames : sortedGames;
  const currentKey = sourceGames[0]?.gamedayKey;

  return currentKey ? sortedGames.find((game) => game.gamedayKey === currentKey) ?? null : null;
}

function isPostseasonGameId(gameId) {
  const id = String(gameId ?? "");
  return id.startsWith("004") || id.startsWith("005");
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

const scheduleData = await fetchJson(SCHEDULE_URL);
const playoffGames = extractPlayoffGames(scheduleData);
const scheduleCache = buildScheduleCache(playoffGames);
const startedPlayoffGames = playoffGames.filter((game) => Number(game.gameStatus ?? 0) >= 2);
const recentStartedPlayoffGames = startedPlayoffGames
  .slice()
  .sort((left, right) => new Date(right.gameDateTimeUTC ?? 0).getTime() - new Date(left.gameDateTimeUTC ?? 0).getTime())
  .slice(0, MAX_IMPORTED_GAMES);

const boxscores = (
  await mapLimit(recentStartedPlayoffGames, IMPORT_CONCURRENCY, async (game) =>
    fetchJson(BOX_SCORE_URL.replace("{gameId}", String(game.gameId)), { tolerateMissing: true })
  )
)
  .filter(Boolean)
  .map((payload) => payload.game);

const now = new Date().toISOString();
const statements = [
  "DELETE FROM app_state WHERE key = 'live_schedule_cache';",
  "DELETE FROM game_rules WHERE key = 'first_deadline';"
];

if (scheduleCache.deadline) {
  statements.push(
    buildInsert("game_rules", ["key", "value", "updated_at"], {
      key: "first_deadline",
      value: String(scheduleCache.deadline),
      updated_at: now
    })
  );
}

if (!boxscores.length) {
  statements.push(
    buildInsert("app_state", ["key", "value", "updated_at"], {
      key: "live_schedule_cache",
      value: JSON.stringify(scheduleCache),
      updated_at: now
    })
  );
  const outputPath = writeSqlFile(outputRelativePath, statements);
  console.log("No playoff box scores available yet. Generated schedule-only seed.");
  console.log(`Seed file: ${outputPath}`);
  process.exit(0);
}

scheduleCache.ready = true;
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
      short_name: team.teamTricode,
      city: team.teamCity ?? null,
      conference: null,
      division: null,
      raw_json: JSON.stringify({
        id: Number(team.teamId),
        code: Number(team.teamId),
        name: `${team.teamCity} ${team.teamName}`.trim(),
        short_name: team.teamTricode
      }),
      updated_at: now
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
        first_name: player.firstName ?? "",
        second_name: player.familyName ?? player.name ?? "",
        web_name: player.name ?? [player.firstName, player.familyName].filter(Boolean).join(" ").trim(),
        known_name: player.nameI ?? "",
        team_id: Number(team.teamId),
        team_short_name: team.teamTricode,
        position_short: toPositionGroup(player.position),
        totalFantasyPoints: 0,
        lastFantasyPoints: 0,
        gamesPlayed: 0,
        points_scored: 0,
        rebounds: 0,
        assists: 0,
        blocks: 0,
        steals: 0,
        latestStatus: player.status ?? "ACTIVE",
        latestGameTimeUTC: game.gameTimeUTC ?? game.gameEt ?? null,
        raw: []
      };

      existing.team_id = Number(team.teamId);
      existing.team_short_name = team.teamTricode;
      existing.position_short = toPositionGroup(player.position);
      existing.totalFantasyPoints = Number((existing.totalFantasyPoints + fantasyPoints).toFixed(1));
      existing.gamesPlayed += Number(player.played === "1");
      existing.points_scored += Number(stats.points ?? 0);
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

statements.push("DELETE FROM players;");
statements.push("DELETE FROM element_types;");
statements.push("DELETE FROM teams;");

for (const team of teams.values()) {
  statements.push(buildInsert("teams", ["id", "code", "name", "short_name", "city", "conference", "division", "raw_json", "updated_at"], team));
}

statements.push(
  buildInsert("element_types", ["id", "plural_name", "singular_name", "short_name", "squad_select", "raw_json", "updated_at"], {
    id: 1,
    plural_name: "Back Court",
    singular_name: "Back Court",
    short_name: "BC",
    squad_select: 5,
    raw_json: JSON.stringify({ id: 1, shortName: "BC" }),
    updated_at: now
  })
);
statements.push(
  buildInsert("element_types", ["id", "plural_name", "singular_name", "short_name", "squad_select", "raw_json", "updated_at"], {
    id: 2,
    plural_name: "Front Court",
    singular_name: "Front Court",
    short_name: "FC",
    squad_select: 5,
    raw_json: JSON.stringify({ id: 2, shortName: "FC" }),
    updated_at: now
  })
);

for (const player of players.values()) {
  const averageFantasyPoints = player.gamesPlayed ? player.totalFantasyPoints / player.gamesPlayed : player.totalFantasyPoints;
  const salary = scaleSalary(averageFantasyPoints, minAverage, maxAverage);
  const positionShort = player.position_short === "BC" ? "BC" : "FC";

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
        code: player.code,
        first_name: player.first_name,
        second_name: player.second_name,
        web_name: player.web_name,
        known_name: player.known_name,
        team_id: player.team_id,
        team_short_name: player.team_short_name,
        element_type: positionShort === "BC" ? 1 : 2,
        position_short: positionShort,
        now_cost: Math.round(salary * 10),
        salary,
        total_points: Math.round(player.totalFantasyPoints * 10),
        event_points: Math.round(player.lastFantasyPoints * 10),
        points_per_game: Math.round(averageFantasyPoints * 10),
        selected_by_percent: 0,
        status: player.latestStatus,
        can_select: activeTeamIds.has(player.team_id) ? 1 : 0,
        can_transact: activeTeamIds.has(player.team_id) ? 1 : 0,
        news: "",
        points_scored: player.points_scored,
        rebounds: player.rebounds,
        assists: player.assists,
        blocks: player.blocks,
        steals: player.steals,
        raw_json: JSON.stringify(player.raw),
        updated_at: now
      }
    )
  );
}

statements.push(
  buildInsert("app_state", ["key", "value", "updated_at"], {
    key: "live_schedule_cache",
    value: JSON.stringify(scheduleCache),
    updated_at: now
  })
);
const outputPath = writeSqlFile(outputRelativePath, statements);
console.log(`Generated live playoff seed SQL at ${outputPath}`);
console.log(`Playoff games: ${playoffGames.length}, started games: ${startedPlayoffGames.length}, imported players: ${players.size}`);
