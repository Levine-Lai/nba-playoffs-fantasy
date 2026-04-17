import { GAMEWEEK, SCHEDULE } from "../shared/gameTemplate";
import {
  annotateGamesWithPlayoffPeriods,
  buildPlayoffPeriods,
  findEditablePlayoffPeriod,
  findScoringPlayoffPeriod,
  getPlayoffGameweekNumber,
  isPostseasonGameId,
  normalizeScheduleDateKey
} from "../shared/scheduleUtils";
import { calcFinalPoints } from "./gameplay";
import { buildNextMatchupByTeamFromCache, getStoredScheduleCache, toTeamAsset } from "./store";
import type {
  EditablePeriodContext,
  Env,
  GameweekPayload,
  LeaguePhaseOption,
  NextMatchup,
  Player,
  PlayerScheduleCell,
  StoredScheduleCache,
  StoredScheduleGame,
  TeamAsset,
  TransferWindowContext,
  UserState
} from "./types";

const LIVE_SCHEDULE_URL = "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/staticData/scheduleLeagueV2_1.json";
const LIVE_BOX_SCORE_URL = "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/liveData/boxscore/boxscore_{gameId}.json";
const LIVE_REQUEST_TIMEOUT_MS = 8000;
const LIVE_SCHEDULE_TTL_MS = 60 * 1000;
const LIVE_BOX_TTL_MS = 20 * 1000;

const TEAM_CODES_BY_NAME: Record<string, string> = {
  "Atlanta Hawks": "1610612737",
  "Boston Celtics": "1610612738",
  "Brooklyn Nets": "1610612751",
  "Charlotte Hornets": "1610612766",
  "Chicago Bulls": "1610612741",
  "Cleveland Cavaliers": "1610612739",
  "Dallas Mavericks": "1610612742",
  "Denver Nuggets": "1610612743",
  "Detroit Pistons": "1610612765",
  "Golden State Warriors": "1610612744",
  "Houston Rockets": "1610612745",
  "Indiana Pacers": "1610612754",
  "LA Clippers": "1610612746",
  "Los Angeles Lakers": "1610612747",
  "Memphis Grizzlies": "1610612763",
  "Miami Heat": "1610612748",
  "Milwaukee Bucks": "1610612749",
  "Minnesota Timberwolves": "1610612750",
  "New Orleans Pelicans": "1610612740",
  "New York Knicks": "1610612752",
  "Oklahoma City Thunder": "1610612760",
  "Orlando Magic": "1610612753",
  "Philadelphia 76ers": "1610612755",
  "Phoenix Suns": "1610612756",
  "Portland Trail Blazers": "1610612757",
  "Sacramento Kings": "1610612758",
  "San Antonio Spurs": "1610612759",
  "Toronto Raptors": "1610612761",
  "Utah Jazz": "1610612762",
  "Washington Wizards": "1610612764"
};

const liveHttpCache = new Map<string, { data: unknown; expiresAt: number }>();

type OfficialScheduleGame = {
  id: string;
  date: string;
  gamedayKey: string;
  tipoff: string;
  home: string;
  away: string;
  status: "upcoming" | "live" | "final";
  statusText: string;
  homeScore: number | null;
  awayScore: number | null;
  stageLabel: string;
  gamedayLabel?: string;
  gamedayDateLabel?: string;
  gamedayIndex?: number;
  gameweekNumber?: number;
  gamedayNumber?: number;
  homeTeam: TeamAsset | null;
  awayTeam: TeamAsset | null;
  homeTriCode: string;
  awayTriCode: string;
};

function buildLiveRequestHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*"
  };
}

async function fetchJsonWithCache<T>(url: string, ttlMs: number, options: { tolerateMissing?: boolean } = {}) {
  const now = Date.now();
  const cached = liveHttpCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: buildLiveRequestHeaders(),
      signal: controller.signal
    });

    if (!response.ok) {
      if (options.tolerateMissing && (response.status === 403 || response.status === 404)) {
        liveHttpCache.set(url, { data: null, expiresAt: now + ttlMs });
        return null as T;
      }

      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as T;
    liveHttpCache.set(url, { data, expiresAt: now + ttlMs });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function formatDateInTimeZone(dateInput: string | null | undefined, options: Intl.DateTimeFormatOptions, timeZone = "Asia/Shanghai") {
  const date = new Date(dateInput ?? "");
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...options
  }).format(date);
}

function formatTimeInTimeZone(dateInput: string | null | undefined, timeZone = "Asia/Shanghai") {
  return formatDateInTimeZone(
    dateInput,
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    },
    timeZone
  );
}

function normalizeLiveGameStatus(gameStatus: string | number | null | undefined) {
  const statusNumber = Number(gameStatus ?? 0);
  if (statusNumber >= 3) {
    return "final";
  }
  if (statusNumber >= 2) {
    return "live";
  }
  return "upcoming";
}

function toNullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPostseasonStageLabel(gameId: string) {
  const id = String(gameId ?? "");
  if (id.startsWith("005")) {
    return "Play-In Tournament";
  }

  if (id.startsWith("002")) {
    return "Regular Season Finale";
  }

  if (!id.startsWith("004") || id.length < 10) {
    return "NBA";
  }

  const seriesCode = Number(id.slice(5, 8));
  if (seriesCode >= 1 && seriesCode <= 8) {
    return "First Round";
  }
  if (seriesCode >= 21 && seriesCode <= 24) {
    return "Conference Semifinals";
  }
  if (seriesCode >= 31 && seriesCode <= 32) {
    return "Conference Finals";
  }
  if (seriesCode === 41) {
    return "NBA Finals";
  }

  return "NBA Playoffs";
}

function buildTeamAsset(name: string): TeamAsset {
  const code = TEAM_CODES_BY_NAME[name] ?? null;
  return {
    name,
    code,
    logoUrl: code ? `/nba/team-logos/${code}.png` : null,
    logoFallbackUrl: code ? `https://cdn.nba.com/logos/nba/${code}/global/L/logo.svg` : null
  };
}

async function getOfficialScheduleGames(env: Env) {
  const payload = await fetchJsonWithCache<{
    leagueSchedule?: { gameDates?: Array<{ games?: Array<Record<string, any>> }> };
  }>(LIVE_SCHEDULE_URL, LIVE_SCHEDULE_TTL_MS);
  const rawGames = payload?.leagueSchedule?.gameDates?.flatMap((gameDate) => gameDate.games ?? []) ?? [];
  const postseasonGames = rawGames.filter((game) => isPostseasonGameId(String(game.gameId ?? "")));

  return annotateGamesWithPlayoffPeriods(
    postseasonGames
      .map((game) => {
        const homeTeam = toTeamAsset(game.homeTeam ?? {});
        const awayTeam = toTeamAsset(game.awayTeam ?? {});
        const date = (game.gameDateTimeUTC ?? game.gameDateEst ?? null) as string | null;
        const gamedayKey = normalizeScheduleDateKey(game.gameDateEst ?? date);

        return {
          id: String(game.gameId),
          date: date ?? "",
          gamedayKey,
          tipoff: formatTimeInTimeZone(date, env.LIVE_TIME_ZONE || "Asia/Shanghai"),
          home: homeTeam.name ?? "TBD",
          away: awayTeam.name ?? "TBD",
          status: normalizeLiveGameStatus(game.gameStatus),
          statusText: String(game.gameStatusText ?? ""),
          homeScore: toNullableNumber(game.homeTeam?.score ?? game.homeTeam?.points),
          awayScore: toNullableNumber(game.awayTeam?.score ?? game.awayTeam?.points),
          stageLabel: getPostseasonStageLabel(String(game.gameId)),
          homeTeam,
          awayTeam,
          homeTriCode: homeTeam.triCode ?? "",
          awayTriCode: awayTeam.triCode ?? ""
        };
      })
      .filter((game) => game.date && game.gamedayKey),
    (game) => game.gamedayKey,
    (game) => game.id
  ) as OfficialScheduleGame[];
}

function getPlayoffPeriodsFromGames(games: OfficialScheduleGame[]) {
  return buildPlayoffPeriods(
    games,
    (game) => game.gamedayKey ?? normalizeScheduleDateKey(game.date),
    (game) => game.id
  );
}

function formatDeadlineLabel(deadline: string, timeZone: string) {
  return formatDateInTimeZone(
    deadline,
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    },
    timeZone
  );
}

function addDaysToDateKey(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildScheduleWindowDateKeys(startDateKey: string, totalDays = 5) {
  return Array.from({ length: totalDays }, (_, index) => addDaysToDateKey(startDateKey, index)).filter(Boolean);
}

function buildUpcomingScheduleByGames(
  games: OfficialScheduleGame[],
  editablePeriod: ReturnType<typeof findEditablePlayoffPeriod>
) {
  const scheduleByTeam = new Map<string, PlayerScheduleCell[]>();

  if (!editablePeriod?.gamedayKey) {
    return scheduleByTeam;
  }

  const dateKeys = buildScheduleWindowDateKeys(editablePeriod.gamedayKey, 5);
  const dateIndexByKey = new Map(dateKeys.map((dateKey, index) => [dateKey, index]));

  const ensureTeamSchedule = (teamCode: string) => {
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

  for (const game of games) {
    const dateKey = game.gamedayKey ?? normalizeScheduleDateKey(game.date);
    const targetIndex = dateIndexByKey.get(dateKey);
    const homeCode = String(game.homeTeam?.code ?? "");
    const awayCode = String(game.awayTeam?.code ?? "");

    if (targetIndex === undefined || !homeCode || !awayCode) {
      continue;
    }

    const homeSchedule = ensureTeamSchedule(homeCode);
    const awaySchedule = ensureTeamSchedule(awayCode);

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
  }

  return scheduleByTeam;
}

function getScheduleDeadline(games: OfficialScheduleGame[], timeZone: string) {
  const periods = getPlayoffPeriodsFromGames(games);
  const editable = findEditablePlayoffPeriod(periods);
  const fallback = periods[0] ?? null;
  return formatDeadlineLabel(editable?.deadline ?? fallback?.deadline ?? "", timeZone);
}

function buildNextMatchupByGames(games: OfficialScheduleGame[]) {
  const lookup = new Map<string, NextMatchup>();
  const periods = getPlayoffPeriodsFromGames(games);
  const editablePeriod = findEditablePlayoffPeriod(periods);
  const upcomingScheduleByTeam = buildUpcomingScheduleByGames(games, editablePeriod);

  if (!editablePeriod) {
    return lookup;
  }

  games
    .filter(
      (game) =>
        (game.gamedayKey ?? normalizeScheduleDateKey(game.date)) === editablePeriod.gamedayKey &&
        game.status !== "final"
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
          upcomingSchedule: upcomingScheduleByTeam.get(String(homeTeam.code)) ?? []
        });
      }

      if (awayTeam?.code && homeTeam && !lookup.has(String(awayTeam.code))) {
        lookup.set(String(awayTeam.code), {
          opponent: homeTeam,
          gamedayLabel: game.gamedayLabel ?? null,
          tipoff: game.tipoff ?? null,
          upcomingSchedule: upcomingScheduleByTeam.get(String(awayTeam.code)) ?? []
        });
      }
    });

  for (const [teamCode, upcomingSchedule] of upcomingScheduleByTeam.entries()) {
    if (lookup.has(teamCode)) {
      continue;
    }

    const firstScheduledCell = upcomingSchedule.find((cell) => cell.hasGame) ?? null;
    lookup.set(teamCode, {
      opponent: {
        name: "",
        triCode: "",
        logoUrl: null,
        logoFallbackUrl: null
      },
      gamedayLabel: null,
      tipoff: null,
      upcomingSchedule
    });
  }

  return lookup;
}

export async function getNextMatchupByTeam(env: Env) {
  try {
    const games = await getOfficialScheduleGames(env);
    if (games.length) {
      return buildNextMatchupByGames(games);
    }
  } catch {
    // Fall back to stored cache below.
  }

  const storedCache = await getStoredScheduleCache(env);
  return buildNextMatchupByTeamFromCache(storedCache);
}

async function getOfficialSlateContext(env: Env) {
  const games = await getOfficialScheduleGames(env);
  const periods = getPlayoffPeriodsFromGames(games);
  const scoringPeriod = findScoringPlayoffPeriod(periods);

  if (!scoringPeriod) {
    return null;
  }

  const slateGames = games
    .filter(
      (game) => (game.gamedayKey ?? normalizeScheduleDateKey(game.date)) === scoringPeriod.gamedayKey
    )
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  if (!slateGames.length) {
    return null;
  }

  return {
    periodKey: scoringPeriod.key,
    gamedayLabel: scoringPeriod.label,
    gamedayIndex: scoringPeriod.gamedayIndex,
    deadlineLabel: formatDeadlineLabel(scoringPeriod.deadline, env.LIVE_TIME_ZONE || "Asia/Shanghai"),
    roundNumber: scoringPeriod.roundNumber,
    dayNumber: scoringPeriod.dayNumber,
    games: slateGames
  };
}

async function getOfficialBoxScore(gameId: string) {
  return fetchJsonWithCache<{ game?: Record<string, any> } | null>(
    LIVE_BOX_SCORE_URL.replace("{gameId}", String(gameId)),
    LIVE_BOX_TTL_MS,
    { tolerateMissing: true }
  );
}

async function fillScheduleScores(games: OfficialScheduleGame[]) {
  const targets = games.filter((game) => game.status !== "upcoming" && (game.homeScore === null || game.awayScore === null));
  if (!targets.length) {
    return games;
  }

  const scoreEntries = await Promise.all(
    targets.map(async (game) => {
      const payload = await getOfficialBoxScore(game.id).catch(() => null);
      const officialGame = payload?.game;
      if (!officialGame) {
        return null;
      }

      return [
        game.id,
        {
          homeScore: toNullableNumber(officialGame.homeTeam?.score),
          awayScore: toNullableNumber(officialGame.awayTeam?.score),
          statusText: String(officialGame.gameStatusText ?? game.statusText)
        }
      ] as const;
    })
  );

  const scoreMap = new Map(scoreEntries.filter(Boolean) as Array<readonly [string, { homeScore: number | null; awayScore: number | null; statusText: string }]>);

  return games.map((game) => {
    const scores = scoreMap.get(game.id);
    if (!scores) {
      return game;
    }

    return {
      ...game,
      homeScore: scores.homeScore ?? game.homeScore,
      awayScore: scores.awayScore ?? game.awayScore,
      statusText: scores.statusText ?? game.statusText
    };
  });
}

export async function getOfficialScheduleTimeline(env: Env) {
  const games = await getOfficialScheduleGames(env);

  if (!games.length) {
    return null;
  }

  const hydratedGames = await fillScheduleScores(
    games.slice().sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
  );
  return {
    gameweek: "Postseason",
    deadline: getScheduleDeadline(hydratedGames, env.LIVE_TIME_ZONE || "Asia/Shanghai"),
    games: hydratedGames
  };
}

function formatDateTimeLabel(dateInput: string | null | undefined) {
  const date = new Date(dateInput ?? "");
  if (!Number.isFinite(date.getTime())) {
    return String(dateInput ?? "");
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildEditableContextFromGames(
  games: Array<{ id: string; date: string; gamedayKey?: string | null }>,
  fallbackDeadline: string
): EditablePeriodContext {
  const periods = buildPlayoffPeriods(
    games,
    (game) => game.gamedayKey ?? normalizeScheduleDateKey(game.date),
    (game) => game.id
  );
  const editablePeriod = findEditablePlayoffPeriod(periods);

  if (!editablePeriod) {
    const beforeCompetitionStart = Date.now() < new Date(fallbackDeadline).getTime();
    return {
      gameweek: {
        ...GAMEWEEK,
        deadline: fallbackDeadline
      },
      transferWindow: {
        key: "day:2026-04-10",
        label: "Day 1",
        limit: 0,
        mode: beforeCompetitionStart ? "LIMITLESS" : "LIMITED"
      } satisfies TransferWindowContext,
      beforeCompetitionStart,
      period: {
        key: "day:2026-04-10",
        label: "Day 1",
        roundNumber: 1,
        dayNumber: 1,
        deadline: fallbackDeadline,
        gamedayIndex: GAMEWEEK.id,
        gamedayKey: "2026-04-10"
      }
    };
  }

  const firstPeriod = periods[0] ?? editablePeriod;
  const beforeCompetitionStart = Date.now() < new Date(firstPeriod.deadline).getTime();

  return {
    gameweek: {
      id: editablePeriod.gamedayIndex,
      label: editablePeriod.label,
      deadline: editablePeriod.deadline
    },
    transferWindow: {
      key: editablePeriod.transferWindowKey,
      label: editablePeriod.label,
      limit: editablePeriod.transferLimit,
      mode: beforeCompetitionStart ? "LIMITLESS" : "LIMITED"
    } satisfies TransferWindowContext,
    beforeCompetitionStart,
    period: {
      key: editablePeriod.key,
      label: editablePeriod.label,
      roundNumber: editablePeriod.roundNumber,
      dayNumber: editablePeriod.dayNumber,
      deadline: editablePeriod.deadline,
      gamedayIndex: editablePeriod.gamedayIndex,
      gamedayKey: editablePeriod.gamedayKey
    }
  };
}

export async function getEditablePeriodContext(env: Env, fallbackDeadline: string): Promise<EditablePeriodContext> {
  try {
    const officialGames = await getOfficialScheduleGames(env);
    if (officialGames.length) {
      return buildEditableContextFromGames(
        officialGames.map((game) => ({
          id: game.id,
          date: game.date,
          gamedayKey: game.gamedayKey
        })),
        fallbackDeadline
      );
    }
  } catch {
    // Fall back to stored cache below.
  }

  const cachedSchedule = await getStoredScheduleCache(env);
  const cachedGames = Array.isArray(cachedSchedule?.games) ? cachedSchedule.games : [];
  return buildEditableContextFromGames(
    cachedGames.map((game) => ({
      id: game.id,
      date: game.date,
      gamedayKey: game.gamedayKey
    })),
    fallbackDeadline
  );
}

export async function getScoringPeriodContext(env: Env) {
  try {
    const officialGames = await getOfficialScheduleGames(env);
    if (officialGames.length) {
      return findScoringPlayoffPeriod(
        buildPlayoffPeriods(
          officialGames,
          (game) => game.gamedayKey ?? normalizeScheduleDateKey(game.date),
          (game) => game.id
        )
      );
    }
  } catch {
    // Fall back to stored cache below.
  }

  const cachedSchedule = await getStoredScheduleCache(env);
  const cachedGames = Array.isArray(cachedSchedule?.games) ? cachedSchedule.games : [];
  const scoringPeriod = findScoringPlayoffPeriod(
    buildPlayoffPeriods(
      cachedGames,
      (game) => game.gamedayKey ?? normalizeScheduleDateKey(game.date),
      (game) => game.id
    )
  );

  return scoringPeriod;
}

function buildLeaguePhaseOptionsFromGames(
  games: Array<{ id: string; date: string; gamedayKey?: string | null }>
): LeaguePhaseOption[] {
  const periods = buildPlayoffPeriods(
    games,
    (game) => game.gamedayKey ?? normalizeScheduleDateKey(game.date),
    (game) => game.id
  );

  return [
    { key: "overall", label: "Overall" },
    ...periods.map((period) => ({
      key: `day-${period.dayNumber}`,
      label: period.label
    }))
  ];
}

export async function getLeaguePhaseOptionsByDay(env: Env): Promise<LeaguePhaseOption[]> {
  try {
    const officialGames = await getOfficialScheduleGames(env);
    if (officialGames.length) {
      return buildLeaguePhaseOptionsFromGames(
        officialGames.map((game) => ({
          id: game.id,
          date: game.date,
          gamedayKey: game.gamedayKey
        }))
      );
    }
  } catch {
    // Fall back to stored cache below.
  }

  const cachedSchedule = await getStoredScheduleCache(env);
  const cachedGames = Array.isArray(cachedSchedule?.games) ? cachedSchedule.games : [];
  return buildLeaguePhaseOptionsFromGames(
    cachedGames.map((game) => ({
      id: game.id,
      date: game.date,
      gamedayKey: game.gamedayKey
    }))
  );
}

export async function getGameweekPayload(env: Env, firstDeadline: string): Promise<GameweekPayload> {
  return (await getEditablePeriodContext(env, firstDeadline)).gameweek;
}

export async function buildSchedulePayload(env: Env) {
  const liveCache = await getStoredScheduleCache(env);
  if (Array.isArray(liveCache?.games) && liveCache.games.length) {
    const annotatedGames = annotateGamesWithPlayoffPeriods(
      liveCache.games.map((game) => ({
        ...game,
        gamedayKey: game.gamedayKey ?? normalizeScheduleDateKey(game.date)
      })),
      (game) => game.gamedayKey ?? normalizeScheduleDateKey(game.date),
      (game) => game.id
    );
    return {
      gameweek: "Postseason",
      deadline: getScheduleDeadline(annotatedGames as OfficialScheduleGame[], env.LIVE_TIME_ZONE || "Asia/Shanghai"),
      games: annotatedGames.map((game) => ({
        ...game,
        homeTeam: game.homeTeam ?? undefined,
        awayTeam: game.awayTeam ?? undefined
      }))
    };
  }

  return {
    ...SCHEDULE,
      gameweek: "Postseason",
      games: SCHEDULE.games.map((game) => ({
        ...game,
        gamedayKey: game.date,
        gamedayLabel: "Day 1",
        gamedayDateLabel: new Date(game.date).toDateString(),
        gamedayIndex: 1,
        homeTeam: buildTeamAsset(game.home),
      awayTeam: buildTeamAsset(game.away)
    }))
  };
}

function calculateFantasyPointsFromBoxScore(statistics: Record<string, unknown> = {}) {
  const points = Number(statistics.points ?? 0);
  const rebounds = Number(statistics.reboundsTotal ?? 0);
  const assists = Number(statistics.assists ?? 0);
  const steals = Number(statistics.steals ?? 0);
  const blocks = Number(statistics.blocks ?? 0);
  const turnovers = Number(statistics.turnovers ?? 0);

  return Number((points + rebounds * 1.2 + assists * 1.5 + steals * 3 + blocks * 3 - turnovers).toFixed(1));
}

function buildUpcomingSlateCells(game: OfficialScheduleGame | undefined) {
  if (!game) {
    return ["-", "-", "-", "-"];
  }

  return [game.tipoff || "-", game.status === "upcoming" ? "PRE" : game.status.toUpperCase(), "-", "-"];
}

async function buildFantasyPointsPreviewForSlate(
  state: UserState,
  slate: {
    periodKey: string;
    gamedayLabel: string;
    gamedayIndex: number;
    deadlineLabel: string;
    roundNumber?: number;
    dayNumber?: number;
    games: OfficialScheduleGame[];
  },
  beforeFirstDeadline: boolean
) {
  if (!slate?.games?.length) {
    return null;
  }

  const roster = [...state.starters, ...state.bench];
  const gamesByTeam = new Map<string, OfficialScheduleGame>();
  slate.games.forEach((game) => {
    if (game.homeTriCode) {
      gamesByTeam.set(game.homeTriCode, game);
    }
    if (game.awayTriCode) {
      gamesByTeam.set(game.awayTriCode, game);
    }
  });

  const relevantGameIds = [
    ...new Set(
      roster
        .map((player) => gamesByTeam.get(player.team))
        .filter((game): game is OfficialScheduleGame => Boolean(game && game.status !== "upcoming"))
        .map((game) => game.id)
    )
  ];

  const boxScores = await Promise.all(
    relevantGameIds.map(async (gameId) => {
      const payload = await getOfficialBoxScore(gameId);
      return payload?.game ? [String(gameId), payload.game] : null;
    })
  );

  const boxScoreEntries = boxScores.filter(
    (value): value is [string, Record<string, any>] => Array.isArray(value) && value.length === 2
  );
  const boxScoreByGameId = new Map(boxScoreEntries);

  const hydratePlayer = (player: Player) => {
    const game = gamesByTeam.get(player.team);
    const opponent = game?.homeTriCode === player.team ? game?.awayTriCode || "TBD" : game?.homeTriCode || "TBD";

    let livePoints = 0;
    if (game && game.status !== "upcoming") {
      const boxScore = boxScoreByGameId.get(String(game.id));
      const officialPlayerId = Number(player.code ?? 0);

      if (boxScore && Number.isFinite(officialPlayerId) && officialPlayerId > 0) {
        const candidates = [...(boxScore.homeTeam?.players ?? []), ...(boxScore.awayTeam?.players ?? [])];
        const officialPlayer = candidates.find((candidate) => Number(candidate.personId) === officialPlayerId);
        if (officialPlayer) {
          livePoints = calculateFantasyPointsFromBoxScore(officialPlayer.statistics ?? {});
        }
      }
    }

    return {
      ...player,
      points: livePoints,
      pointsWindowKey: game ? slate.periodKey : null,
      nextOpponent: opponent,
      upcoming: buildUpcomingSlateCells(game)
    };
  };

  const starters = state.starters.map(hydratePlayer);
  const bench = state.bench.map(hydratePlayer);
  const finalPoints = calcFinalPoints({
    ...state,
    starters,
    bench
  });

  return {
    visible: true,
    message: beforeFirstDeadline ? "Live points preview from official NBA data." : undefined,
    gameweek: {
      id: slate.gamedayIndex ?? GAMEWEEK.id,
      label: slate.gamedayLabel ?? GAMEWEEK.label,
      deadline: slate.deadlineLabel
    },
    summary: {
      final: finalPoints
    },
    lineup: {
      starters,
      bench,
      captainId: state.captainId
    },
    finalPoints,
    period: {
      key: slate.periodKey,
      label: slate.gamedayLabel,
      gamedayIndex: slate.gamedayIndex,
      roundNumber: Number(slate.roundNumber ?? 0),
      dayNumber: Number(slate.dayNumber ?? 0)
    }
  };
}

export async function buildOfficialLivePointsPreview(
  env: Env,
  state: UserState,
  beforeFirstDeadline: boolean
) {
  const slate = await getOfficialSlateContext(env);
  if (!slate) {
    return null;
  }

  return buildFantasyPointsPreviewForSlate(state, slate, beforeFirstDeadline);
}

export async function getOfficialPlayoffPeriods(env: Env) {
  const games = await getOfficialScheduleGames(env);
  return getPlayoffPeriodsFromGames(games);
}

export async function getOfficialPlayoffPeriodByPhaseKey(env: Env, phaseKey: string | null | undefined) {
  const dayMatch = String(phaseKey ?? "").match(/^day-(\d+)$/);
  if (!dayMatch) {
    return null;
  }

  const targetDay = Number(dayMatch[1]);
  const periods = await getOfficialPlayoffPeriods(env);
  return periods.find((period) => period.dayNumber === targetDay) ?? null;
}

export async function buildOfficialPointsPreviewForPeriod(
  env: Env,
  state: UserState,
  periodKey: string,
  beforeFirstDeadline: boolean
) {
  const games = await getOfficialScheduleGames(env);
  const periods = getPlayoffPeriodsFromGames(games);
  const targetPeriod = periods.find((period) => period.key === periodKey) ?? null;
  if (!targetPeriod) {
    return null;
  }

  const slateGames = games
    .filter((game) => (game.gamedayKey ?? normalizeScheduleDateKey(game.date)) === targetPeriod.gamedayKey)
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  if (!slateGames.length) {
    return null;
  }

  return buildFantasyPointsPreviewForSlate(
    state,
    {
      periodKey: targetPeriod.key,
      gamedayLabel: targetPeriod.label,
      gamedayIndex: targetPeriod.gamedayIndex,
      deadlineLabel: formatDeadlineLabel(targetPeriod.deadline, env.LIVE_TIME_ZONE || "Asia/Shanghai"),
      roundNumber: targetPeriod.roundNumber,
      dayNumber: targetPeriod.dayNumber,
      games: slateGames
    },
    beforeFirstDeadline
  );
}

export async function buildOfficialStartedPeriodSummaries(
  env: Env,
  state: UserState,
  override?: {
    periodKey: string;
    state: UserState;
  }
) {
  const games = await getOfficialScheduleGames(env);
  const periods = getPlayoffPeriodsFromGames(games).filter((period) => new Date(period.deadline).getTime() <= Date.now());
  const timeZone = env.LIVE_TIME_ZONE || "Asia/Shanghai";

  const summaries = [];
  for (const period of periods) {
    const slateGames = games
      .filter(
        (game) => (game.gamedayKey ?? normalizeScheduleDateKey(game.date)) === period.gamedayKey
      )
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

    const preview = await buildFantasyPointsPreviewForSlate(
      override?.periodKey === period.key ? override.state : state,
      {
        periodKey: period.key,
        gamedayLabel: period.label,
        gamedayIndex: period.gamedayIndex,
        deadlineLabel: formatDeadlineLabel(period.deadline, timeZone),
        roundNumber: period.roundNumber,
        dayNumber: period.dayNumber,
        games: slateGames
      },
      false
    );

    if (preview) {
      summaries.push({
        key: period.key,
        label: period.label,
        deadline: period.deadline,
        gamedayIndex: period.gamedayIndex,
        roundNumber: period.roundNumber,
        dayNumber: period.dayNumber,
        finalPoints: preview.finalPoints
      });
    }
  }

  return summaries;
}

export async function buildStoredScheduleSeedPayload(cache: StoredScheduleCache | null) {
  return cache;
}
