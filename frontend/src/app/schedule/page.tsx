"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSchedule } from "@/lib/api";
import { ScheduleResponse } from "@/lib/types";

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchedule()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load schedule."));
  }, []);

  const grouped = useMemo(() => {
    if (!data) {
      return [] as Array<{ date: string; games: ScheduleResponse["games"] }>;
    }

    const map = new Map<string, ScheduleResponse["games"]>();
    data.games.forEach((game) => {
      const list = map.get(game.date) ?? [];
      list.push(game);
      map.set(game.date, list);
    });

    return Array.from(map.entries()).map(([date, games]) => ({ date, games }));
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
          <Link href="/" className="inline-flex rounded bg-brand-blue px-4 py-2 font-semibold text-white">
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
        <div className="grid items-center gap-3 rounded border border-slate-200 p-3 md:grid-cols-[200px_1fr_200px]">
          <button className="rounded bg-brand-blue px-3 py-2 text-white">Previous</button>
          <div className="text-center">
            <p className="text-4xl font-semibold uppercase">{data.gameweek}</p>
            <p className="text-sm text-slate-500">{data.deadline}</p>
          </div>
          <button className="rounded bg-brand-blue px-3 py-2 text-white">Next</button>
        </div>

        {grouped.map((group) => (
          <section key={group.date} className="rounded border border-slate-200">
            <h2 className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-center text-sm font-semibold">
              {new Date(group.date).toDateString()}
            </h2>

            <div className="divide-y divide-slate-200">
              {group.games.map((game) => (
                <article key={game.id} className="grid items-center gap-2 px-4 py-3 md:grid-cols-[1fr_120px_1fr]">
                  <p className="text-base font-semibold">{game.home}</p>
                  <div className="text-center">
                    <div className="inline-block rounded border border-brand-blue px-3 py-1 text-2xl font-semibold text-brand-blue">
                      {game.tipoff}
                    </div>
                    <p className="text-xs text-slate-500">@</p>
                  </div>
                  <p className="text-right text-base font-semibold">{game.away}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

