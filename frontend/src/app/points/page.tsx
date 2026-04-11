"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ContentWithSidebar from "@/components/ContentWithSidebar";
import PlayerCard from "@/components/PlayerCard";
import RightSidebar from "@/components/RightSidebar";
import { getPointsToday } from "@/lib/api";
import { PointsResponse } from "@/lib/types";

export default function PointsPage() {
  const [data, setData] = useState<PointsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPointsToday()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load points."));
  }, []);

  if (!data && !error) {
    return <div className="panel panel-body">Loading points...</div>;
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

  if (data.visible === false) {
    return (
      <section className="panel">
        <div className="panel-head">Points Locked</div>
        <div className="panel-body space-y-3 text-sm text-slate-700">
          <p>{data.message ?? "Points will unlock after the first deadline."}</p>
          <Link href="/edit-lineup" className="inline-flex rounded bg-brand-blue px-4 py-2 font-semibold text-white">
            Manage Line-up
          </Link>
        </div>
      </section>
    );
  }

  return (
    <ContentWithSidebar sidebar={<RightSidebar />}>
      <section className="panel">
        <div className="panel-body">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-4xl font-semibold uppercase">{data.gameweek.label}</h1>
            <p className="text-sm text-slate-600">Daily points snapshot</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="nba-stat-card">
              <p className="text-sm">Average GD Pts</p>
              <p className="text-5xl font-semibold">{data.summary.average}</p>
            </article>
            <article className="nba-stat-card">
              <p className="text-sm">Final GD Points</p>
              <p className="text-5xl font-semibold">{data.summary.final}</p>
            </article>
            <article className="nba-stat-card">
              <p className="text-sm">Top GD Points</p>
              <p className="text-5xl font-semibold">{data.summary.top}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Starting 5</div>
        <div className="panel-body">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.lineup.starters.map((player) => (
              <PlayerCard key={player.id} player={player} showPoints captain={data.lineup.captainId === player.id} />
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Bench</div>
        <div className="panel-body">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {data.lineup.bench.map((player) => (
              <PlayerCard key={player.id} player={player} showPoints captain={data.lineup.captainId === player.id} />
            ))}
          </div>
        </div>
      </section>
    </ContentWithSidebar>
  );
}

