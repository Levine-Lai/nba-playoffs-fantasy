"use client";

import { Fragment } from "react";
import { useEffect, useState } from "react";
import CourtPlayerCard from "@/components/CourtPlayerCard";
import { getStandingPreview, getStandings } from "@/lib/api";
import { Player, PointsResponse, StandingResponse } from "@/lib/types";

function RankTrend({ rank, previousRank }: { rank: number; previousRank: number }) {
  const diff = previousRank - rank;

  if (diff > 0) {
    return <span className="ml-2 inline-block h-0 w-0 border-x-[6px] border-b-[8px] border-x-transparent border-b-[#31c7c6]" />;
  }

  if (diff < 0) {
    return <span className="ml-2 inline-block h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-[#d61f43]" />;
  }

  return <span className="ml-2 inline-block text-slate-400">-</span>;
}

export default function StandingPage() {
  const [data, setData] = useState<StandingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState("overall");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedPointsByUserId, setExpandedPointsByUserId] = useState<Record<string, PointsResponse>>({});
  const [expandedLoadingUserId, setExpandedLoadingUserId] = useState<string | null>(null);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  useEffect(() => {
    setExpandedUserId(null);
    setExpandedError(null);
    getStandings(selectedPhase)
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load standings."));
  }, [selectedPhase]);

  async function toggleExpandedUser(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setExpandedError(null);
      return;
    }

    setExpandedUserId(userId);
    setExpandedError(null);

    if (expandedPointsByUserId[userId]) {
      return;
    }

    setExpandedLoadingUserId(userId);
    try {
      const payload = await getStandingPreview(userId);
      setExpandedPointsByUserId((current) => ({
        ...current,
        [userId]: payload
      }));
    } catch (nextError) {
      setExpandedError(nextError instanceof Error ? nextError.message : "Failed to load lineup.");
    } finally {
      setExpandedLoadingUserId((current) => (current === userId ? null : current));
    }
  }

  if (!data && !error) {
    return <div className="panel panel-body">Loading standings...</div>;
  }

  if (error || !data) {
    return (
      <section className="panel">
        <div className="panel-head">Access Required</div>
        <div className="panel-body space-y-3 text-sm text-slate-700">
          <p>{error ?? "Please log in first."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="bg-white px-6 py-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-[3rem] font-semibold italic leading-none text-[#111]">Standing</h1>
            <p className="mt-3 text-[1.05rem] text-slate-700">All registered players ranked by fantasy points.</p>
          </div>

          <div className="w-full max-w-[210px]">
            <label className="block text-sm text-slate-700">
              <span className="mb-2 block">Select phase</span>
              <select
                value={data.selectedPhaseKey ?? selectedPhase}
                onChange={(event) => setSelectedPhase(event.target.value)}
                className="w-full rounded-sm border border-slate-200 px-4 py-3 text-[1rem]"
              >
                {data.phaseOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="panel-body overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>PTS</th>
              <th>TOT</th>
            </tr>
          </thead>
          <tbody>
            {data.members.length ? (
              data.members.map((member) => {
                const expandedData = expandedPointsByUserId[member.userId] ?? null;
                const isExpanded = expandedUserId === member.userId;
                const starterFrontCourt = expandedData ? expandedData.lineup.starters.filter((player) => player.position === "FC") : ([] as Player[]);
                const starterBackCourt = expandedData ? expandedData.lineup.starters.filter((player) => player.position === "BC") : ([] as Player[]);

                return (
                  <Fragment key={member.userId}>
                    <tr>
                      <td>
                        <div className="flex items-center">
                          <span>{member.rank}</span>
                          <RankTrend rank={member.rank} previousRank={member.previousRank ?? member.rank} />
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => void toggleExpandedUser(member.userId)}
                          className="font-semibold text-[#0a3c98] hover:underline"
                        >
                          {member.gameId}
                        </button>
                      </td>
                      <td>{Number(member.phasePoints ?? member.gamedayPoints ?? 0).toFixed(1)}</td>
                      <td>{Number(member.totalPoints ?? 0).toFixed(1)}</td>
                    </tr>

                    {isExpanded ? (
                      <tr>
                        <td colSpan={4} className="bg-[#f7f9fb] px-4 py-5">
                          {expandedLoadingUserId === member.userId && !expandedData ? (
                            <div className="rounded border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">Loading lineup...</div>
                          ) : expandedError && !expandedData ? (
                            <div className="rounded border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">{expandedError}</div>
                          ) : expandedData ? (
                            <div className="space-y-4">
                              <section className="rounded border border-slate-200 bg-white">
                                <div className="panel-body space-y-4">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <h2 className="text-2xl font-semibold uppercase">{expandedData.gameweek.label}</h2>
                                      {expandedData.viewer ? (
                                        <p className="mt-2 text-sm text-slate-600">
                                          {expandedData.viewer.teamName} · {expandedData.viewer.managerName}
                                        </p>
                                      ) : null}
                                    </div>
                                    <p className="text-sm text-slate-600">Inline lineup preview</p>
                                  </div>

                                  {expandedData.message ? <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{expandedData.message}</p> : null}

                                  <div className="grid gap-3 sm:grid-cols-3">
                                    <article className="nba-stat-card">
                                      <p className="text-sm">Average GD Pts</p>
                                      <p className="text-5xl font-semibold">{expandedData.summary.average}</p>
                                    </article>
                                    <article className="nba-stat-card">
                                      <p className="text-sm">Final GD Points</p>
                                      <p className="text-5xl font-semibold">{expandedData.summary.final}</p>
                                    </article>
                                    <article className="nba-stat-card">
                                      <p className="text-sm">Top GD Points</p>
                                      <p className="text-5xl font-semibold">{expandedData.summary.top}</p>
                                    </article>
                                  </div>
                                </div>
                              </section>

                              <section className="panel overflow-hidden">
                                <div className="bg-[#d7dde3] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#111]">Starting 5</div>
                                <div className="court-formation">
                                  <div className="court-row court-row--top">
                                    {starterFrontCourt.map((player) => (
                                      <div key={player.id} className="court-slot">
                                        <CourtPlayerCard player={player} captain={expandedData.lineup.captainId === player.id} showPoints />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="court-row court-row--bottom">
                                    {starterBackCourt.map((player) => (
                                      <div key={player.id} className="court-slot">
                                        <CourtPlayerCard player={player} captain={expandedData.lineup.captainId === player.id} showPoints />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </section>

                              <section className="panel overflow-hidden">
                                <div className="bg-[#d7dde3] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#111]">Bench</div>
                                <div className="panel-body">
                                  <div className="court-bench">
                                    {expandedData.lineup.bench.map((player) => (
                                      <div key={player.id} className="court-slot">
                                        <CourtPlayerCard player={player} compact showPoints captain={expandedData.lineup.captainId === player.id} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </section>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-slate-600">
                  No registered players yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
