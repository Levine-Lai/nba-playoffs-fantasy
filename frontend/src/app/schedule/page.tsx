"use client";

import Link from "next/link";
import { SyntheticEvent, useMemo, useState } from "react";
import { getSchedule, getScheduleGameDetail } from "@/lib/api";
import { formatFantasyPoints } from "@/lib/formatFantasyPoints";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";
import { ScheduleGame, ScheduleGameDetailResponse, ScheduleResponse, TeamAsset } from "@/lib/types";

interface PlayoffSeriesTeam {
  key: string;
  name: string;
  triCode: string;
  logoUrl?: string | null;
  logoFallbackUrl?: string | null;
}

interface PlayoffSeriesEntry {
  round: number;
  seriesCode: number;
  topTeam: PlayoffSeriesTeam | null;
  bottomTeam: PlayoffSeriesTeam | null;
  topWins: number;
  bottomWins: number;
}

const PLAYOFF_BRACKET_LAYOUT = [
  { round: 1, title: "Round 1", seriesCodes: [10, 11, 12, 13, 14, 15, 16, 17] },
  { round: 2, title: "Round 2", seriesCodes: [20, 21, 22, 23] },
  { round: 3, title: "Round 3", seriesCodes: [30, 31] },
  { round: 4, title: "Finals", seriesCodes: [40] }
] as const;

function onLogoError(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
}

function getGameLocalDate(dateInput: string) {
  const parsed = new Date(dateInput ?? "");
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getTeamLogo(team?: TeamAsset) {
  return team?.logoUrl ?? team?.logoFallbackUrl ?? null;
}

function getGamedayBadge(label?: string | null) {
  const match = String(label ?? "").match(/day\s*(\d+)/i);
  return match ? `Day${match[1]}` : "";
}

function getPlayoffSeriesMeta(gameId?: string | null) {
  const id = String(gameId ?? "");
  if (!/^004\d+/.test(id) || id.length < 10) {
    return null;
  }

  const seriesCode = Number(id.slice(7, 9));
  const gameNumber = Number(id.slice(-1));

  if (!Number.isFinite(seriesCode) || !Number.isFinite(gameNumber) || gameNumber <= 0) {
    return null;
  }

  if (seriesCode >= 10 && seriesCode <= 17) {
    return { round: 1, seriesCode, gameNumber };
  }
  if (seriesCode >= 20 && seriesCode <= 23) {
    return { round: 2, seriesCode, gameNumber };
  }
  if (seriesCode >= 30 && seriesCode <= 31) {
    return { round: 3, seriesCode, gameNumber };
  }
  if (seriesCode === 40) {
    return { round: 4, seriesCode, gameNumber };
  }

  return { round: 0, seriesCode, gameNumber };
}

function getPlayoffRoundGameBadge(gameId?: string | null) {
  const seriesMeta = getPlayoffSeriesMeta(gameId);
  if (!seriesMeta) {
    return "";
  }

  if (seriesMeta.round > 0) {
    return `R${seriesMeta.round}G${seriesMeta.gameNumber}`;
  }

  return `G${seriesMeta.gameNumber}`;
}

function getSeriesTeamKey(name?: string | null, team?: TeamAsset) {
  return String(team?.triCode ?? team?.code ?? name ?? "").trim().toUpperCase();
}

function createSeriesTeam(name?: string | null, team?: TeamAsset): PlayoffSeriesTeam | null {
  const key = getSeriesTeamKey(name, team);
  if (!key) {
    return null;
  }

  return {
    key,
    name: name ?? team?.name ?? key,
    triCode: team?.triCode ?? team?.code ?? key,
    logoUrl: team?.logoUrl ?? null,
    logoFallbackUrl: team?.logoFallbackUrl ?? null
  };
}

function assignSeriesTeam(
  series: PlayoffSeriesEntry,
  preferredSlot: "topTeam" | "bottomTeam",
  candidate: PlayoffSeriesTeam | null
) {
  if (!candidate) {
    return;
  }

  if (series.topTeam?.key === candidate.key || series.bottomTeam?.key === candidate.key) {
    return;
  }

  if (!series[preferredSlot]) {
    series[preferredSlot] = candidate;
    return;
  }

  const fallbackSlot = preferredSlot === "topTeam" ? "bottomTeam" : "topTeam";
  if (!series[fallbackSlot]) {
    series[fallbackSlot] = candidate;
  }
}

function buildMonthCalendar(games: ScheduleGame[], year: number, monthIndex: number) {
  const monthGames = games
    .map((game) => {
      const localDate = getGameLocalDate(game.date);
      return localDate ? { game, localDate } : null;
    })
    .filter((entry): entry is { game: ScheduleGame; localDate: Date } => Boolean(entry))
    .filter(({ localDate }) => localDate.getFullYear() === year && localDate.getMonth() === monthIndex)
    .sort((left, right) => left.localDate.getTime() - right.localDate.getTime());

  const monthStart = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gamesByDay = new Map<number, ScheduleGame[]>();

  monthGames.forEach(({ game, localDate }) => {
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

  const weeks: Array<Array<{ key: string; day?: number; games: ScheduleGame[] }>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  const trimmedWeeks = weeks.filter((week) => week.some((cell) => cell.games.length > 0));

  return {
    label: monthStart.toLocaleString("en-US", { month: "long" }),
    year,
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    cells: trimmedWeeks.flat()
  };
}

function buildPlayoffBracket(games: ScheduleGame[]) {
  const playoffGames = [...games]
    .filter((game) => Boolean(getPlayoffSeriesMeta(game.id)))
    .sort((left, right) => {
      const leftDate = getGameLocalDate(left.date)?.getTime() ?? 0;
      const rightDate = getGameLocalDate(right.date)?.getTime() ?? 0;
      return leftDate - rightDate;
    });
  const seriesMap = new Map<string, PlayoffSeriesEntry>();

  playoffGames.forEach((game) => {
    const seriesMeta = getPlayoffSeriesMeta(game.id);
    if (!seriesMeta) {
      return;
    }

    const seriesKey = `${seriesMeta.round}-${seriesMeta.seriesCode}`;
    const entry =
      seriesMap.get(seriesKey) ??
      {
        round: seriesMeta.round,
        seriesCode: seriesMeta.seriesCode,
        topTeam: null,
        bottomTeam: null,
        topWins: 0,
        bottomWins: 0
      };
    const awayTeam = createSeriesTeam(game.away, game.awayTeam);
    const homeTeam = createSeriesTeam(game.home, game.homeTeam);

    assignSeriesTeam(entry, "topTeam", awayTeam);
    assignSeriesTeam(entry, "bottomTeam", homeTeam);

    if (
      game.status === "final" &&
      game.awayScore !== null &&
      game.awayScore !== undefined &&
      game.homeScore !== null &&
      game.homeScore !== undefined &&
      game.awayScore !== game.homeScore
    ) {
      const winningKey = game.awayScore > game.homeScore ? awayTeam?.key : homeTeam?.key;
      if (winningKey && entry.topTeam?.key === winningKey) {
        entry.topWins += 1;
      } else if (winningKey && entry.bottomTeam?.key === winningKey) {
        entry.bottomWins += 1;
      }
    }

    seriesMap.set(seriesKey, entry);
  });

  return PLAYOFF_BRACKET_LAYOUT.map((round) => ({
    ...round,
    series: round.seriesCodes.map((seriesCode) => {
      const series =
        seriesMap.get(`${round.round}-${seriesCode}`) ??
        {
          round: round.round,
          seriesCode,
          topTeam: null,
          bottomTeam: null,
          topWins: 0,
          bottomWins: 0
        };

      return {
        ...series,
        scoreLabel: `${series.topWins}-${series.bottomWins}`
      };
    })
  }));
}

function formatStatValue(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return "0";
  }

  return String(Math.round(numeric));
}

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedGameDetail, setSelectedGameDetail] = useState<ScheduleGameDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useVisibilityPolling(async () => {
    try {
      const payload = await getSchedule();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
    }
  }, 60000, []);

  const monthCalendars = useMemo(() => {
    const games = data?.games ?? [];
    const firstScheduledGame = games
      .map((game) => getGameLocalDate(game.date))
      .find((date): date is Date => Boolean(date));
    const year = firstScheduledGame?.getFullYear() ?? new Date().getFullYear();

    return [3, 4, 5].map((monthIndex) => buildMonthCalendar(games, year, monthIndex));
  }, [data]);

  const playoffBracket = useMemo(() => buildPlayoffBracket(data?.games ?? []), [data]);
  const isGameDetailOpen = Boolean(selectedGameId);

  async function openGameDetail(gameId: string) {
    setSelectedGameId(gameId);
    setSelectedGameDetail(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const payload = await getScheduleGameDetail(gameId);
      setSelectedGameDetail(payload);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load game details.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeGameDetail() {
    setSelectedGameId(null);
    setSelectedGameDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }

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

        {monthCalendars.map((calendar) => (
          <section key={`${calendar.year}-${calendar.label}`} className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-[#eef1f3] px-4 py-2 text-center">
              <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-slate-800">
                {calendar.label} {calendar.year}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <div className="schedule-calendar min-w-[760px]">
                <div className="schedule-calendar__weekdays">
                  {calendar.weekdays.map((weekday) => (
                    <div key={weekday} className="schedule-calendar__weekday">
                      {weekday}
                    </div>
                  ))}
                </div>

                <div className="schedule-calendar__grid">
                  {calendar.cells.map((cell) => (
                    <div
                      key={cell.key}
                      className={`schedule-calendar__cell ${cell.day ? "" : "schedule-calendar__cell--empty"}`.trim()}
                    >
                      {cell.day ? (
                        <>
                          <div className="schedule-calendar__cell-head">
                            <div className="schedule-calendar__day">{cell.day}</div>
                            {cell.games[0]?.gamedayLabel ? (
                              <div className="schedule-calendar__gameday">{getGamedayBadge(cell.games[0].gamedayLabel)}</div>
                            ) : null}
                          </div>
                          <div className="schedule-calendar__games">
                            {cell.games.map((game) => {
                              const awayLogo = getTeamLogo(game.awayTeam);
                              const homeLogo = getTeamLogo(game.homeTeam);
                              const hasScore =
                                game.homeScore !== null &&
                                game.homeScore !== undefined &&
                                game.awayScore !== null &&
                                game.awayScore !== undefined;
                              const roundGameBadge = getPlayoffRoundGameBadge(game.id);
                              const awayResultClass =
                                hasScore && game.status === "final"
                                  ? game.awayScore! > game.homeScore!
                                    ? "schedule-calendar__side--win"
                                    : game.awayScore! < game.homeScore!
                                      ? "schedule-calendar__side--loss"
                                      : ""
                                  : "";
                              const homeResultClass =
                                hasScore && game.status === "final"
                                  ? game.homeScore! > game.awayScore!
                                    ? "schedule-calendar__side--win"
                                    : game.homeScore! < game.awayScore!
                                      ? "schedule-calendar__side--loss"
                                      : ""
                                  : "";

                              return (
                                <div key={game.id} className="schedule-calendar__game">
                                  <button
                                    type="button"
                                    className="schedule-calendar__game-trigger"
                                    onClick={() => void openGameDetail(game.id)}
                                  >
                                    <div className="schedule-calendar__matchup">
                                      <div className={`schedule-calendar__side ${awayResultClass}`.trim()}>
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
                                      <div className="schedule-calendar__score-wrap">
                                        <span className="schedule-calendar__score">
                                          {hasScore ? `${game.awayScore}-${game.homeScore}` : "vs"}
                                        </span>
                                        {roundGameBadge ? <span className="schedule-calendar__meta">{roundGameBadge}</span> : null}
                                      </div>
                                      <div className={`schedule-calendar__side ${homeResultClass}`.trim()}>
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
                                      </div>
                                    </div>
                                  </button>
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

        <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-[#eef1f3] px-4 py-2 text-center">
            <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-slate-800">Playoff Path</h2>
          </div>

          <div className="overflow-x-auto">
            <div className="playoff-bracket min-w-[1080px] p-4">
              {playoffBracket.map((round, roundIndex) => (
                <div key={round.title} className="playoff-bracket__round">
                  <div className="playoff-bracket__round-head">{round.title}</div>
                  <div className={`playoff-bracket__round-body playoff-bracket__round-body--r${round.round}`}>
                    {round.series.map((series) => {
                      const topLogo = getTeamLogo(series.topTeam ?? undefined);
                      const bottomLogo = getTeamLogo(series.bottomTeam ?? undefined);
                      const topIsLeading = series.topWins > series.bottomWins;
                      const bottomIsLeading = series.bottomWins > series.topWins;

                      return (
                        <div
                          key={`${series.round}-${series.seriesCode}`}
                          className={`playoff-bracket__slot ${roundIndex < playoffBracket.length - 1 ? "playoff-bracket__slot--linked" : ""}`.trim()}
                        >
                          <div className="playoff-bracket__series">
                            <div className={`playoff-bracket__team-row ${topIsLeading ? "playoff-bracket__team-row--leading" : ""}`.trim()}>
                              <div className="playoff-bracket__team-main">
                                {topLogo ? (
                                  <img
                                    src={topLogo}
                                    alt=""
                                    className="playoff-bracket__logo"
                                    onError={(event) => onLogoError(event, series.topTeam?.logoFallbackUrl)}
                                  />
                                ) : (
                                  <div className="playoff-bracket__logo playoff-bracket__logo--placeholder">
                                    {series.topTeam?.triCode ?? "TBD"}
                                  </div>
                                )}
                                <span className="playoff-bracket__team-code">{series.topTeam?.triCode ?? "TBD"}</span>
                              </div>
                              <span className="playoff-bracket__team-wins">{series.topWins}</span>
                            </div>

                            <div className="playoff-bracket__series-score">{series.scoreLabel}</div>

                            <div className={`playoff-bracket__team-row ${bottomIsLeading ? "playoff-bracket__team-row--leading" : ""}`.trim()}>
                              <div className="playoff-bracket__team-main">
                                {bottomLogo ? (
                                  <img
                                    src={bottomLogo}
                                    alt=""
                                    className="playoff-bracket__logo"
                                    onError={(event) => onLogoError(event, series.bottomTeam?.logoFallbackUrl)}
                                  />
                                ) : (
                                  <div className="playoff-bracket__logo playoff-bracket__logo--placeholder">
                                    {series.bottomTeam?.triCode ?? "TBD"}
                                  </div>
                                )}
                                <span className="playoff-bracket__team-code">{series.bottomTeam?.triCode ?? "TBD"}</span>
                              </div>
                              <span className="playoff-bracket__team-wins">{series.bottomWins}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {isGameDetailOpen ? (
        <div className="schedule-game-modal-overlay">
          <div className="schedule-game-modal">
            <div className="schedule-game-modal__head">
              <div>
                <h2 className="schedule-game-modal__title">{selectedGameDetail?.title ?? "Loading game..."}</h2>
                {selectedGameDetail ? (
                  <p className="schedule-game-modal__meta">
                    {selectedGameDetail.statusText}
                    {selectedGameDetail.stageLabel ? `  ${selectedGameDetail.stageLabel}` : ""}
                  </p>
                ) : null}
              </div>
              <button type="button" className="schedule-game-modal__close" onClick={closeGameDetail}>
                X
              </button>
            </div>

            <div className="schedule-game-modal__body">
              {detailLoading ? <div className="panel-body text-sm text-slate-600">Loading game details...</div> : null}
              {detailError ? <div className="panel-body text-sm text-slate-600">{detailError}</div> : null}

              {selectedGameDetail ? (
                <div className="schedule-game-modal__tables">
                  {[selectedGameDetail.away, selectedGameDetail.home].map((teamDetail) => {
                    const logo = getTeamLogo(teamDetail.team);

                    return (
                      <section key={teamDetail.team.triCode ?? teamDetail.name} className="schedule-game-modal__team">
                        <div className="schedule-game-modal__team-head">
                          <div className="schedule-game-modal__team-title">
                            {logo ? (
                              <img
                                src={logo}
                                alt=""
                                className="schedule-game-modal__team-logo"
                                onError={(event) => onLogoError(event, teamDetail.team.logoFallbackUrl)}
                              />
                            ) : (
                              <div className="schedule-game-modal__team-logo schedule-game-modal__team-logo--placeholder">
                                {teamDetail.team.triCode ?? "TBD"}
                              </div>
                            )}
                            <span>{teamDetail.name}</span>
                          </div>
                          <span className="schedule-game-modal__team-score">
                            {teamDetail.score !== null && teamDetail.score !== undefined ? formatStatValue(teamDetail.score) : "-"}
                          </span>
                        </div>

                        <div className="schedule-game-modal__team-table">
                          <table className="table-shell">
                            <thead>
                              <tr>
                                <th>Player</th>
                                <th>PTS</th>
                                <th>REB</th>
                                <th>AST</th>
                                <th>STL</th>
                                <th>BLK</th>
                                <th>TOV</th>
                                <th>Fantasy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {teamDetail.players.length ? (
                                teamDetail.players.map((player) => (
                                  <tr key={player.playerId || player.name}>
                                    <td>{player.name}</td>
                                    <td>{formatStatValue(player.pts)}</td>
                                    <td>{formatStatValue(player.reb)}</td>
                                    <td>{formatStatValue(player.ast)}</td>
                                    <td>{formatStatValue(player.stl)}</td>
                                    <td>{formatStatValue(player.blk)}</td>
                                    <td>{formatStatValue(player.tov)}</td>
                                    <td className="schedule-game-modal__fantasy">{formatFantasyPoints(player.fantasy)}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={8} className="schedule-game-modal__empty">
                                    -
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
