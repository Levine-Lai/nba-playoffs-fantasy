"use client";

import { useEffect, useState } from "react";
import { getProfile } from "@/lib/api";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";
import { ProfileResponse } from "@/lib/types";
import { getDisplayTeamName } from "@/lib/teamName";

export default function RightSidebar() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useVisibilityPolling(async () => {
    try {
      const payload = await getProfile();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile.");
    }
  }, 120000, []);

  if (error) {
    return <aside className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</aside>;
  }

  if (!data) {
    return <aside className="sidebar-card p-4 text-sm text-slate-600">Loading panel...</aside>;
  }

  return (
    <aside className="space-y-4 xl:sticky xl:top-4">
      <section className="sidebar-card">
        <div className="px-4 py-4">
          <h3 className="nba-wordmark text-[2rem] leading-none text-[#111]">
            {getDisplayTeamName(data.profile.teamName, data.profile.managerName)}
          </h3>
        </div>

        <div>
          <h4 className="sidebar-card__head">Points / Rankings</h4>
          <dl>
            <div className="sidebar-row">
              <dt>Overall Points</dt>
              <dd className="font-semibold">{data.profile.overallPoints}</dd>
            </div>
            <div className="sidebar-row">
              <dt>Overall Rank</dt>
              <dd className="font-semibold">{data.profile.overallRank}</dd>
            </div>
            <div className="sidebar-row">
              <dt>Gameday Fantasy Points</dt>
              <dd className="font-semibold">{data.profile.gamedayPoints}</dd>
            </div>
          </dl>
        </div>
      </section>

      {data.profile.fanLeague ? (
        <section className="sidebar-card">
          <h4 className="sidebar-card__head">Fan League</h4>
          <div className="grid place-items-center px-4 py-5 text-center">
            <div className="grid h-28 w-28 place-items-center rounded-full bg-black text-sm font-bold uppercase leading-tight tracking-[0.2em] text-white shadow-card">
              {data.profile.fanLeague}
            </div>
            <p className="mt-4 text-sm font-semibold text-brand-darkBlue">View {data.profile.fanLeague} Fan League &gt;</p>
          </div>
        </section>
      ) : null}

      <section className="sidebar-card">
        <h4 className="sidebar-card__head">Transactions And Finance</h4>
          <dl>
            <div className="sidebar-row">
              <dt>FT remaining</dt>
              <dd className="font-semibold">{data.transactions.freeLeft}</dd>
            </div>
          <div className="sidebar-row">
            <dt>Total transactions</dt>
            <dd className="font-semibold">{data.transactions.total}</dd>
          </div>
          <div className="sidebar-row">
            <dt>Roster value</dt>
            <dd className="font-semibold">{data.transactions.rosterValue}</dd>
          </div>
          <div className="sidebar-row">
            <dt>In the bank</dt>
            <dd className="font-semibold">{data.transactions.bank}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
