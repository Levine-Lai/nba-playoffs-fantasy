"use client";

import Link from "next/link";
import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { getSchedule } from "@/lib/api";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";
import { ScheduleGame, ScheduleResponse, TeamAsset } from "@/lib/types";

function onLogoError(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
}

function TeamLabel({ team, align = "left" }: { team?: TeamAsset; align?: "left" | "right" }) {
  const logoUrl = team?.logoUrl ?? team?.logoFallbackUrl;
  const baseAlignment = align === "right" ? "md:justify-end" : "md:justify-start";
  const textAlignment = align === "right" ? "md:text-right" : "md:text-left";

  return (
    <div className={`flex items-center justify-center gap-3 ${baseAlignment}`}>
      {align === "left" && logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-9 w-9 object-contain sm:h-10 sm:w-10"
          onError={(event) => onLogoError(event, team?.logoFallbackUrl)}
        />
      ) : null}
      <p className={`text-center text-base font-semibold ${textAlignment}`}>{team?.name ?? "TBD"}</p>
      {align === "right" && logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-9 w-9 object-contain sm:h-10 sm:w-10"
          onError={(event) => onLogoError(event, team?.logoFallbackUrl)}
        />
      ) : null}
    </div>
  );
}

function getGameLocalDate(dateInput: string) {
  const parsed = new Date(dateInput ?? "");
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getTeamLogo(team?: TeamAsset) {
  return team?.logoUrl ?? team?.logoFallbackUrl ?? null;
}

function formatLocalTipoff(dateInput: string, fallback: string, withZone = false) {
  const date = new Date(dateInput ?? "");
  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(withZone ? { timeZoneName: "short" } : {})
  }).format(date);
}

function MatchCenter({
  date,
  tipoff,
  status,
  homeScore,
  awayScore,
  stageLabel
}: {
  date: string;
  tipoff: string;
  status: "upcoming" | "live" | "final";
  homeScore?: number | null;
  awayScore?: number | null;
  stageLabel?: string;
}) {
  const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined;
  const localTipoff = formatLocalTipoff(date, tipoff);
  const localTipoffWithZone = formatLocalTipoff(date, tipoff, true);

  return (
    <div className="text-center">
      {hasScore ? (
        <div className="inline-flex min-w-[110px] items-center justify-center rounded border border-brand-blue px-3 py-1 text-2xl font-semibold text-brand-blue">
          {homeScore} - {awayScore}
        </div>
      ) : (
        <div className="inline-block rounded border border-brand-blue px-3 py-1 text-2xl font-semibold text-brand-blue">{localTipoff}</div>
      )}
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{localTipoffWithZone}</p>
      {stageLabel ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{stageLabel}</p> : null}
      {status === "live" ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#d61f43]">Live</p> : null}
      {status === "final" ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Final</p> : null}
    </div>
  );
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

  const grouped = useMemo(() => {
    if (!data) {
      return [] as Array<{ key: string; label: string; dateLabel: string; games: ScheduleResponse["games"] }>;
    }

    const map = new Map<string, { key: string; label: string; dateLabel: string; games: ScheduleResponse["games"] }>();
    data.games.forEach((game) => {
      const key = game.gamedayKey ?? String(game.date).slice(0, 10);
      const existing = map.get(key) ?? {
        key,
        label: game.gamedayLabel ?? data.gameweek,
        dateLabel: game.gamedayDateLabel ?? new Date(game.date).toDateString(),
        games: []
      };

      existing.games.push(game);
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((left, right) => left.key.localeCompare(right.key));
  }, [data]);

  const aprilCalendar = useMemo(() => {
    if (!data) {
      return null;
    }

    const aprilGames = data.games
      .map((game) => {
        const localDate = getGameLocalDate(game.date);
        return localDate ? { game, localDate } : null;
      })
      .filter((entry): entry is { game: ScheduleGame; localDate: Date } => Boolean(entry))
      .filter(({ localDate }) => localDate.getMonth() === 3)
      .sort((left, right) => left.localDate.getTime() - right.localDate.getTime());

    if (!aprilGames.length) {
      return null;
    }

    const year = aprilGames[0].localDate.getFullYear();
    const monthStart = new Date(year, 3, 1);
    const daysInMonth = new Date(year, 4, 0).getDate();
    const startOffset = (monthStart.getDay() + 6) % 7;
    const gamesByDay = new Map<number, ScheduleGame[]>();

    aprilGames.forEach(({ game, localDate }) => {
      const day = localDate.getDate();
      const existing = gamesByDay.get(day) ?? [];
      existing.push(game);
      gamesByDay.set(day, existing);
    });

    const cells: Array<{ key: string; day?: number; games: ScheduleGame[] }> = [];

    for (let index = 0; index < startOffset; index += 1) {
      cells.push({ key: `blank-start-${index}`, games: [] });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        key: `day-${day}`,
        day,
        games: gamesByDay.get(day) ?? []
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ key: `blank-end-${cells.length}`, games: [] });
    }

    return {
      label: "April",
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      cells
    };
  }, [data]);

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

        {grouped.map((group) => (
          <section key={group.key} className="overflow-hidden rounded-sm border border-slate-200">
            <div className="border-b border-slate-200 bg-[#eef1f3] px-4 py-2 text-center">
              <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-slate-800">{group.label}</h2>
              <p className="mt-1 text-xs text-slate-500">{group.dateLabel}</p>
            </div>

            <div className="divide-y divide-slate-200 bg-white">
              {group.games.map((game) => (
                <article key={game.id} className="grid items-center gap-2 px-4 py-3 md:grid-cols-[1fr_120px_1fr]">
                  <TeamLabel team={game.homeTeam ?? { name: game.home }} />
                  <MatchCenter
                    date={game.date}
                    tipoff={game.tipoff}
                    status={game.status}
                    homeScore={game.homeScore}
                    awayScore={game.awayScore}
                    stageLabel={game.stageLabel}
                  />
                  <TeamLabel team={game.awayTeam ?? { name: game.away }} align="right" />
                </article>
              ))}
            </div>
          </section>
        ))}

        {aprilCalendar ? (
          <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-[#eef1f3] px-4 py-2 text-center">
              <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-slate-800">{aprilCalendar.label}</h2>
            </div>

            <div className="overflow-x-auto">
              <div className="schedule-calendar min-w-[760px]">
                <div className="schedule-calendar__weekdays">
                  {aprilCalendar.weekdays.map((weekday) => (
                    <div key={weekday} className="schedule-calendar__weekday">
                      {weekday}
                    </div>
                  ))}
                </div>

                <div className="schedule-calendar__grid">
                  {aprilCalendar.cells.map((cell) => (
                    <div
                      key={cell.key}
                      className={`schedule-calendar__cell ${cell.day ? "" : "schedule-calendar__cell--empty"}`.trim()}
                    >
                      {cell.day ? (
                        <>
                          <div className="schedule-calendar__day">{cell.day}</div>
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
                                  <span className="schedule-calendar__score">
                                    {hasScore ? `${game.homeScore}-${game.awayScore}` : "vs"}
                                  </span>
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
        ) : null}
      </div>
    </div>
  );
}
