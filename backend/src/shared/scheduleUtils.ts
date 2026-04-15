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
    return `Play-In Gameday${gamedayNumber}`;
  }

  return `Gameweek${gameweekNumber} Gameday${gamedayNumber}`;
}

export function annotateGamesWithPlayoffGamedays<T extends Record<string, unknown>>(
  games: T[],
  getDateKey: (game: T) => string,
  getGameId: (game: T) => string | number | null | undefined
) {
  const dateKeysByGameweek = new Map<number, string[]>();

  games.forEach((game) => {
    const dateKey = getDateKey(game);
    const gameweekNumber = getPlayoffGameweekNumber(getGameId(game));
    if (!dateKey || gameweekNumber === null) {
      return;
    }

    const current = dateKeysByGameweek.get(gameweekNumber) ?? [];
    if (!current.includes(dateKey)) {
      current.push(dateKey);
      current.sort();
      dateKeysByGameweek.set(gameweekNumber, current);
    }
  });

  const mainGameweekNumbers = [...dateKeysByGameweek.keys()].filter((value) => value > 0).sort((left, right) => left - right);
  const globalIndexByRoundDate = new Map<string, number>();
  let globalIndex = 1;

  mainGameweekNumbers.forEach((gameweekNumber) => {
    const dateKeys = dateKeysByGameweek.get(gameweekNumber) ?? [];
    dateKeys.forEach((dateKey) => {
      globalIndexByRoundDate.set(`${gameweekNumber}:${dateKey}`, globalIndex);
      globalIndex += 1;
    });
  });

  return games.map((game) => {
    const dateKey = getDateKey(game);
    const gameweekNumber = getPlayoffGameweekNumber(getGameId(game));
    const dateKeys = gameweekNumber === null ? [] : dateKeysByGameweek.get(gameweekNumber) ?? [];
    const gamedayNumber = Math.max(1, dateKeys.indexOf(dateKey) + 1);
    const gamedayIndex =
      gameweekNumber === null
        ? 1
        : gameweekNumber === 0
          ? gamedayNumber
          : globalIndexByRoundDate.get(`${gameweekNumber}:${dateKey}`) ?? 1;

    return {
      ...game,
      gamedayKey: dateKey,
      gamedayDateLabel: formatScheduleDateLabel(dateKey),
      gamedayIndex,
      gameweekNumber: gameweekNumber ?? 1,
      gamedayNumber,
      gamedayLabel: buildPlayoffGamedayLabel(gameweekNumber ?? 1, gamedayNumber)
    };
  });
}

export function findCurrentOrNextGameday<T extends { date?: string | null; gameDateTimeUTC?: string | null; gamedayKey?: string; status?: string }>(
  games: T[]
) {
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

export function isPostseasonGameId(gameId: string | number | null | undefined) {
  const id = String(gameId ?? "");
  return id.startsWith("004") || id.startsWith("005");
}
