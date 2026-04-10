"use client";

import { useEffect, useState } from "react";
import { getProfile } from "@/lib/api";
import { ProfileResponse } from "@/lib/types";

export default function RightSidebar() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <aside className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</aside>;
  }

  if (!data) {
    return <aside className="rounded bg-white p-4 shadow-panel">Loading panel...</aside>;
  }

  return (
    <aside className="space-y-4">
      <section className="rounded bg-white shadow-panel">
        <div className="border-b border-slate-200 p-4">
          <h3 className="text-4xl font-semibold text-slate-900">{data.profile.teamName}</h3>
          <p className="mt-1 text-sm text-slate-600">{data.profile.managerName}</p>
        </div>

        <div>
          <h4 className="bg-surface-line px-4 py-2 text-sm font-semibold uppercase tracking-wide">Points / Rankings</h4>
          <dl className="divide-y divide-slate-200 text-sm">
            <div className="flex justify-between px-4 py-2">
              <dt>Overall Points</dt>
              <dd className="font-semibold">{data.profile.overallPoints}</dd>
            </div>
            <div className="flex justify-between px-4 py-2">
              <dt>Overall Rank</dt>
              <dd className="font-semibold">{data.profile.overallRank}</dd>
            </div>
            <div className="flex justify-between px-4 py-2">
              <dt>Total Players</dt>
              <dd className="font-semibold">{data.profile.totalPlayers.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between px-4 py-2">
              <dt>Gameday Points</dt>
              <dd className="font-semibold">{data.profile.gamedayPoints}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded bg-white shadow-panel">
        <h4 className="bg-surface-line px-4 py-2 text-sm font-semibold uppercase tracking-wide">Leagues Snapshot</h4>
        <div className="divide-y divide-slate-200 text-sm">
          {data.leagues.global.slice(0, 5).map((item) => (
            <div key={item.id} className="flex justify-between px-4 py-2">
              <span>{item.name}</span>
              <span className="font-semibold">#{item.rank}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded bg-white p-4 shadow-panel">
        <h4 className="text-sm font-semibold uppercase tracking-wide">Transactions & Finance</h4>
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex justify-between">
            <span>Free This Week</span>
            <strong>{data.transactions.freeLeft}</strong>
          </p>
          <p className="flex justify-between">
            <span>Total Transfers</span>
            <strong>{data.transactions.total}</strong>
          </p>
          <p className="flex justify-between">
            <span>Roster Value</span>
            <strong>{data.transactions.rosterValue}</strong>
          </p>
          <p className="flex justify-between">
            <span>In the Bank</span>
            <strong>{data.transactions.bank}</strong>
          </p>
        </div>
      </section>
    </aside>
  );
}

