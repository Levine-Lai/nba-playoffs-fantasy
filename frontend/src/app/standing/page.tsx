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

function CardBadge({ label, used }: { label: "WC" | "AS"; used: boolean }) {
  return (
    <span
      title={`${label} ${used ? "used" : "unused"}`}
      className={
        used
          ? "inline-flex min-w-10 justify-center rounded border border-[#b91c1c] bg-[#dc2626] px-2 py-1 text-xs font-bold text-white shadow-sm"
          : "inline-flex min-w-10 justify-center rounded border border-[#15803d] bg-[#16a34a] px-2 py-1 text-xs font-bold text-white shadow-sm"
      }
    >
      {label}
    </span>
  );
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

  useVisibilityPolling(
    loadStandings,
    {
      intervalMs: data?.refreshIntervalMs ?? null,
      nextRefreshAt: data?.nextRefreshAt ?? null
    },
    [selectedPhase, data?.refreshIntervalMs ?? null, data?.nextRefreshAt ?? null]
  );

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
        <table className="table-shell standing-table min-w-[820px]">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team Name</th>
              <th>PTS</th>
              <th>TOT</th>
              <th>FT Used</th>
              <th>Card Used</th>
            </tr>
          </thead>
          <tbody>
            {data.members.length ? (
              data.members.map((member) => {
                const isCurrentUser = member.userId === currentUserId;
                const displayedPhasePoints = member.phasePoints ?? member.gamedayPoints ?? 0;
                const freeTransfersUsed = Number(member.freeTransfersUsed ?? 0);
                const freeTransfersLimit = Number(member.freeTransfersLimit ?? 8);
                const cardsUsed = member.cardsUsed ?? { wildcard: false, allStar: false };

                return (
                <tr
                  key={member.userId}
                  className={isCurrentUser ? "standing-row--current" : undefined}
                >
                  <td>
                    <div className="flex items-center text-lg font-black text-[#111]">
                      <span>{member.rank}</span>
                      <RankTrend rank={member.rank} previousRank={member.previousRank ?? member.rank} />
                    </div>
                  </td>
                  <td>
                    {data.visible === false ? (
                      <span className={isCurrentUser ? "text-lg font-black text-brand-darkBlue" : "text-lg font-black text-slate-800"}>
                        {getDisplayTeamName(member.teamName, member.managerName)}
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
                        className={isCurrentUser ? "text-lg font-black text-brand-darkBlue hover:underline" : "text-lg font-black text-[#0a3c98] hover:underline"}
                      >
                        {getDisplayTeamName(member.teamName, member.managerName)}
                      </Link>
                    )}
                  </td>
                  <td className="text-lg font-black text-[#111]">{data.visible === false ? "-" : formatFantasyPoints(displayedPhasePoints)}</td>
                  <td className="text-lg font-black text-[#111]">{data.visible === false ? "-" : formatFantasyPoints(member.totalPoints ?? 0)}</td>
                  <td className="whitespace-nowrap text-base font-extrabold text-[#111]">
                    {data.visible === false ? "-" : `${freeTransfersUsed}/${freeTransfersLimit}`}
                  </td>
                  <td>
                    {data.visible === false ? (
                      "-"
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <CardBadge label="WC" used={cardsUsed.wildcard} />
                        <CardBadge label="AS" used={cardsUsed.allStar} />
                      </div>
                    )}
                  </td>
                </tr>
              );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-slate-600">
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
