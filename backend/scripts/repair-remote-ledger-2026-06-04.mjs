import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const backendDir = path.resolve(path.dirname(__filename), "..");
const repoDir = path.resolve(backendDir, "..");
const tmpDir = path.join(backendDir, "tmp");
const reportPath = path.join(repoDir, "docs", "repair-ledger-2026-06-04.md");
const backupPath = path.join(tmpDir, "repair-ledger-2026-06-04.backup.json");
const sqlPath = path.join(tmpDir, "repair-ledger-2026-06-04.sql");
const wranglerBin = path.join(backendDir, "node_modules", "wrangler", "bin", "wrangler.js");

const APPLY = process.argv.includes("--apply");
const VERIFY_ONLY = process.argv.includes("--verify-only");
const NBA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com"
};
const SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
const BOX_SCORE_URL = "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gameId}.json";
const REPAIR_RECORDED_AT = "2026-06-04T00:00:00.000Z";
const REPAIR_NOTE = "Rebuilt by 2026-06-04 ledger repair from official box scores and transfer timestamps.";
const APPEARANCE_SETTLEMENT_EFFECTIVE_GAMEDAY_KEY = "2026-04-20";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseWranglerJson(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Unable to parse wrangler JSON output:\n${output}`);
  }

  const parsed = JSON.parse(output.slice(start, end + 1));
  const first = parsed[0];
  if (!first?.success) {
    throw new Error(`Wrangler command failed:\n${output}`);
  }

  return first.results ?? [];
}

function d1Query(sql) {
  const output = execFileSync(
    process.execPath,
    [wranglerBin, "d1", "execute", "PLAYOFF_FANTASY_DB", "--remote", "--command", sql],
    {
      cwd: backendDir,
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024
    }
  );
  return parseWranglerJson(output);
}

function d1ExecuteFile(filePath) {
  execFileSync(
    process.execPath,
    [wranglerBin, "d1", "execute", "PLAYOFF_FANTASY_DB", "--remote", "--file", filePath],
    {
      cwd: backendDir,
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
      stdio: "inherit"
    }
  );
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function fetchJson(url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { headers: NBA_HEADERS, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
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
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function getPlayoffSeriesCode(gameId) {
  const id = String(gameId ?? "");
  if (!id.startsWith("004") || id.length < 10) {
    return null;
  }

  const seriesCode = Number(id.slice(7, 9));
  return Number.isFinite(seriesCode) ? seriesCode : null;
}

function getPlayoffGameweekNumber(gameId) {
  const seriesCode = getPlayoffSeriesCode(gameId);
  if (seriesCode === null) {
    return null;
  }
  if (seriesCode >= 10 && seriesCode <= 17) {
    return 1;
  }
  if (seriesCode >= 20 && seriesCode <= 23) {
    return 2;
  }
  if (seriesCode >= 30 && seriesCode <= 31) {
    return 3;
  }
  if (seriesCode === 40) {
    return 4;
  }
  return null;
}

function isPostseasonGameId(gameId) {
  return getPlayoffGameweekNumber(gameId) !== null;
}

function isIfNecessary(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function isConfirmedOfficialPlayoffGame(game) {
  if (!isPostseasonGameId(String(game.gameId ?? ""))) {
    return false;
  }

  const status = Number(game.gameStatus ?? 0);
  if (status >= 2) {
    return true;
  }

  if (isIfNecessary(game.ifNecessary)) {
    return false;
  }

  return Boolean(game.homeTeam?.teamId && game.awayTeam?.teamId);
}

function normalizeLiveGameStatus(status) {
  const numeric = Number(status ?? 0);
  if (numeric >= 3) {
    return "final";
  }
  if (numeric === 2) {
    return "live";
  }
  return "upcoming";
}

function toDeadlineIso(dateInput, leadMinutes = 30) {
  const date = new Date(dateInput ?? "");
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Date(date.getTime() - leadMinutes * 60 * 1000).toISOString();
}

function buildPlayoffPeriods(games) {
  const buckets = new Map();
  games.forEach((game) => {
    const roundNumber = getPlayoffGameweekNumber(game.id);
    const dateKey = game.gamedayKey;
    const firstDate = game.date ?? "";
    if (roundNumber === null || !dateKey || !firstDate) {
      return;
    }

    const current = buckets.get(dateKey);
    if (!current || new Date(firstDate).getTime() < new Date(current.firstDate).getTime()) {
      buckets.set(dateKey, { dateKey, firstDate, roundNumber });
    }
  });

  return [...buckets.values()]
    .sort((left, right) => new Date(left.firstDate).getTime() - new Date(right.firstDate).getTime())
    .map((entry, index) => ({
      key: `day:${entry.dateKey}`,
      label: `Day ${index + 1}`,
      roundNumber: entry.roundNumber,
      dayNumber: index + 1,
      deadline: toDeadlineIso(entry.firstDate),
      gamedayIndex: index + 1,
      gamedayKey: entry.dateKey
    }))
    .sort((left, right) => new Date(left.deadline).getTime() - new Date(right.deadline).getTime());
}

async function getOfficialScheduleGames() {
  const payload = await fetchJson(SCHEDULE_URL);
  const rawGames = payload?.leagueSchedule?.gameDates?.flatMap((gameDate) => gameDate.games ?? []) ?? [];
  return rawGames
    .filter(isConfirmedOfficialPlayoffGame)
    .map((game) => {
      const date = game.gameDateTimeUTC ?? game.gameDateEst ?? "";
      return {
        id: String(game.gameId),
        date,
        gamedayKey: normalizeScheduleDateKey(game.gameDateEst ?? date),
        status: normalizeLiveGameStatus(game.gameStatus),
        statusText: String(game.gameStatusText ?? ""),
        homeTriCode: String(game.homeTeam?.teamTricode ?? ""),
        awayTriCode: String(game.awayTeam?.teamTricode ?? "")
      };
    })
    .filter((game) => game.date && game.gamedayKey);
}

function normalizePlayerRow(row) {
  return {
    id: String(row.id),
    code: row.code ? String(row.code) : null,
    name: row.name,
    teamId: row.teamId ? Number(row.teamId) : null,
    teamCode: row.teamCode ? String(row.teamCode) : null,
    team: row.team,
    position: row.position,
    salary: Number(row.salary ?? 0),
    points: 0,
    pointsWindowKey: null
  };
}

function clonePlayer(player) {
  return {
    ...player,
    upcoming: [...(player.upcoming ?? [])],
    upcomingSchedule: [...(player.upcomingSchedule ?? [])]
  };
}

function cloneState(state) {
  return {
    ...state,
    starters: state.starters.map(clonePlayer),
    bench: state.bench.map(clonePlayer),
    market: [],
    history: state.history.map((item) => ({ ...item }))
  };
}

function applyStoredLineupSnapshot(state, snapshot) {
  state.starters = snapshot.starters.map(clonePlayer);
  state.bench = snapshot.bench.map(clonePlayer);
  state.captainId = snapshot.captainId ?? "";
  state.rosterValue = Number(snapshot.rosterValue ?? 0);
  state.bank = Number(snapshot.bank ?? 0);
  return state;
}

function buildStateFromSnapshot(state, snapshot) {
  return applyStoredLineupSnapshot(cloneState(state), snapshot);
}

function getRosterPlayers(state) {
  return [...state.starters, ...state.bench];
}

function isChipActiveForPeriod(activePeriodKey, periodKey) {
  return Boolean(activePeriodKey && periodKey && activePeriodKey === periodKey);
}

function isRewindableRosterChange(item) {
  return !String(item.note ?? "").startsWith("All-Star active");
}

function replaceRosterPlayerByIdentity(state, currentPlayerId, currentPlayerName, replacement) {
  const replaceInPool = (pool) => {
    const index = pool.findIndex((player) => {
      if (currentPlayerId && String(player.id) === String(currentPlayerId)) {
        return true;
      }
      return player.name === currentPlayerName;
    });

    if (index === -1) {
      return false;
    }

    pool[index] = clonePlayer(replacement);
    return true;
  };

  return replaceInPool(state.starters) || replaceInPool(state.bench);
}

function compactLockedPlayer(player) {
  return {
    id: String(player.id ?? ""),
    code: player.code ?? null,
    name: player.name,
    teamId: player.teamId ?? null,
    teamCode: player.teamCode ?? null,
    team: player.team,
    position: player.position,
    salary: Number(player.salary ?? 0),
    points: Number(player.points ?? 0),
    pointsWindowKey: player.pointsWindowKey ?? null
  };
}

function compactSnapshot(snapshot) {
  return {
    starters: snapshot.starters.map(compactLockedPlayer),
    bench: snapshot.bench.map(compactLockedPlayer),
    captainId: snapshot.captainId ?? "",
    rosterValue: Number(snapshot.rosterValue ?? 0),
    bank: Number(snapshot.bank ?? 0)
  };
}

function hasCreatedTeam(state) {
  return state.starters.length + state.bench.length === 10;
}

function getEffectiveScoringPlayers(state) {
  const hasScoringOpportunity = (player) => Boolean(String(player.pointsWindowKey ?? "").trim());
  const activeStarters = state.starters.filter(hasScoringOpportunity);
  const activeBench = state.bench
    .map((player, index) => ({ player, index }))
    .filter((entry) => hasScoringOpportunity(entry.player));
  const starterCounts = activeStarters.reduce(
    (counts, player) => {
      if (player.position === "BC") {
        counts.bc += 1;
      } else if (player.position === "FC") {
        counts.fc += 1;
      }
      return counts;
    },
    { bc: 0, fc: 0 }
  );
  const targetShapes = [
    { bc: 3, fc: 2 },
    { bc: 2, fc: 3 }
  ];
  const candidates = targetShapes
    .filter((shape) => starterCounts.bc <= shape.bc && starterCounts.fc <= shape.fc)
    .map((shape) => {
      const selected = [...activeStarters];
      const benchIndices = [];
      let remainingBC = shape.bc - starterCounts.bc;
      let remainingFC = shape.fc - starterCounts.fc;

      for (const entry of activeBench) {
        if (selected.length >= 5) {
          break;
        }
        if (entry.player.position === "BC" && remainingBC > 0) {
          selected.push(entry.player);
          benchIndices.push(entry.index);
          remainingBC -= 1;
          continue;
        }
        if (entry.player.position === "FC" && remainingFC > 0) {
          selected.push(entry.player);
          benchIndices.push(entry.index);
          remainingFC -= 1;
        }
      }

      return { selected, benchIndices };
    });

  if (!candidates.length) {
    return activeStarters.slice(0, 5);
  }

  candidates.sort((left, right) => {
    const countDiff = right.selected.length - left.selected.length;
    if (countDiff !== 0) {
      return countDiff;
    }
    const maxLength = Math.max(left.benchIndices.length, right.benchIndices.length);
    for (let index = 0; index < maxLength; index += 1) {
      const leftValue = left.benchIndices[index];
      const rightValue = right.benchIndices[index];
      if (leftValue === undefined) {
        return 1;
      }
      if (rightValue === undefined) {
        return -1;
      }
      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
    }
    return 0;
  });

  return candidates[0]?.selected ?? activeStarters.slice(0, 5);
}

function calcFinalPoints(state) {
  if (!hasCreatedTeam(state)) {
    return 0;
  }
  return Number(getEffectiveScoringPlayers(state).reduce((sum, player) => sum + Number(player.points ?? 0), 0).toFixed(1));
}

function calculateFantasyPoints(statistics) {
  const points = Number(statistics?.points ?? 0);
  const rebounds = Number(statistics?.reboundsTotal ?? statistics?.rebounds ?? 0);
  const assists = Number(statistics?.assists ?? 0);
  const steals = Number(statistics?.steals ?? 0);
  const blocks = Number(statistics?.blocks ?? 0);
  const turnovers = Number(statistics?.turnovers ?? 0);
  return Number((points + rebounds + assists * 2 + steals * 3 + blocks * 3 - turnovers).toFixed(1));
}

function shouldSetNonParticipantToNull(period) {
  return period.gamedayKey >= APPEARANCE_SETTLEMENT_EFFECTIVE_GAMEDAY_KEY;
}

function buildPeriodPreview(state, period, slateGames, boxScoreByGameId) {
  const gamesByTeam = new Map();
  slateGames.forEach((game) => {
    if (game.homeTriCode) {
      gamesByTeam.set(game.homeTriCode, game);
    }
    if (game.awayTriCode) {
      gamesByTeam.set(game.awayTriCode, game);
    }
  });

  const hydratePlayer = (player) => {
    const game = gamesByTeam.get(player.team);
    const boxScore = game ? boxScoreByGameId.get(String(game.id)) : null;
    const officialPlayerId = Number(player.code ?? 0);
    const officialPlayers =
      boxScore && Number.isFinite(officialPlayerId) && officialPlayerId > 0
        ? [...(boxScore?.homeTeam?.players ?? []), ...(boxScore?.awayTeam?.players ?? [])]
        : [];
    const officialPlayer = officialPlayers.find((candidate) => Number(candidate.personId) === officialPlayerId) ?? null;
    const hasAppeared = String(officialPlayer?.played ?? "0") === "1";
    const points = officialPlayer && game?.status !== "upcoming" ? calculateFantasyPoints(officialPlayer.statistics ?? {}) : 0;
    const pointsWindowKey =
      shouldSetNonParticipantToNull(period) && officialPlayer && !hasAppeared
        ? null
        : game
          ? period.key
          : null;

    return {
      ...player,
      points,
      pointsWindowKey
    };
  };

  const starters = state.starters.map(hydratePlayer);
  const bench = state.bench.map(hydratePlayer);
  const finalPoints = calcFinalPoints({ ...state, starters, bench });
  return { finalPoints, lineup: { starters, bench, captainId: "" } };
}

function transferTime(item) {
  const value = new Date(item.timestamp ?? "").getTime();
  return Number.isFinite(value) ? value : null;
}

function isTransferAfterDeadline(item, period) {
  const deadlineTime = new Date(period.deadline ?? "").getTime();
  const itemTime = transferTime(item);
  if (Number.isFinite(deadlineTime) && itemTime !== null) {
    return itemTime > deadlineTime;
  }

  const windowKey = String(item.windowKey ?? "");
  return windowKey.startsWith("day:") && windowKey.slice(4) > period.gamedayKey;
}

function lockIsContaminated(lock, state, period) {
  if (!lock?.capturedAt) {
    return false;
  }

  const capturedAt = new Date(lock.capturedAt).getTime();
  if (!Number.isFinite(capturedAt)) {
    return false;
  }

  return state.history.some((item) => {
    const itemTime = transferTime(item);
    return isRewindableRosterChange(item) && itemTime !== null && itemTime > new Date(period.deadline).getTime() && itemTime <= capturedAt;
  });
}

function buildReconstructedState(state, period, playersById, playersByName, warnings) {
  const reconstructed = cloneState(state);
  const rewoundHistory = reconstructed.history
    .filter((item) => isRewindableRosterChange(item) && isTransferAfterDeadline(item, period))
    .slice()
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

  for (const item of rewoundHistory) {
    const outgoing =
      (item.outPlayerId ? playersById.get(String(item.outPlayerId)) : null) ??
      playersByName.get(String(item.outPlayer ?? "")) ??
      null;
    const incomingId = item.inPlayerId ? String(item.inPlayerId) : null;

    if (!outgoing) {
      warnings.push(`Unable to rewind ${item.outPlayer || item.outPlayerId} for ${period.label}.`);
      continue;
    }

    replaceRosterPlayerByIdentity(reconstructed, incomingId, item.inPlayer, outgoing);
  }

  reconstructed.rosterValue = Number(getRosterPlayers(reconstructed).reduce((sum, player) => sum + Number(player.salary ?? 0), 0).toFixed(1));
  return reconstructed;
}

function buildScoringState(params) {
  const { state, chips, period, locksForUser, playersById, playersByName, warnings, lockStats } = params;
  const allStarActiveLineup =
    isChipActiveForPeriod(chips?.allStar?.activePeriodKey, period.key) && chips?.allStar?.activeLineup
      ? chips.allStar.activeLineup
      : null;
  const sourceState = allStarActiveLineup ? buildStateFromSnapshot(state, allStarActiveLineup) : state;
  const existingLock = locksForUser?.[period.key] ?? null;

  if (existingLock && !lockIsContaminated(existingLock, state, period)) {
    return {
      state: buildStateFromSnapshot(sourceState, existingLock.snapshot),
      lockAction: "kept"
    };
  }

  const reconstructed = buildReconstructedState(sourceState, period, playersById, playersByName, warnings);
  const snapshot = compactSnapshot({
    starters: reconstructed.starters,
    bench: reconstructed.bench,
    captainId: reconstructed.captainId ?? "",
    rosterValue: reconstructed.rosterValue ?? 0,
    bank: reconstructed.bank ?? 0
  });

  if (existingLock) {
    lockStats.replaced += 1;
  } else {
    lockStats.created += 1;
  }

  return {
    state: reconstructed,
    lockAction: existingLock ? "replaced" : "created",
    repairedLock: {
      snapshot,
      capturedAt: REPAIR_RECORDED_AT,
      source: "manual-correction",
      note: REPAIR_NOTE
    }
  };
}

function countPenaltyTransfersForPeriod(history, periodKey) {
  return history.filter((item) => item.windowKey === periodKey && Number(item.cost ?? 0) < 0).length;
}

function sumLedger(entries) {
  return Number(entries.reduce((sum, entry) => sum + Number(entry.points ?? 0), 0).toFixed(1));
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function appendAppStateJsonSql(sql, key, value, chunkSize = 50000) {
  const serialized = JSON.stringify(value);
  sql.push(
    `INSERT INTO app_state (key, value, updated_at) VALUES (${sqlString(key)}, '', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = '', updated_at = excluded.updated_at;`
  );

  for (let index = 0; index < serialized.length; index += chunkSize) {
    sql.push(`UPDATE app_state SET value = value || ${sqlString(serialized.slice(index, index + chunkSize))} WHERE key = ${sqlString(key)};`);
  }

  sql.push(`UPDATE app_state SET updated_at = CURRENT_TIMESTAMP WHERE key = ${sqlString(key)};`);
}

function buildState(row) {
  const history = safeJsonParse(row.historyJson, []);
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
    starters: safeJsonParse(row.startersJson, []),
    bench: safeJsonParse(row.benchJson, []),
    market: [],
    usedThisWeek: Number(row.usedThisWeek ?? 0),
    weeklyFreeLimit: Number(row.weeklyFreeLimit ?? 0),
    totalTransfers: history.filter((item) => item.countsTowardLimit || Number(item.cost ?? 0) < 0).length,
    rosterValue: Number(row.rosterValue ?? 0),
    bank: Number(row.bank ?? 0),
    history
  };
}

async function main() {
  ensureDir(tmpDir);
  ensureDir(path.dirname(reportPath));

  const [appRows, userRows, playerRows, ruleRows] = await Promise.all([
    Promise.resolve(d1Query("SELECT key, value, updated_at AS updatedAt FROM app_state WHERE key IN ('league_points_ledger_v1','lineup_locks_v1','user_chips_v1','standing_payload_cache_v1')")),
    Promise.resolve(
      d1Query(`SELECT
        u.id AS userId,
        u.game_id AS gameId,
        s.team_name AS teamName,
        s.manager_name AS managerName,
        s.overall_points AS overallPoints,
        s.overall_rank AS overallRank,
        s.total_players AS totalPlayers,
        s.gameday_points AS gamedayPoints,
        s.fan_league AS fanLeague,
        s.captain_id AS captainId,
        s.starters_json AS startersJson,
        s.bench_json AS benchJson,
        s.used_this_week AS usedThisWeek,
        s.weekly_free_limit AS weeklyFreeLimit,
        s.total_transfers AS totalTransfers,
        s.roster_value AS rosterValue,
        s.bank AS bank,
        s.history_json AS historyJson
      FROM users u JOIN user_states s ON s.user_id = u.id
      ORDER BY u.id`)
    ),
    Promise.resolve(
      d1Query(`SELECT
        id,
        code,
        web_name AS name,
        team_id AS teamId,
        team_short_name AS team,
        team_short_name AS teamCode,
        position_short AS position,
        salary
      FROM players`)
    ),
    Promise.resolve(d1Query("SELECT key, value FROM game_rules WHERE key IN ('transfer_penalty')"))
  ]);

  const appState = Object.fromEntries(appRows.map((row) => [row.key, row]));
  const originalLedger = safeJsonParse(appState.league_points_ledger_v1?.value, {});
  const originalLocks = safeJsonParse(appState.lineup_locks_v1?.value, {});
  const chipsRegistry = safeJsonParse(appState.user_chips_v1?.value, {});
  const ledger = JSON.parse(JSON.stringify(originalLedger));
  const locks = JSON.parse(JSON.stringify(originalLocks));
  const transferPenalty = Number(ruleRows.find((row) => row.key === "transfer_penalty")?.value ?? 50);
  const users = userRows.map((row) => ({ ...row, state: buildState(row) }));
  const players = playerRows.map(normalizePlayerRow);
  const playersById = new Map(players.map((player) => [String(player.id), player]));
  const playersByName = new Map(players.map((player) => [String(player.name), player]));

  if (!VERIFY_ONLY) {
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          appState: appRows,
          userStates: userRows.map((row) => ({
            userId: row.userId,
            gameId: row.gameId,
            teamName: row.teamName,
            overallPoints: row.overallPoints,
            overallRank: row.overallRank,
            gamedayPoints: row.gamedayPoints
          }))
        },
        null,
        2
      )
    );
  }

  const games = await getOfficialScheduleGames();
  const periods = buildPlayoffPeriods(games).filter((period) => {
    const slateGames = games.filter((game) => game.gamedayKey === period.gamedayKey);
    return new Date(period.deadline).getTime() <= Date.now() && slateGames.length && slateGames.every((game) => game.status === "final");
  });
  const boxScoresByGameId = new Map();

  for (const game of games.filter((game) => periods.some((period) => period.gamedayKey === game.gamedayKey))) {
    if (!boxScoresByGameId.has(game.id)) {
      const payload = await fetchJson(BOX_SCORE_URL.replace("{gameId}", game.id));
      if (!payload?.game) {
        throw new Error(`Missing official box score for ${game.id}`);
      }
      boxScoresByGameId.set(game.id, payload.game);
    }
  }

  const stats = {
    processedUsers: 0,
    processedPeriods: periods.length,
    actualEntriesFilled: 0,
    actualEntriesChanged: 0,
    actualEntriesUnchanged: 0,
    penaltyEntriesChanged: 0,
    locksCreated: 0,
    locksReplaced: 0,
    warnings: []
  };
  const userReports = [];
  const dayReports = new Map(periods.map((period) => [period.key, { period, filled: 0, changed: 0, explicitZero: 0 }]));

  for (const user of users) {
    const state = user.state;
    if (!hasCreatedTeam(state)) {
      continue;
    }

    stats.processedUsers += 1;
    const userKey = String(user.userId);
    const userLedger = ledger[userKey] ?? {};
    const beforeTotal = sumLedger(Object.values(userLedger));
    const userChanges = [];
    const chips = chipsRegistry[userKey] ?? {
      transferWindowSnapshot: null,
      wildcard: { used: false },
      allStar: { used: false }
    };
    const locksForUser = locks[userKey] ?? {};
    const lockStats = { created: 0, replaced: 0 };

    for (const period of periods) {
      const warnings = [];
      const scoringStateResult = buildScoringState({
        state,
        chips,
        period,
        locksForUser,
        playersById,
        playersByName,
        warnings,
        lockStats
      });
      const slateGames = games.filter((game) => game.gamedayKey === period.gamedayKey);
      const preview = buildPeriodPreview(scoringStateResult.state, period, slateGames, boxScoresByGameId);
      const previousEntry = userLedger[period.key] ?? null;
      const nextPoints = Number(preview.finalPoints.toFixed(1));

      if (!previousEntry) {
        stats.actualEntriesFilled += 1;
        dayReports.get(period.key).filled += 1;
      } else if (Number(previousEntry.points ?? 0) !== nextPoints) {
        stats.actualEntriesChanged += 1;
        dayReports.get(period.key).changed += 1;
      } else {
        stats.actualEntriesUnchanged += 1;
      }

      if (nextPoints === 0) {
        dayReports.get(period.key).explicitZero += 1;
      }

      if (!ledger[userKey]) {
        ledger[userKey] = {};
      }
      ledger[userKey][period.key] = {
        periodKey: period.key,
        label: period.label,
        roundNumber: Number(period.roundNumber ?? 0),
        dayNumber: Number(period.dayNumber ?? 0),
        points: nextPoints,
        recordedAt: REPAIR_RECORDED_AT
      };

      const penaltyKey = `penalty:${period.key}`;
      const penaltyPoints = Number((-transferPenalty * countPenaltyTransfersForPeriod(state.history, period.key)).toFixed(1));
      const previousPenalty = userLedger[penaltyKey] ?? null;
      if (penaltyPoints === 0) {
        if (previousPenalty) {
          delete ledger[userKey][penaltyKey];
          stats.penaltyEntriesChanged += 1;
        }
      } else {
        if (!previousPenalty || Number(previousPenalty.points ?? 0) !== penaltyPoints) {
          stats.penaltyEntriesChanged += 1;
        }
        ledger[userKey][penaltyKey] = {
          periodKey: penaltyKey,
          label: `Transfer penalty for ${period.label}`,
          roundNumber: Number(period.roundNumber ?? 0),
          dayNumber: Number(period.dayNumber ?? 0),
          points: penaltyPoints,
          recordedAt: REPAIR_RECORDED_AT
        };
      }

      if (scoringStateResult.repairedLock) {
        if (!locks[userKey]) {
          locks[userKey] = {};
        }
        locks[userKey][period.key] = scoringStateResult.repairedLock;
      }

      if (!previousEntry || Number(previousEntry.points ?? 0) !== nextPoints || scoringStateResult.lockAction !== "kept") {
        userChanges.push({
          day: period.label,
          key: period.key,
          before: previousEntry ? Number(previousEntry.points ?? 0) : null,
          after: nextPoints,
          lockAction: scoringStateResult.lockAction
        });
      }

      warnings.forEach((warning) => stats.warnings.push(`${user.teamName} ${period.label}: ${warning}`));
    }

    const afterTotal = sumLedger(Object.values(ledger[userKey] ?? {}));
    if (userChanges.length || beforeTotal !== afterTotal) {
      userReports.push({
        userId: userKey,
        gameId: user.gameId,
        teamName: user.teamName,
        beforeTotal,
        afterTotal,
        delta: Number((afterTotal - beforeTotal).toFixed(1)),
        changes: userChanges
      });
    }
  }

  stats.locksCreated = Object.values(locks).reduce((sum, userLocks) => sum + Object.values(userLocks).filter((lock) => lock.note === REPAIR_NOTE).length, 0);
  stats.locksReplaced = userReports.reduce(
    (sum, report) => sum + report.changes.filter((change) => change.lockAction === "replaced").length,
    0
  );

  const totalsByUser = new Map(Object.entries(ledger).map(([userId, entries]) => [userId, sumLedger(Object.values(entries))]));
  const rankedUsers = users
    .map((user) => ({
      userId: String(user.userId),
      teamName: user.teamName,
      gameId: user.gameId,
      total: Number((totalsByUser.get(String(user.userId)) ?? 0).toFixed(1))
    }))
    .sort((left, right) => {
      const pointsDiff = right.total - left.total;
      if (pointsDiff !== 0) {
        return pointsDiff;
      }
      const teamDiff = String(left.teamName ?? "").localeCompare(String(right.teamName ?? ""), undefined, { sensitivity: "base" });
      if (teamDiff !== 0) {
        return teamDiff;
      }
      return String(left.gameId ?? "").localeCompare(String(right.gameId ?? ""), undefined, { sensitivity: "base" });
    })
    .map((user, index) => ({ ...user, rank: index + 1 }));

  const rankByUser = new Map(rankedUsers.map((user) => [user.userId, user.rank]));
  const sql = [];
  appendAppStateJsonSql(sql, "league_points_ledger_v1", ledger);
  appendAppStateJsonSql(sql, "lineup_locks_v1", locks);
  appendAppStateJsonSql(sql, "standing_payload_cache_v1", {});

  for (const user of users) {
    const userId = String(user.userId);
    const nextOverall = Number((totalsByUser.get(userId) ?? 0).toFixed(1));
    const nextRank = rankByUser.get(userId) ?? Number(user.overallRank ?? 0);
    sql.push(`UPDATE user_states SET overall_points = ${nextOverall}, overall_rank = ${nextRank}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${Number(user.userId)};`);
  }
  if (!VERIFY_ONLY) {
    fs.writeFileSync(sqlPath, `${sql.join("\n")}\n`);
  }

  const dayRows = [...dayReports.values()].map(({ period, filled, changed, explicitZero }) => ({
    label: period.label,
    key: period.key,
    filled,
    changed,
    explicitZero
  }));
  const largestDeltas = [...userReports].sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta)).slice(0, 15);
  const reportLines = [
    "# 2026-06-04 Ledger Repair Report",
    "",
    "## Summary",
    `- Mode: ${APPLY ? "apply" : "dry-run"}`,
    `- Processed users with complete rosters: ${stats.processedUsers}`,
    `- Processed finalized periods: ${stats.processedPeriods} (${periods[0]?.label ?? "-"} through ${periods[periods.length - 1]?.label ?? "-"})`,
    `- Actual ledger entries filled: ${stats.actualEntriesFilled}`,
    `- Actual ledger entries changed: ${stats.actualEntriesChanged}`,
    `- Actual ledger entries unchanged: ${stats.actualEntriesUnchanged}`,
    `- Penalty ledger entries changed/removed: ${stats.penaltyEntriesChanged}`,
    `- Repaired lock entries generated in output: ${stats.locksCreated}`,
    `- SQL output: ${path.relative(repoDir, sqlPath).replace(/\\/g, "/")}`,
    `- Backup output: ${path.relative(repoDir, backupPath).replace(/\\/g, "/")}`,
    "",
    "## Day Fill Counts",
    "",
    "| Day | Period | Filled | Changed | Explicit Zero After Repair |",
    "| --- | --- | ---: | ---: | ---: |",
    ...dayRows.map((row) => `| ${row.label} | ${row.key} | ${row.filled} | ${row.changed} | ${row.explicitZero} |`),
    "",
    "## Largest User Total Changes",
    "",
    "| User | Team | Before | After | Delta |",
    "| --- | --- | ---: | ---: | ---: |",
    ...largestDeltas.map((row) => `| ${row.gameId} | ${String(row.teamName).replace(/\|/g, "/")} | ${row.beforeTotal} | ${row.afterTotal} | ${row.delta} |`),
    "",
    "## Users With Changes",
    "",
    ...userReports.flatMap((row) => [
      `### ${row.teamName} (${row.gameId}, user ${row.userId})`,
      `Total: ${row.beforeTotal} -> ${row.afterTotal} (${row.delta >= 0 ? "+" : ""}${row.delta})`,
      "",
      "| Day | Before | After | Lock |",
      "| --- | ---: | ---: | --- |",
      ...row.changes.map((change) => `| ${change.day} | ${change.before ?? "missing"} | ${change.after} | ${change.lockAction} |`),
      ""
    ]),
    stats.warnings.length ? "## Warnings" : "",
    ...stats.warnings.map((warning) => `- ${warning}`)
  ].filter((line, index, lines) => line || lines[index - 1]);

  if (!VERIFY_ONLY) {
    fs.writeFileSync(reportPath, `${reportLines.join("\n")}\n`);
  }

  if (APPLY && !VERIFY_ONLY) {
    d1ExecuteFile(path.relative(backendDir, sqlPath));
  }

  console.log(JSON.stringify({
    mode: VERIFY_ONLY ? "verify-only" : APPLY ? "apply" : "dry-run",
    reportPath,
    sqlPath,
    backupPath,
    stats,
    changedUsers: userReports.length,
    largestDeltas
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
