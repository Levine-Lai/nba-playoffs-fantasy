"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStandings } from "@/lib/api";
import { AuthUser, StandingResponse } from "@/lib/types";
import { formatFantasyPoints } from "@/lib/formatFantasyPoints";
import { getDisplayTeamName } from "@/lib/teamName";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadStandings = async () => {
    try {
      const payload = await getStandings(selectedPhase);
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load standings.");
    }
  };

  useEffect(() => {
    const rawUser = window.localStorage.getItem("playoff_user");
    if (!rawUser) {
      setCurrentUserId(null);
      return;
    }

    try {
      const parsedUser = JSON.parse(rawUser) as AuthUser;
      setCurrentUserId(parsedUser.id);
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  useVisibilityPolling(loadStandings, 15000, [selectedPhase]);

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
            <h1 className="text-[2.25rem] font-semibold italic leading-none text-[#111] sm:text-[3rem]">Standing</h1>
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
        {data.visible === false ? (
          <p className="mb-4 rounded bg-slate-100 p-3 text-sm text-slate-700">
            {data.message ?? "Points will unlock after Day 1 deadline."}
          </p>
        ) : null}
        <table className="table-shell">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team Name</th>
              <th>PTS</th>
              <th>TOT</th>
            </tr>
          </thead>
          <tbody>
            {data.members.length ? (
              data.members.map((member) => {
                const isCurrentUser = member.userId === currentUserId;

                return (
                <tr
                  key={member.userId}
                  className={isCurrentUser ? "standing-row--current" : undefined}
                >
                  <td>
                    <div className="flex items-center">
                      <span>{member.rank}</span>
                      <RankTrend rank={member.rank} previousRank={member.previousRank ?? member.rank} />
                    </div>
                  </td>
                  <td>
                    {data.visible === false ? (
                      <span className={isCurrentUser ? "font-semibold text-brand-darkBlue" : "font-semibold text-slate-700"}>
                        {getDisplayTeamName(member.teamName, member.gameId)}
                      </span>
                    ) : (
                      <Link
                        href={{
                          pathname: "/points",
                          query: {
                            userId: member.userId,
                            phase: data.selectedPhaseKey ?? selectedPhase
                          }
                        }}
                        className={isCurrentUser ? "font-semibold text-brand-darkBlue hover:underline" : "font-semibold text-[#0a3c98] hover:underline"}
                      >
                        {getDisplayTeamName(member.teamName, member.gameId)}
                      </Link>
                    )}
                  </td>
                  <td>{data.visible === false ? "-" : formatFantasyPoints(member.phasePoints ?? member.gamedayPoints ?? 0)}</td>
                  <td>{data.visible === false ? "-" : formatFantasyPoints(member.totalPoints ?? 0)}</td>
                </tr>
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
