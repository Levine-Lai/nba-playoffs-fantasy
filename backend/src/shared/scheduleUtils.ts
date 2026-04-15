export function normalizeScheduleDateKey(dateInput: string | null | undefined) {
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

export function formatScheduleDateLabel(dateKey: string) {
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

function buildLegacyGamedayMeta(dayIndex: number) {
  const safeIndex = Math.max(1, Number(dayIndex) || 1);
  return {
    gamedayIndex: safeIndex,
    gameweekNumber: 1,
    gamedayNumber: safeIndex,
    gamedayLabel: `Gameweek1 Gameday${safeIndex}`
  };
}

export function buildGamedayLookup<T>(games: T[], getDateKey: (game: T) => string) {
  const uniqueDateKeys = [...new Set(games.map((game) => getDateKey(game)).filter(Boolean))].sort();
  const lookup = new Map<string, ReturnType<typeof buildLegacyGamedayMeta> & { gamedayKey: string; gamedayDateLabel: string }>();

  uniqueDateKeys.forEach((dateKey, index) => {
    lookup.set(dateKey, {
      gamedayKey: dateKey,
      gamedayDateLabel: formatScheduleDateLabel(dateKey),
      ...buildLegacyGamedayMeta(index + 1)
    });
  });

  return lookup;
}

export function annotateGamesWithGamedays<T extends Record<string, unknown>>(games: T[], getDateKey: (game: T) => string) {
  const lookup = buildGamedayLookup(games, getDateKey);

  return games.map((game) => {
    const gamedayKey = getDateKey(game);
    const meta =
      lookup.get(gamedayKey) ??
      ({
        gamedayKey,
        gamedayDateLabel: formatScheduleDateLabel(gamedayKey),
        ...buildLegacyGamedayMeta(1)
      } as const);

    return {
      ...game,
      ...meta
    };
  });
}

export function getPlayoffGameweekNumber(gameId: string | number | null | undefined) {
  const id = String(gameId ?? "");
  if (id.startsWith("005")) {
    return 0;
  }

  if (!id.startsWith("004") || id.length < 10) {
    return null;
  }

  const seriesCode = Number(id.slice(5, 8));
  if (seriesCode >= 1 && seriesCode <= 8) {
    return 1;
  }
  if (seriesCode >= 21 && seriesCode <= 24) {
    return 2;
  }
  if (seriesCode >= 31 && seriesCode <= 32) {
    return 3;
  }
  if (seriesCode === 41) {
    return 4;
  }

  return null;
}

function buildPlayoffGamedayLabel(gameweekNumber: number, gamedayNumber: number) {
  if (gameweekNumber === 0) {
    return `Play-In ${gamedayNumber}`;
  }

  return `Round ${gameweekNumber} Day ${gamedayNumber}`;
}

function buildPlayoffRoundLabel(gameweekNumber: number) {
  if (gameweekNumber === 0) {
    return "Play-In";
  }

  return `Round ${gameweekNumber}`;
}

function buildTransferWindowKey(gameweekNumber: number, gamedayNumber: number) {
  if (gameweekNumber === 0) {
    return `play-in-${gamedayNumber}`;
  }

  return `round-${gameweekNumber}`;
}

function toDeadlineIso(dateInput: string | null | undefined, leadMinutes = 30) {
  const date = new Date(dateInput ?? "");
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - leadMinutes * 60 * 1000).toISOString();
}

export interface PlayoffPeriod {
  key: string;
  label: string;
  roundLabel: string;
  roundNumber: number;
  dayNumber: number;
  deadline: string;
  gamedayIndex: number;
  gamedayKey: string;
  gamedayDateLabel: string;
  transferWindowKey: string;
  transferLimit: number;
}

function sortByDateInput<T extends { date?: string | null; gameDateTimeUTC?: string | null; gamedayKey?: string }>(left: T, right: T) {
  const leftTime = new Date(left.date ?? left.gameDateTimeUTC ?? `${left.gamedayKey ?? ""}T00:00:00Z`).getTime();
  const rightTime = new Date(right.date ?? right.gameDateTimeUTC ?? `${right.gamedayKey ?? ""}T00:00:00Z`).getTime();
  return leftTime - rightTime;
}

export function buildPlayoffPeriods<T extends { date?: string | null; gameDateTimeUTC?: string | null }>(
  games: T[],
  getDateKey: (game: T) => string,
  getGameId: (game: T) => string | number | null | undefined
) {
  const buckets = new Map<number, Array<{ dateKey: string; firstDate: string }>>();

  games.forEach((game) => {
    const roundNumber = getPlayoffGameweekNumber(getGameId(game));
    const dateKey = getDateKey(game);
    const firstDate = game.date ?? game.gameDateTimeUTC ?? "";
    if (roundNumber === null || !dateKey || !firstDate) {
      return;
    }

    const current = buckets.get(roundNumber) ?? [];
    if (!current.some((entry) => entry.dateKey === dateKey)) {
      current.push({ dateKey, firstDate });
      current.sort((left, right) => new Date(left.firstDate).getTime() - new Date(right.firstDate).getTime());
      buckets.set(roundNumber, current);
    }
  });

  const mainRoundNumbers = [...buckets.keys()].filter((value) => value > 0).sort((left, right) => left - right);
  const globalIndexByRoundDate = new Map<string, number>();
  let globalIndex = 1;

  mainRoundNumbers.forEach((roundNumber) => {
    const entries = buckets.get(roundNumber) ?? [];
    entries.forEach((entry) => {
      globalIndexByRoundDate.set(`${roundNumber}:${entry.dateKey}`, globalIndex);
      globalIndex += 1;
    });
  });

  const periods: PlayoffPeriod[] = [];
  [...buckets.entries()]
    .sort((left, right) => {
      const leftFirst = left[1][0]?.firstDate ?? "";
      const rightFirst = right[1][0]?.firstDate ?? "";
      return new Date(leftFirst).getTime() - new Date(rightFirst).getTime();
    })
    .forEach(([roundNumber, entries]) => {
      entries.forEach((entry, index) => {
        const dayNumber = index + 1;
        periods.push({
          key: `${roundNumber}:${entry.dateKey}`,
          label: buildPlayoffGamedayLabel(roundNumber, dayNumber),
          roundLabel: buildPlayoffRoundLabel(roundNumber),
          roundNumber,
          dayNumber,
          deadline: toDeadlineIso(entry.firstDate),
          gamedayIndex: roundNumber === 0 ? dayNumber : globalIndexByRoundDate.get(`${roundNumber}:${entry.dateKey}`) ?? 1,
          gamedayKey: entry.dateKey,
          gamedayDateLabel: formatScheduleDateLabel(entry.dateKey),
          transferWindowKey: buildTransferWindowKey(roundNumber, dayNumber),
          transferLimit: 3
        });
      });
    });

  return periods.sort((left, right) => new Date(left.deadline).getTime() - new Date(right.deadline).getTime());
}

export function annotateGamesWithPlayoffPeriods<T extends Record<string, unknown> & { date?: string | null; gameDateTimeUTC?: string | null }>(
  games: T[],
  getDateKey: (game: T) => string,
  getGameId: (game: T) => string | number | null | undefined
) {
  const periods = buildPlayoffPeriods(games, getDateKey, getGameId);
  const periodByKey = new Map(periods.map((period) => [period.key, period]));

  return games.map((game) => {
    const dateKey = getDateKey(game);
    const roundNumber = getPlayoffGameweekNumber(getGameId(game)) ?? 1;
    const period = periodByKey.get(`${roundNumber}:${dateKey}`);

    return {
      ...game,
      gamedayKey: dateKey,
      gamedayDateLabel: period?.gamedayDateLabel ?? formatScheduleDateLabel(dateKey),
      gamedayIndex: period?.gamedayIndex ?? 1,
      gameweekNumber: period?.roundNumber ?? roundNumber,
      gamedayNumber: period?.dayNumber ?? 1,
      gamedayLabel: period?.label ?? buildPlayoffGamedayLabel(roundNumber, 1)
    };
  });
}

export function findEditablePlayoffPeriod(periods: PlayoffPeriod[], now = Date.now()) {
  return periods.find((period) => new Date(period.deadline).getTime() > now) ?? periods[periods.length - 1] ?? null;
}

export function findScoringPlayoffPeriod(periods: PlayoffPeriod[], now = Date.now()) {
  const started = periods.filter((period) => new Date(period.deadline).getTime() <= now);
  return started[started.length - 1] ?? null;
}

export function annotateGamesWithPlayoffGamedays<T extends Record<string, unknown>>(
  games: T[],
  getDateKey: (game: T) => string,
  getGameId: (game: T) => string | number | null | undefined
) {
  return annotateGamesWithPlayoffPeriods(games as Array<T & { date?: string | null; gameDateTimeUTC?: string | null }>, getDateKey, getGameId);
}

export function findCurrentOrNextGameday<T extends { date?: string | null; gameDateTimeUTC?: string | null; gamedayKey?: string; status?: string }>(
  games: T[]
) {
  if (!games.length) {
    return null;
  }

  const sortedGames = [...games].sort((left, right) => {
    return sortByDateInput(left, right);
  });

  const unfinishedGames = sortedGames.filter((game) => game.status !== "final");
  const sourceGames = unfinishedGames.length ? unfinishedGames : sortedGames;
  const currentKey = sourceGames[0]?.gamedayKey;

  return currentKey ? sortedGames.find((game) => game.gamedayKey === currentKey) ?? null : null;
}

export function isPostseasonGameId(gameId: string | number | null | undefined) {
  const id = String(gameId ?? "");
  return id.startsWith("004") || id.startsWith("005");
}
