const GAMEDAYS_PER_WEEK = 7;

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

export function buildGamedayMeta(dayIndex: number) {
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

export function buildGamedayLookup<T>(games: T[], getDateKey: (game: T) => string) {
  const uniqueDateKeys = [...new Set(games.map((game) => getDateKey(game)).filter(Boolean))].sort();
  const lookup = new Map<string, ReturnType<typeof buildGamedayMeta> & { gamedayKey: string; gamedayDateLabel: string }>();

  uniqueDateKeys.forEach((dateKey, index) => {
    lookup.set(dateKey, {
      gamedayKey: dateKey,
      gamedayDateLabel: formatScheduleDateLabel(dateKey),
      ...buildGamedayMeta(index + 1)
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
        ...buildGamedayMeta(1)
      } as const);

    return {
      ...game,
      ...meta
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
