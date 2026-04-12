"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLeague } from "@/lib/api";
import { LeagueDetailResponse } from "@/lib/types";

function RankTrend({ rank, previousRank }: { rank: number; previousRank: number }) {
  const diff = previousRank - rank;

  if (diff > 0) {
    return <span className="ml-2 inline-block h-0 w-0 border-x-[6px] border-b-[8px] border-x-transparent border-b-[#31c7c6]" />;
  }

  if (diff < 0) {
    return <span className="ml-2 inline-block h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-[#d61f43]" />;
  }

  return <span className="ml-2 inline-block text-slate-400">▶</span>;
}

export default function LeagueDetailPage({ params }: { params: { leagueId: string } }) {
  const [data, setData] = useState<LeagueDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeague(params.leagueId)
      .then(setData)
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Failed to load league."));
  }, [params.leagueId]);

  if (!data && !error) {
    return <div className="panel panel-body">Loading league...</div>;
  }

  if (error || !data) {
    return (
      <section className="panel">
        <div className="panel-head">League Not Found</div>
        <div className="panel-body space-y-3 text-sm text-slate-700">
          <p>{error ?? "This league could not be found."}</p>
          <Link href="/leagues" className="inline-flex rounded bg-brand-blue px-4 py-2 font-semibold text-white">
            Back To Leagues
          </Link>
        </div>
      </section>
    );
  }

  const league = data.league;
  const members = league.members ?? [];

  return (
    <section className="panel overflow-hidden">
      <div className="bg-white px-6 py-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link href="/leagues" className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-darkBlue">
              Back to Leagues
            </Link>
            <h1 className="mt-4 text-[3rem] font-semibold italic leading-none text-[#111]">{league.name}</h1>
          </div>
          <div className="text-right">
            <p className="text-[1.05rem] font-semibold text-brand-darkBlue">Invite people to join this league</p>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              League Code: <span className="text-brand-darkBlue">{league.code ?? "-"}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="panel-body overflow-x-auto">
        <div className="mb-5 max-w-[210px]">
          <label className="block text-sm text-slate-700">
            <span className="mb-2 block">Select phase</span>
            <select className="w-full rounded-sm border border-slate-200 px-4 py-3 text-[1rem]">
              <option>Overall</option>
            </select>
          </label>
        </div>

        <table className="table-shell">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team &amp; General Manager</th>
              <th>GD</th>
              <th>TOT</th>
            </tr>
          </thead>
          <tbody>
            {members.length ? (
              members.map((member, index) => (
                <tr key={member.userId}>
                  <td>
                    <div className="flex items-center">
                      <span>{member.rank}</span>
                      <RankTrend rank={member.rank} previousRank={index + 1} />
                    </div>
                  </td>
                  <td>
                    <div className="space-y-1">
                      <div className="font-semibold text-[#0a3c98]">{member.teamName}</div>
                      <div className="text-slate-900">{member.managerName}</div>
                    </div>
                  </td>
                  <td>{member.gamedayPoints}</td>
                  <td>{member.totalPoints}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-slate-600">
                  No league members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
