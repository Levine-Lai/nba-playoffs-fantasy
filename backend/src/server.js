import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import {
  registerUserTx,
  getUserByAccount,
  createSession,
  deleteSession,
  getAuthenticatedUserByToken,
  getStateForUser,
  saveStateForUser,
  dbPath,
  getPlayersByIds,
  searchPlayerPool,
  getPlayerDataSummary,
  getRuleValue,
  listPrivateLeaguesForUser,
  createPrivateLeague,
  joinPrivateLeague
} from "./db.js";
import {
  GAMEWEEK,
  POINTS_BASELINE,
  SCHEDULE,
  HELP_RULES
} from "./gameTemplate.js";
import {
  annotateGamesWithGamedays,
  findCurrentOrNextGameday,
  isPostseasonGameId,
  normalizeScheduleDateKey
} from "./scheduleUtils.js";

const app = express();
const PORT = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const liveScheduleCachePath = path.join(__dirname, "..", "data", "live-schedule-cache.json");
const LIVE_SCHEDULE_URL = "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/staticData/scheduleLeagueV2_1.json";
const LIVE_BOX_SCORE_URL = "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/liveData/boxscore/boxscore_{gameId}.json";
const LIVE_TIME_ZONE = "Asia/Shanghai";
const LIVE_REQUEST_TIMEOUT_MS = 8000;
const LIVE_PYTHON_TIMEOUT_MS = 30000;
const LIVE_SCHEDULE_TTL_MS = 60 * 1000;
const LIVE_BOX_TTL_MS = 20 * 1000;
const liveHttpCache = new Map();
const execFileAsync = promisify(execFile);
const PYTHON_FETCH_SCRIPT = `
import json
import sys
import urllib.error
import urllib.request

url = sys.argv[1]
tolerate_missing = sys.argv[2] == "1"

try:
    with urllib.request.urlopen(url, timeout=25) as response:
        payload = json.load(response)
except urllib.error.HTTPError as error:
    if tolerate_missing and error.code in (403, 404):
        print("null")
        raise SystemExit(0)
    raise

print(json.dumps(payload))
`.trim();

app.use(cors());
app.use(express.json());

function getInitialBudget() {
  return Number(getRuleValue("initial_budget", "100"));
}

function getWeeklyFreeTransfers() {
  return Number(getRuleValue("weekly_free_transfers", "2"));
}

function getFirstDeadline() {
  return getRuleValue("first_deadline", GAMEWEEK.deadline);
}

function isBeforeFirstDeadline() {
  const deadline = new Date(getFirstDeadline()).getTime();
  return Number.isFinite(deadline) ? Date.now() < deadline : false;
}

function getGameweekPayload() {
  const cachedSchedule = readLiveScheduleCache();
  if (cachedSchedule?.currentGameday?.label) {
    return {
      id: Number(cachedSchedule.currentGameday.index ?? GAMEWEEK.id),
      label: cachedSchedule.currentGameday.label,
      deadline: cachedSchedule.currentGameday.deadline ?? getFirstDeadline()
    };
  }

  return {
    ...GAMEWEEK,
    deadline: getFirstDeadline()
  };
}

function hasCreatedTeam(state) {
  return state.starters.length + state.bench.length === 10;
}

function getRosterPlayers(state) {
  return [...state.starters, ...state.bench];
}

function enrichRosterPlayers(players = []) {
  const freshPlayers = getPlayersByIds(players.map((player) => player.id));
  const freshById = new Map(freshPlayers.map((player) => [player.id, player]));

  return players.map((player) => {
    const fresh = freshById.get(String(player.id));
    if (!fresh) {
      return player;
    }

    return {
      ...player,
      ...fresh,
      nextOpponent: fresh.nextOpponent ?? player.nextOpponent,
      nextOpponentName: fresh.nextOpponentName ?? player.nextOpponentName,
      nextOpponentLogoUrl: fresh.nextOpponentLogoUrl ?? player.nextOpponentLogoUrl,
      nextOpponentLogoFallbackUrl: fresh.nextOpponentLogoFallbackUrl ?? player.nextOpponentLogoFallbackUrl,
      upcoming: fresh.upcoming?.length ? fresh.upcoming : player.upcoming
    };
  });
}

function hydrateStateAssets(state) {
  state.starters = enrichRosterPlayers(state.starters);
  state.bench = enrichRosterPlayers(state.bench);
  return state;
}

const TEAM_CODES_BY_NAME = {
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

function buildTeamAsset(name) {
  const code = TEAM_CODES_BY_NAME[name] ?? null;
  return {
    name,
    code,
    logoUrl: code ? `/nba/team-logos/${code}.png` : null,
    logoFallbackUrl: code ? `https://cdn.nba.com/logos/nba/${code}/global/L/logo.svg` : null
  };
}

function buildLiveRequestHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*"
  };
}

function readLiveScheduleCache() {
  if (!fs.existsSync(liveScheduleCachePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(liveScheduleCachePath, "utf-8"));
  } catch {
    return null;
  }
}

async function fetchJsonWithCache(url, ttlMs, { tolerateMissing = false } = {}) {
  const now = Date.now();
  const cached = liveHttpCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_REQUEST_TIMEOUT_MS);

  try {
    let data;

    try {
      const response = await fetch(url, {
        headers: buildLiveRequestHeaders(),
        signal: controller.signal
      });

      if (!response.ok) {
        if (tolerateMissing && (response.status === 403 || response.status === 404)) {
          data = null;
        } else {
          throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }
      } else {
        data = await response.json();
      }
    } catch {
      const result = await execFileAsync("python", ["-c", PYTHON_FETCH_SCRIPT, url, tolerateMissing ? "1" : "0"], {
        timeout: LIVE_PYTHON_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024
      });
      data = result.stdout.trim() ? JSON.parse(result.stdout) : null;
    }

    liveHttpCache.set(url, {
      data,
      expiresAt: now + ttlMs
    });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function formatDateInTimeZone(dateInput, options, timeZone = LIVE_TIME_ZONE) {
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...options
  }).format(date);
}

function formatTimeInTimeZone(dateInput, timeZone = LIVE_TIME_ZONE) {
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

function normalizeLiveGameStatus(gameStatus) {
  const statusNumber = Number(gameStatus ?? 0);
  if (statusNumber >= 3) {
    return "final";
  }
  if (statusNumber >= 2) {
    return "live";
  }
  return "upcoming";
}

function buildOfficialTeamAsset(team) {
  if (!team) {
    return null;
  }

  return {
    name: `${team.teamCity ?? ""} ${team.teamName ?? ""}`.trim() || team.teamTricode || "TBD",
    code: team.teamId ? String(team.teamId) : null,
    triCode: team.teamTricode ?? "",
    id: team.teamId ? Number(team.teamId) : null,
    logoUrl: team.teamId ? `/nba/team-logos/${team.teamId}.png` : null,
    logoFallbackUrl: team.teamId ? `https://cdn.nba.com/logos/nba/${team.teamId}/global/L/logo.svg` : null
  };
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPostseasonStageLabel(gameId) {
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

async function getOfficialScheduleGames() {
  const payload = await fetchJsonWithCache(LIVE_SCHEDULE_URL, LIVE_SCHEDULE_TTL_MS);
  const rawGames = payload?.leagueSchedule?.gameDates?.flatMap((gameDate) => gameDate.games ?? []) ?? [];

  const postseasonGames = rawGames.filter((game) => isPostseasonGameId(game.gameId));

  return annotateGamesWithGamedays(
    postseasonGames
    .map((game) => {
      const homeTeam = buildOfficialTeamAsset(game.homeTeam);
      const awayTeam = buildOfficialTeamAsset(game.awayTeam);
      const date = game.gameDateTimeUTC ?? game.gameDateEst ?? null;
      const gamedayKey = normalizeScheduleDateKey(game.gameDateEst ?? date);

      return {
        id: String(game.gameId),
        date,
        gamedayKey,
        tipoff: formatTimeInTimeZone(date),
        home: homeTeam?.name ?? "TBD",
        away: awayTeam?.name ?? "TBD",
        status: normalizeLiveGameStatus(game.gameStatus),
        statusText: game.gameStatusText ?? "",
        homeScore: toNullableNumber(game.homeTeam?.score ?? game.homeTeam?.points),
        awayScore: toNullableNumber(game.awayTeam?.score ?? game.awayTeam?.points),
        gameLabel: game.gameLabel ?? "",
        seriesText: game.seriesText ?? "",
        stageLabel: getPostseasonStageLabel(game.gameId),
        homeTeam,
        awayTeam,
        homeTriCode: homeTeam?.triCode ?? "",
        awayTriCode: awayTeam?.triCode ?? ""
      };
    })
    .filter((game) => game.date && game.gamedayKey),
    (game) => game.gamedayKey
  );
}

async function getOfficialSlateContext() {
  const games = await getOfficialScheduleGames();
  const currentGameday = findCurrentOrNextGameday(games);
  const slateDateKey = currentGameday?.gamedayKey ?? null;

  if (!slateDateKey) {
    return null;
  }

  const slateGames = games
    .filter((game) => game.gamedayKey === slateDateKey)
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  if (!slateGames.length) {
    return null;
  }

  return {
    slateDateKey,
    gamedayLabel: slateGames[0].gamedayLabel,
    gamedayIndex: slateGames[0].gamedayIndex,
    gamedayDateLabel: slateGames[0].gamedayDateLabel,
    deadlineLabel: formatDateInTimeZone(slateGames[0].date, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }),
    games: slateGames
  };
}

async function fillScheduleScores(games) {
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
          statusText: officialGame.gameStatusText ?? game.statusText
        }
      ];
    })
  );

  const scoreMap = new Map(scoreEntries.filter(Boolean));
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

async function getOfficialScheduleTimeline(referenceDate = new Date()) {
  const games = await getOfficialScheduleGames();
  const currentGameday = findCurrentOrNextGameday(games);

  if (!currentGameday) {
    return null;
  }

  const selectedGames = games
    .filter((game) => Number(game.gamedayIndex ?? 0) >= Number(currentGameday.gamedayIndex ?? 0))
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  if (!selectedGames.length) {
    return null;
  }

  const hydratedGames = await fillScheduleScores(selectedGames);

  return {
    gameweek: currentGameday.gamedayLabel,
    deadline: formatDateInTimeZone(hydratedGames[0].date, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }),
    games: hydratedGames
  };
}

async function getOfficialBoxScore(gameId) {
  return fetchJsonWithCache(LIVE_BOX_SCORE_URL.replace("{gameId}", String(gameId)), LIVE_BOX_TTL_MS, {
    tolerateMissing: true
  });
}

function calculateFantasyPointsFromBoxScore(statistics = {}) {
  const points = Number(statistics.points ?? 0);
  const rebounds = Number(statistics.reboundsTotal ?? 0);
  const assists = Number(statistics.assists ?? 0);
  const steals = Number(statistics.steals ?? 0);
  const blocks = Number(statistics.blocks ?? 0);
  const turnovers = Number(statistics.turnovers ?? 0);

  return Number((points + rebounds * 1.2 + assists * 1.5 + steals * 3 + blocks * 3 - turnovers).toFixed(1));
}

function buildUpcomingSlateCells(game) {
  if (!game) {
    return ["-", "-", "-", "-"];
  }

  return [game.tipoff || "-", game.status === "upcoming" ? "PRE" : game.status.toUpperCase(), "-", "-"];
}

async function buildOfficialLivePointsPreview(state) {
  const slate = await getOfficialSlateContext();
  if (!slate?.games?.length) {
    return null;
  }

  const roster = [...state.starters, ...state.bench];
  const gamesByTeam = new Map();
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
        .filter((game) => game && game.status !== "upcoming")
        .map((game) => game.id)
    )
  ];

  const boxScores = await Promise.all(
    relevantGameIds.map(async (gameId) => {
      const payload = await getOfficialBoxScore(gameId);
      return payload?.game ? [String(gameId), payload.game] : null;
    })
  );

  const boxScoreByGameId = new Map(boxScores.filter(Boolean));

  const hydratePlayer = (player) => {
    const game = gamesByTeam.get(player.team);
    const opponent =
      game?.homeTriCode === player.team ? game?.awayTriCode || "TBD" : game?.homeTriCode || "TBD";

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
      nextOpponent: opponent,
      upcoming: buildUpcomingSlateCells(game)
    };
  };

  const starters = state.starters.map(hydratePlayer);
  const bench = state.bench.map(hydratePlayer);
  const starterPoints = starters.map((player) => Number(player.points ?? 0));
  const finalPoints = calcFinalPoints({
    ...state,
    starters,
    bench
  });

  return {
    visible: true,
    message: isBeforeFirstDeadline() ? "Regular-season live preview from official NBA data." : undefined,
    gameweek: {
      id: slate.gamedayIndex ?? GAMEWEEK.id,
      label: slate.gamedayLabel ?? GAMEWEEK.label,
      deadline: slate.deadlineLabel
    },
    summary: {
      average: starterPoints.length ? Number((starterPoints.reduce((sum, value) => sum + value, 0) / starterPoints.length).toFixed(1)) : 0,
      final: finalPoints,
      top: starterPoints.length ? Number(Math.max(...starterPoints).toFixed(1)) : 0
    },
    lineup: {
      starters,
      bench,
      captainId: state.captainId
    },
    finalPoints
  };
}

function buildSchedulePayload() {
  const liveCache = readLiveScheduleCache();
  if (Array.isArray(liveCache?.games) && liveCache.games.length) {
    return {
      gameweek: liveCache.gameweek ?? "Gameweek1 Gameday1",
      deadline: liveCache.deadline ? formatDateTimeLabel(liveCache.deadline) : "",
      games: liveCache.games.map((game) => ({
        ...game,
        homeTeam: game.homeTeam ?? undefined,
        awayTeam: game.awayTeam ?? undefined
      }))
    };
  }

  return {
    ...SCHEDULE,
    gameweek: "Gameweek1 Gameday1",
    games: SCHEDULE.games.map((game) => ({
      ...game,
      gamedayKey: game.date,
      gamedayLabel: "Gameweek1 Gameday1",
      gamedayDateLabel: new Date(game.date).toDateString(),
      gamedayIndex: 1,
      homeTeam: buildTeamAsset(game.home),
      awayTeam: buildTeamAsset(game.away)
    }))
  };
}

function formatDateTimeLabel(dateInput) {
  const date = new Date(dateInput);
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

function buildPublicUser(user) {
  return {
    id: user.id,
    account: user.account,
    gameId: user.gameId,
    displayName: user.gameId
  };
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function authRequired(req, res, next) {
  const token = extractBearerToken(req);
  const authUser = getAuthenticatedUserByToken(token);

  if (!authUser) {
    res.status(401).json({ message: "Unauthorized. Please log in." });
    return;
  }

  req.authUser = {
    id: authUser.id,
    account: authUser.account,
    gameId: authUser.gameId,
    token
  };

  next();
}

function calcFinalPoints(state) {
  if (!hasCreatedTeam(state)) {
    return 0;
  }

  const startersTotal = state.starters.reduce((sum, item) => sum + Number(item.points ?? 0), 0);
  const captain = state.starters.find((item) => item.id === state.captainId) ?? state.bench.find((item) => item.id === state.captainId);
  const captainBonus = captain ? Number(captain.points ?? 0) * 0.5 : 0;
  return Number((startersTotal + captainBonus).toFixed(1));
}

function isValidStarterMix(starters) {
  const bcCount = starters.filter((player) => player.position === "BC").length;
  const fcCount = starters.filter((player) => player.position === "FC").length;
  return starters.length === 5 && ((bcCount === 3 && fcCount === 2) || (bcCount === 2 && fcCount === 3));
}

function withVisiblePoints(players) {
  if (!isBeforeFirstDeadline()) {
    return players;
  }

  return players.map((player) => ({
    ...player,
    points: 0
  }));
}

function getLineupPayload(state) {
  return {
    gameweek: getGameweekPayload(),
    hasTeam: hasCreatedTeam(state),
    budget: getInitialBudget(),
    rosterValue: state.rosterValue,
    bank: state.bank,
    captainDecisionLocked: false,
    lineup: {
      starters: withVisiblePoints(state.starters),
      bench: withVisiblePoints(state.bench),
      captainId: state.captainId
    },
    transactions: {
      freeLeft: Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
      usedThisWeek: state.usedThisWeek,
      weeklyFreeLimit: state.weeklyFreeLimit
    }
  };
}

function getTransactionsPayload(state) {
  const rosterIds = getRosterPlayers(state).map((player) => player.id);
  const limitless = isBeforeFirstDeadline();

  return {
    gameweek: getGameweekPayload(),
    hasTeam: hasCreatedTeam(state),
    transferMode: limitless ? "LIMITLESS" : "LIMITED",
    freeTransfersLeft: limitless ? 999 : Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
    usedThisWeek: state.usedThisWeek,
    weeklyFreeLimit: state.weeklyFreeLimit,
    bank: state.bank,
    rosterValue: state.rosterValue,
    history: state.history,
    lineup: {
      starters: withVisiblePoints(state.starters),
      bench: withVisiblePoints(state.bench),
      captainId: state.captainId
    },
    market: withVisiblePoints(searchPlayerPool({ excludeIds: rosterIds, limit: 80 }))
  };
}

function getDisplayProfileState(state) {
  if (isBeforeFirstDeadline()) {
    return {
      ...state,
      overallPoints: 0,
      overallRank: 0,
      totalPlayers: 0,
      gamedayPoints: 0,
      fanLeague: ""
    };
  }

  return {
    ...state,
    gamedayPoints: calcFinalPoints(state),
    fanLeague: state.fanLeague === "Playoff Friends" ? "" : state.fanLeague
  };
}

function replacePlayerForState(state, outPlayerId, inPlayerId) {
  if (!hasCreatedTeam(state)) {
    return { ok: false, error: "Create your initial team first." };
  }

  const limitless = isBeforeFirstDeadline();
  const freeTransfersLeft = Math.max(0, state.weeklyFreeLimit - state.usedThisWeek);
  if (!limitless && freeTransfersLeft <= 0) {
    return { ok: false, error: "No free transfers left for this week." };
  }

  const incoming = getPlayersByIds([inPlayerId])[0];
  if (!incoming) {
    return { ok: false, error: "Incoming player not found in transfer market." };
  }

  if (!incoming.canSelect || !incoming.canTransact) {
    return { ok: false, error: "Incoming player is not available." };
  }

  if (getRosterPlayers(state).some((player) => player.id === incoming.id)) {
    return { ok: false, error: "Incoming player is already in your roster." };
  }

  let targetPool = state.starters;
  let targetIndex = targetPool.findIndex((player) => player.id === outPlayerId);

  if (targetIndex === -1) {
    targetPool = state.bench;
    targetIndex = targetPool.findIndex((player) => player.id === outPlayerId);
  }

  if (targetIndex === -1) {
    return { ok: false, error: "Outgoing player is not in your roster." };
  }

  const outgoing = targetPool[targetIndex];
  if (outgoing.position !== incoming.position) {
    return { ok: false, error: "Transfer must keep the same position group." };
  }

  const nextRosterValue = Number((state.rosterValue - Number(outgoing.salary) + Number(incoming.salary)).toFixed(1));
  if (nextRosterValue > getInitialBudget()) {
    return { ok: false, error: "Transfer would exceed your budget." };
  }

    targetPool.splice(targetIndex, 1, {
    id: incoming.id,
    code: incoming.code,
    name: incoming.name,
    teamId: incoming.teamId,
    teamCode: incoming.teamCode,
    team: incoming.team,
    position: incoming.position,
    salary: incoming.salary,
    points: incoming.points ?? 0,
    color: incoming.color ?? "cold",
    headshotUrl: incoming.headshotUrl,
    headshotFallbackUrl: incoming.headshotFallbackUrl,
    teamLogoUrl: incoming.teamLogoUrl,
    teamLogoFallbackUrl: incoming.teamLogoFallbackUrl,
    nextOpponent: "TBD",
    nextOpponentName: null,
    nextOpponentLogoUrl: null,
    nextOpponentLogoFallbackUrl: null,
    upcoming: ["TBD", "TBD"]
  });

  if (!limitless) {
    state.usedThisWeek += 1;
  }
  state.totalTransfers += 1;
  state.rosterValue = nextRosterValue;
  state.bank = Number((getInitialBudget() - state.rosterValue).toFixed(1));

  const record = {
    id: `tx-${Date.now()}`,
    timestamp: new Date().toISOString(),
    outPlayer: outgoing.name,
    inPlayer: incoming.name,
    cost: 0,
    note: limitless ? "Limitless before first deadline" : "Free transfer"
  };

  state.history.unshift(record);

  return {
    ok: true,
    transfer: record,
    payload: getTransactionsPayload(state)
  };
}

function createInitialTeamForState(state, playerIds) {
  if (hasCreatedTeam(state)) {
    return { ok: false, error: "Initial team has already been created." };
  }

  const uniqueIds = [...new Set((playerIds ?? []).map((id) => String(id)))];
  if (uniqueIds.length !== 10) {
    return { ok: false, error: "Please select exactly 10 unique players." };
  }

  const players = getPlayersByIds(uniqueIds);
  if (players.length !== 10) {
    return { ok: false, error: "Some selected players were not found." };
  }

  const unavailable = players.find((player) => !player.canSelect);
  if (unavailable) {
    return { ok: false, error: `${unavailable.name} is not selectable.` };
  }

  const bc = players.filter((player) => player.position === "BC");
  const fc = players.filter((player) => player.position === "FC");
  if (bc.length !== 5 || fc.length !== 5) {
    return { ok: false, error: "Initial roster must contain 5 BC and 5 FC players." };
  }

  const rosterValue = Number(players.reduce((sum, player) => sum + Number(player.salary), 0).toFixed(1));
  const budget = getInitialBudget();
  if (rosterValue > budget) {
    return { ok: false, error: `Roster value ${rosterValue.toFixed(1)} exceeds budget ${budget.toFixed(1)}.` };
  }

  state.starters = [...bc.slice(0, 2), ...fc.slice(0, 3)];
  state.bench = [...bc.slice(2), ...fc.slice(3)];
  state.captainId = "";
  state.captainDecisionLocked = false;
  state.rosterValue = rosterValue;
  state.bank = Number((budget - rosterValue).toFixed(1));
  state.weeklyFreeLimit = getWeeklyFreeTransfers();

  return { ok: true, payload: getLineupPayload(state) };
}

function safeLoadState(userId, res) {
  const state = getStateForUser(userId);
  if (!state) {
    res.status(500).json({ message: "User state not found." });
    return null;
  }

  return hydrateStateAssets(state);
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "playoff-fantasy-api", dbPath });
});

app.post("/api/auth/register", (req, res) => {
  const account = String(req.body?.account ?? "").trim();
  const gameId = String(req.body?.gameId ?? "").trim();
  const password = String(req.body?.password ?? "");
  const confirmPassword = String(req.body?.confirmPassword ?? "");

  if (!account || !gameId || !password || !confirmPassword) {
    res.status(400).json({ message: "account, gameId, password, and confirmPassword are required." });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ message: "Password and confirmPassword do not match." });
    return;
  }

  if (password.length < 4) {
    res.status(400).json({ message: "Password must be at least 4 characters." });
    return;
  }

  if (getUserByAccount.get(account)) {
    res.status(400).json({ message: "Account already exists." });
    return;
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = registerUserTx(account, gameId, passwordHash);
    const token = createSession(user.id);

    res.status(201).json({ token, user: buildPublicUser(user) });
  } catch {
    res.status(500).json({ message: "Failed to register user." });
  }
});

app.post("/api/auth/login", (req, res) => {
  const account = String(req.body?.account ?? "").trim();
  const password = String(req.body?.password ?? "");

  if (!account || !password) {
    res.status(400).json({ message: "account and password are required." });
    return;
  }

  const user = getUserByAccount.get(account);
  if (!user) {
    res.status(401).json({ message: "Invalid account or password." });
    return;
  }

  const matched = bcrypt.compareSync(password, user.passwordHash);
  if (!matched) {
    res.status(401).json({ message: "Invalid account or password." });
    return;
  }

  const token = createSession(user.id);
  res.json({ token, user: buildPublicUser(user) });
});

app.post("/api/auth/logout", authRequired, (req, res) => {
  deleteSession.run(req.authUser.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: buildPublicUser(req.authUser) });
});

app.get("/api/meta/player-data", authRequired, (_req, res) => {
  res.json(getPlayerDataSummary());
});

app.get("/api/players", authRequired, (req, res) => {
  const state = getStateForUser(req.authUser.id);
  const excludeIds = state ? getRosterPlayers(state).map((player) => player.id) : [];
  const players = searchPlayerPool({
    search: req.query.search,
    position: req.query.position,
    teamId: req.query.teamId,
    maxSalary: req.query.maxSalary,
    excludeIds,
    limit: req.query.limit,
    sort: req.query.sort
  });

  res.json({
    players,
    meta: getPlayerDataSummary()
  });
});

app.post("/api/team/create", authRequired, (req, res) => {
  const { playerIds } = req.body ?? {};
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const result = createInitialTeamForState(state, playerIds);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }

  saveStateForUser(req.authUser.id, state);
  res.status(201).json(result.payload);
});

app.get("/api/profile", authRequired, async (req, res) => {
  try {
    const state = safeLoadState(req.authUser.id, res);
    if (!state) {
      return;
    }

    const displayState = getDisplayProfileState(state);
    const livePreview = hasCreatedTeam(state) ? await buildOfficialLivePointsPreview(state).catch(() => null) : null;

    if (!isBeforeFirstDeadline()) {
      state.gamedayPoints = displayState.gamedayPoints;
      saveStateForUser(req.authUser.id, state);
    }

    const privateClassic = listPrivateLeaguesForUser(req.authUser.id);

    res.json({
      profile: {
        teamName: displayState.teamName,
        managerName: displayState.managerName,
        overallPoints: displayState.overallPoints,
        overallRank: displayState.overallRank,
        totalPlayers: displayState.totalPlayers,
        gamedayPoints: livePreview?.finalPoints ?? displayState.gamedayPoints,
        fanLeague: displayState.fanLeague
      },
      transactions: {
        freeLeft: Math.max(0, state.weeklyFreeLimit - state.usedThisWeek),
        total: state.totalTransfers,
        rosterValue: state.rosterValue,
        bank: state.bank
      },
      leagues: {
        global: [],
        privateClassic
      }
    });
  } catch {
    res.status(500).json({ message: "Failed to load profile." });
  }
});

app.get("/api/lineup", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  res.json(getLineupPayload(state));
});

app.put("/api/lineup", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const next = req.body ?? {};

  const proposedStarters = Array.isArray(next.starters) ? next.starters : state.starters;
  const proposedBench = Array.isArray(next.bench) ? next.bench : state.bench;

  if (proposedStarters.length !== 5) {
    res.status(400).json({ message: "starters must contain 5 players." });
    return;
  }

  if (proposedBench.length !== 5) {
    res.status(400).json({ message: "bench must contain 5 players." });
    return;
  }

  if (!isValidStarterMix(proposedStarters)) {
    res.status(400).json({ message: "Starting 5 must stay in a 3BC/2FC or 3FC/2BC shape." });
    return;
  }

  const currentIds = [...state.starters, ...state.bench].map((player) => player.id).sort();
  const proposedIds = [...proposedStarters, ...proposedBench].map((player) => player.id).sort();
  if (currentIds.join("|") !== proposedIds.join("|")) {
    res.status(400).json({ message: "Line-up save can only reorder players already in your roster." });
    return;
  }

  const proposedCaptainId = next.captainId ?? state.captainId;

  if (proposedCaptainId && !proposedStarters.some((player) => player.id === proposedCaptainId)) {
    res.status(400).json({ message: "Captain must be selected from your Starting 5." });
    return;
  }

  state.starters = proposedStarters;
  state.bench = proposedBench;
  state.captainId = proposedCaptainId ?? "";
  state.captainDecisionLocked = false;

  saveStateForUser(req.authUser.id, state);
  res.json(getLineupPayload(state));
});

app.get("/api/points/today", authRequired, async (req, res) => {
  try {
    const state = safeLoadState(req.authUser.id, res);
    if (!state) {
      return;
    }

    if (!hasCreatedTeam(state)) {
      res.status(400).json({ message: "Create your initial team first." });
      return;
    }

    const livePreview = await buildOfficialLivePointsPreview(state).catch(() => null);
    if (livePreview) {
      res.json(livePreview);
      return;
    }

    if (isBeforeFirstDeadline()) {
      res.json({
        visible: false,
        message: "Points will unlock after the first deadline.",
        gameweek: getGameweekPayload(),
        summary: {
          average: 0,
          final: 0,
          top: 0
        },
        lineup: {
          starters: withVisiblePoints(state.starters),
          bench: withVisiblePoints(state.bench),
          captainId: state.captainId
        }
      });
      return;
    }

    const finalPoints = calcFinalPoints(state);
    state.gamedayPoints = finalPoints;
    saveStateForUser(req.authUser.id, state);

    res.json({
      visible: true,
      gameweek: getGameweekPayload(),
      summary: {
        average: POINTS_BASELINE.average,
        final: finalPoints,
        top: POINTS_BASELINE.top
      },
      lineup: {
        starters: withVisiblePoints(state.starters),
        bench: withVisiblePoints(state.bench),
        captainId: state.captainId
      }
    });
  } catch {
    res.status(500).json({ message: "Failed to load points." });
  }
});

app.get("/api/transactions/options", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  res.json(getTransactionsPayload(state));
});

app.post("/api/transactions", authRequired, (req, res) => {
  const { outPlayerId, inPlayerId } = req.body ?? {};

  if (!outPlayerId || !inPlayerId) {
    res.status(400).json({ message: "outPlayerId and inPlayerId are required." });
    return;
  }

  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const result = replacePlayerForState(state, outPlayerId, inPlayerId);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }

  saveStateForUser(req.authUser.id, state);
  res.json(result);
});

app.get("/api/leagues", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  res.json({
    privateClassic: listPrivateLeaguesForUser(req.authUser.id),
    publicClassic: [],
    global: []
  });
});

app.get("/api/leagues/:leagueId", authRequired, (req, res) => {
  const state = safeLoadState(req.authUser.id, res);
  if (!state) {
    return;
  }

  const leagues = listPrivateLeaguesForUser(req.authUser.id);
  const league = leagues.find((item) => item.id === String(req.params.leagueId));

  if (!league) {
    res.status(404).json({ message: "League not found." });
    return;
  }

  res.json({ league });
});

app.post("/api/leagues/create", authRequired, (req, res) => {
  const name = String(req.body?.name ?? "").trim();

  if (!name) {
    res.status(400).json({ message: "League name is required." });
    return;
  }

  if (name.length > 30) {
    res.status(400).json({ message: "League name must be 30 characters or fewer." });
    return;
  }

  try {
    const league = createPrivateLeague(req.authUser.id, name);
    const leagues = {
      privateClassic: listPrivateLeaguesForUser(req.authUser.id),
      publicClassic: [],
      global: []
    };

    res.status(201).json({
      league: {
        id: String(league.id),
        name: league.name,
        code: league.code
      },
      leagues
    });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to create league." });
  }
});

app.post("/api/leagues/join", authRequired, (req, res) => {
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  const result = joinPrivateLeague(req.authUser.id, code);

  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }

  res.status(201).json({
    league: {
      id: String(result.league.id),
      name: result.league.name,
      code: result.league.code
    },
    leagues: {
      privateClassic: listPrivateLeaguesForUser(req.authUser.id),
      publicClassic: [],
      global: []
    }
  });
});

app.get("/api/schedule", authRequired, async (_req, res) => {
  try {
    const officialTimeline = await getOfficialScheduleTimeline().catch(() => null);
    if (officialTimeline?.games?.length) {
      res.json({
        gameweek: officialTimeline.gameweek,
        deadline: officialTimeline.deadline,
        games: officialTimeline.games.map((game) => ({
          id: game.id,
          date: game.date,
          tipoff: game.tipoff,
          home: game.home,
          away: game.away,
          homeTeam: game.homeTeam ?? undefined,
          awayTeam: game.awayTeam ?? undefined,
          status: game.status,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          statusText: game.statusText,
          stageLabel: game.stageLabel
        }))
      });
      return;
    }

    res.json(buildSchedulePayload());
  } catch {
    res.status(500).json({ message: "Failed to load schedule." });
  }
});

app.get("/api/help/rules", authRequired, (_req, res) => {
  res.json(HELP_RULES);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Playoff Fantasy API listening on http://localhost:${PORT}`);
});
