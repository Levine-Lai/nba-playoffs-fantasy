"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStandings } from "@/lib/api";
import { StandingResponse } from "@/lib/types";

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

  useEffect(() => {
    getStandings(selectedPhase)
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load standings."));
  }, [selectedPhase]);

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
              data.members.map((member) => (
                <tr key={member.userId}>
                  <td>
                    <div className="flex items-center">
                      <span>{member.rank}</span>
                      <RankTrend rank={member.rank} previousRank={member.previousRank ?? member.rank} />
                    </div>
                  </td>
                  <td>
                    <Link
                      href={{
                        pathname: "/points",
                        query: {
                          userId: member.userId,
                          phase: data.selectedPhaseKey ?? selectedPhase
                        }
                      }}
                      className="font-semibold text-[#0a3c98] hover:underline"
                    >
                      {member.gameId}
                    </Link>
                  </td>
                  <td>{Number(member.phasePoints ?? member.gamedayPoints ?? 0).toFixed(1)}</td>
                  <td>{Number(member.totalPoints ?? 0).toFixed(1)}</td>
                </tr>
              ))
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
