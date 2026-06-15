"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
          ? "inline-flex min-w-11 justify-center rounded border border-[#e4a5a5] bg-[#f4d6d6] px-2.5 py-1.5 text-sm font-black text-[#8f1d1d]"
          : "inline-flex min-w-11 justify-center rounded border border-[#9fd8af] bg-[#d9f2df] px-2.5 py-1.5 text-sm font-black text-[#17652d]"
      }
    >
      {label}
    </span>
  );
}

function getDisplayedDayLabel(data: StandingResponse, selectedPhase: string) {
  const selectedPhaseKey = data.selectedPhaseKey ?? selectedPhase;
  const selectedOption = data.phaseOptions.find((option) => option.key === selectedPhaseKey);
  if (selectedOption && selectedOption.key !== "overall") {
    return selectedOption.label;
  }

  const dayOptions = data.phaseOptions.filter((option) => option.key !== "overall");
  return dayOptions[dayOptions.length - 1]?.label ?? null;
}

export default function StandingPage() {
  const [data, setData] = useState<StandingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState("overall");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const loadedPhaseRef = useRef<string | null>(null);

  const loadStandings = async () => {
    try {
      const payload = await getStandings(selectedPhase);
      setData(payload);
      loadedPhaseRef.current = selectedPhase;
      setError(null);
    } catch (err) {
      if (loadedPhaseRef.current !== selectedPhase) {
        setError(err instanceof Error ? err.message : "Failed to load standings.");
      } else {
        setError(null);
      }
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

  const displayedDayLabel = getDisplayedDayLabel(data, selectedPhase);

  return (
    <section className="panel overflow-hidden">
      <div className="bg-white px-6 py-7">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <h1 className="font-sans text-[3.25rem] font-black leading-none text-[#111] sm:text-[4.5rem]">
              Standing
              {displayedDayLabel ? (
                <span className="ml-5 font-sans text-[1.08rem] font-black uppercase leading-none tracking-[0.02em] text-[#1f2933]">
                  {displayedDayLabel}
                </span>
              ) : null}
            </h1>
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
        <table className="table-shell standing-table min-w-[860px]">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[36%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[19%]" />
          </colgroup>
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
                    <div className="flex items-center text-2xl font-black text-[#111]">
                      <span>{member.rank}</span>
                      <RankTrend rank={member.rank} previousRank={member.previousRank ?? member.rank} />
                    </div>
                  </td>
                  <td>
                    {data.visible === false ? (
                      <span className={isCurrentUser ? "text-2xl font-black text-brand-darkBlue" : "text-2xl font-black text-slate-800"}>
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
                        className={isCurrentUser ? "text-2xl font-black text-brand-darkBlue hover:underline" : "text-2xl font-black text-[#0a3c98] hover:underline"}
                      >
                        {getDisplayTeamName(member.teamName, member.managerName)}
                      </Link>
                    )}
                  </td>
                  <td className="text-2xl font-black text-[#111]">{data.visible === false ? "-" : formatFantasyPoints(displayedPhasePoints)}</td>
                  <td className="text-2xl font-black text-[#111]">{data.visible === false ? "-" : formatFantasyPoints(member.totalPoints ?? 0)}</td>
                  <td className="whitespace-nowrap text-xl font-black text-[#111]">
                    {data.visible === false ? "-" : `${freeTransfersUsed}/${freeTransfersLimit}`}
                  </td>
                  <td className="standing-card-cell">
                    {data.visible === false ? (
                      "-"
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
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
