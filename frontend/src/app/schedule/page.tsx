"use client";

import Link from "next/link";
import { SyntheticEvent, useMemo, useState } from "react";
import { getSchedule } from "@/lib/api";
import { ScheduleGame, ScheduleResponse, TeamAsset } from "@/lib/types";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";

type CalendarCell = {
  key: string;
  day?: number;
  gamedayLabel?: string | null;
  games: ScheduleGame[];
};

type CalendarMonth = {
  key: string;
  label: string;
  weekdays: string[];
  cells: CalendarCell[];
};

type PlayoffGameMeta = {
  roundNumber: number;
  seriesCode: number;
  gameNumber: number;
  seriesKey: string;
};

function onLogoError(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
}

function getMonthDateParts(game: ScheduleGame) {
  if (game.gamedayKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(game.gamedayKey);
    if (match) {
      return {
        year: Number(match[1]),
        monthIndex: Number(match[2]) - 1,
        day: Number(match[3])
      };
    }
  }

  const parsed = new Date(game.date ?? "");
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return {
    year: parsed.getFullYear(),
    monthIndex: parsed.getMonth(),
    day: parsed.getDate()
  };
}

function getMonthLabel(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, monthIndex, 1));
}

function getTeamLogo(team?: TeamAsset) {
  return team?.logoUrl ?? team?.logoFallbackUrl ?? null;
}

function getWinnerTeamCode(game: ScheduleGame) {
  if (game.homeScore === null || game.homeScore === undefined || game.awayScore === null || game.awayScore === undefined) {
    return null;
  }

  if (game.homeScore === game.awayScore) {
    return null;
  }

  return game.homeScore > game.awayScore
    ? String(game.homeTeam?.triCode ?? game.homeTeam?.code ?? "")
    : String(game.awayTeam?.triCode ?? game.awayTeam?.code ?? "");
}

function parsePlayoffGameMeta(gameId: string): PlayoffGameMeta | null {
  const id = String(gameId ?? "");
  if (!/^004\d{7}$/.test(id)) {
    return null;
  }

  const seriesCode = Number(id.slice(5, 8));
  const gameNumber = Number(id.slice(8, 10));
  let roundNumber = 0;

  if (seriesCode >= 1 && seriesCode <= 8) {
    roundNumber = 1;
  } else if (seriesCode >= 21 && seriesCode <= 24) {
    roundNumber = 2;
  } else if (seriesCode >= 31 && seriesCode <= 32) {
    roundNumber = 3;
  } else if (seriesCode === 41) {
    roundNumber = 4;
  }

  if (!roundNumber || !gameNumber) {
    return null;
  }

  return {
    roundNumber,
    seriesCode,
    gameNumber,
    seriesKey: `${roundNumber}-${seriesCode}`
  };
}

function buildVisibleGames(games: ScheduleGame[]) {
  const seriesStates = new Map<
    string,
    {
      sideA: string;
      sideB: string;
      winsA: number;
      winsB: number;
    }
  >();

  const sortedGames = [...games].sort((left, right) => {
    const leftTime = new Date(left.date ?? 0).getTime();
    const rightTime = new Date(right.date ?? 0).getTime();
    return leftTime - rightTime;
  });

  for (const game of sortedGames) {
    const meta = parsePlayoffGameMeta(game.id);
    if (!meta || game.status !== "final") {
      continue;
    }

    const homeCode = String(game.homeTeam?.triCode ?? game.homeTeam?.code ?? "");
    const awayCode = String(game.awayTeam?.triCode ?? game.awayTeam?.code ?? "");
    const winnerCode = getWinnerTeamCode(game);
    if (!homeCode || !awayCode || !winnerCode) {
      continue;
    }

    const existing = seriesStates.get(meta.seriesKey) ?? {
      sideA: homeCode,
      sideB: awayCode,
      winsA: 0,
      winsB: 0
    };

    if (!existing.sideA) {
      existing.sideA = homeCode;
    }
    if (!existing.sideB && awayCode !== existing.sideA) {
      existing.sideB = awayCode;
    }

    if (winnerCode === existing.sideA) {
      existing.winsA += 1;
    } else if (winnerCode === existing.sideB) {
      existing.winsB += 1;
    }

    seriesStates.set(meta.seriesKey, existing);
  }

  return sortedGames.filter((game) => {
    const meta = parsePlayoffGameMeta(game.id);
    if (!meta) {
      return true;
    }

    if (game.status !== "upcoming") {
      return true;
    }

    const seriesState = seriesStates.get(meta.seriesKey);
    const guaranteedGames = 4 + Math.min(seriesState?.winsA ?? 0, seriesState?.winsB ?? 0);
    return meta.gameNumber <= guaranteedGames;
  });
}

function buildCalendarMonths(games: ScheduleGame[]) {
  const visibleGames = buildVisibleGames(games);
  const firstVisible = visibleGames.map(getMonthDateParts).find((entry): entry is NonNullable<ReturnType<typeof getMonthDateParts>> => Boolean(entry));
  const baseYear = firstVisible?.year ?? new Date().getFullYear();
  const targetMonths = [3, 4, 5];

  return targetMonths.map((monthIndex) => {
    const monthGames = visibleGames
      .map((game) => {
        const dateParts = getMonthDateParts(game);
        return dateParts ? { game, dateParts } : null;
      })
      .filter(
        (
          entry
        ): entry is {
          game: ScheduleGame;
          dateParts: { year: number; monthIndex: number; day: number };
        } => Boolean(entry)
      )
      .filter(({ dateParts }) => dateParts.year === baseYear && dateParts.monthIndex === monthIndex)
      .sort((left, right) => {
        if (left.dateParts.day !== right.dateParts.day) {
          return left.dateParts.day - right.dateParts.day;
        }

        return new Date(left.game.date ?? 0).getTime() - new Date(right.game.date ?? 0).getTime();
      });

    const monthStart = new Date(baseYear, monthIndex, 1);
    const daysInMonth = new Date(baseYear, monthIndex + 1, 0).getDate();
    const startOffset = (monthStart.getDay() + 6) % 7;
    const gamesByDay = new Map<number, ScheduleGame[]>();
    const gamedayLabelByDay = new Map<number, string>();

    monthGames.forEach(({ game, dateParts }) => {
      const dayGames = gamesByDay.get(dateParts.day) ?? [];
      dayGames.push(game);
      gamesByDay.set(dateParts.day, dayGames);

      if (!gamedayLabelByDay.has(dateParts.day) && game.gamedayLabel) {
        gamedayLabelByDay.set(dateParts.day, game.gamedayLabel);
      }
    });

    const cells: CalendarCell[] = [];

    for (let index = 0; index < startOffset; index += 1) {
      cells.push({ key: `${monthIndex}-blank-start-${index}`, games: [] });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        key: `${monthIndex}-day-${day}`,
        day,
        gamedayLabel: gamedayLabelByDay.get(day) ?? null,
        games: gamesByDay.get(day) ?? []
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ key: `${monthIndex}-blank-end-${cells.length}`, games: [] });
    }

    return {
      key: `${baseYear}-${monthIndex + 1}`,
      label: getMonthLabel(baseYear, monthIndex),
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      cells
    } satisfies CalendarMonth;
  });
}

function formatRoundGameLabel(game: ScheduleGame) {
  const meta = parsePlayoffGameMeta(game.id);
  if (!meta) {
    return game.stageLabel ?? "";
  }

  return `R${meta.roundNumber} G${meta.gameNumber}`;
}

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useVisibilityPolling(async () => {
    try {
      const payload = await getSchedule();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
    }
  }, 60000, []);

  const calendarMonths = useMemo(() => buildCalendarMonths(data?.games ?? []), [data]);

  if (!data && !error) {
    return <div className="panel panel-body">Loading schedule...</div>;
  }

  if (error || !data) {
    return (
      <section className="panel">
        <div className="panel-head">Access Required</div>
        <div className="panel-body space-y-3 text-sm text-slate-700">
          <p>{error ?? "Please log in first."}</p>
          <Link href="/" className="nba-button-blue">
            Back To Login
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">Schedule</div>
      <div className="panel-body space-y-4">
        <div className="rounded-sm border border-slate-200 p-3 text-center">
          <p className="text-4xl font-semibold uppercase">{data.gameweek}</p>
          <p className="text-sm text-slate-500">{data.deadline}</p>
        </div>

        {calendarMonths.map((month) => (
          <section key={month.key} className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-[#eef1f3] px-4 py-2 text-center">
              <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-slate-800">{month.label}</h2>
            </div>

            <div className="overflow-x-auto">
              <div className="schedule-calendar min-w-[760px]">
                <div className="schedule-calendar__weekdays">
                  {month.weekdays.map((weekday) => (
                    <div key={weekday} className="schedule-calendar__weekday">
                      {weekday}
                    </div>
                  ))}
                </div>

                <div className="schedule-calendar__grid">
                  {month.cells.map((cell) => (
                    <div
                      key={cell.key}
                      className={`schedule-calendar__cell ${cell.day ? "" : "schedule-calendar__cell--empty"}`.trim()}
                    >
                      {cell.day ? (
                        <>
                          <div className="schedule-calendar__cell-head">
                            <div className="schedule-calendar__day">{cell.day}</div>
                            {cell.gamedayLabel ? (
                              <div className="schedule-calendar__gameday">{cell.gamedayLabel}</div>
                            ) : null}
                          </div>

                          <div className="schedule-calendar__games">
                            {cell.games.map((game) => {
                              const homeLogo = getTeamLogo(game.homeTeam);
                              const awayLogo = getTeamLogo(game.awayTeam);
                              const hasScore =
                                game.homeScore !== null &&
                                game.homeScore !== undefined &&
                                game.awayScore !== null &&
                                game.awayScore !== undefined;

                              return (
                                <div key={game.id} className="schedule-calendar__game">
                                  <div className="schedule-calendar__matchup">
                                    {homeLogo ? (
                                      <img
                                        src={homeLogo}
                                        alt=""
                                        className="schedule-calendar__logo"
                                        onError={(event) => onLogoError(event, game.homeTeam?.logoFallbackUrl)}
                                      />
                                    ) : (
                                      <div className="schedule-calendar__logo schedule-calendar__logo--placeholder">
                                        {game.homeTeam?.triCode ?? "H"}
                                      </div>
                                    )}

                                    <div className="schedule-calendar__score-wrap">
                                      <span className="schedule-calendar__score">
                                        {hasScore ? `${game.homeScore}-${game.awayScore}` : "vs"}
                                      </span>
                                      <span className="schedule-calendar__meta">{formatRoundGameLabel(game)}</span>
                                    </div>

                                    {awayLogo ? (
                                      <img
                                        src={awayLogo}
                                        alt=""
                                        className="schedule-calendar__logo"
                                        onError={(event) => onLogoError(event, game.awayTeam?.logoFallbackUrl)}
                                      />
                                    ) : (
                                      <div className="schedule-calendar__logo schedule-calendar__logo--placeholder">
                                        {game.awayTeam?.triCode ?? "A"}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
