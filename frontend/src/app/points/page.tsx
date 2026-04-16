"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ContentWithSidebar from "@/components/ContentWithSidebar";
import CourtPlayerCard from "@/components/CourtPlayerCard";
import RightSidebar from "@/components/RightSidebar";
import { getPointsToday } from "@/lib/api";
import { Player, PointsResponse } from "@/lib/types";

export default function PointsPage() {
  const [data, setData] = useState<PointsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const starterFrontCourt = data ? data.lineup.starters.filter((player) => player.position === "FC") : ([] as Player[]);
  const starterBackCourt = data ? data.lineup.starters.filter((player) => player.position === "BC") : ([] as Player[]);

  useEffect(() => {
    let active = true;

    const load = () => {
      getPointsToday()
        .then((payload) => {
          if (!active) {
            return;
          }
          setData(payload);
          setError(null);
        })
        .catch((err) => {
          if (!active) {
            return;
          }
          setError(err instanceof Error ? err.message : "Failed to load points.");
        });
    };

    load();
    const timer = window.setInterval(load, 30000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
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

  return (
    <ContentWithSidebar sidebar={<RightSidebar />}>
      <section className="panel">
        <div className="panel-body space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-4xl font-semibold uppercase">{data.gameweek.label}</h1>
              {data.viewer ? (
                <p className="mt-2 text-sm text-slate-600">
                  {data.viewer.teamName} · {data.viewer.managerName} ({data.viewer.gameId})
                </p>
              ) : null}
            </div>
            <p className="text-sm text-slate-600">Daily points snapshot</p>
          </div>

          {data.message ? <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{data.message}</p> : null}
          {data.visible === false ? <p className="rounded bg-slate-100 p-3 text-sm text-slate-700">{data.message ?? "Points will unlock after the first deadline."}</p> : null}

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

      <section className="panel overflow-hidden">
        <div className="bg-[#d7dde3] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#111]">Starting 5</div>
        <div className="court-formation">
          <div className="court-row court-row--top">
            {starterFrontCourt.map((player) => (
              <div key={player.id} className="court-slot">
                <CourtPlayerCard player={player} captain={data.lineup.captainId === player.id} showPoints />
              </div>
            ))}
          </div>
          <div className="court-row court-row--bottom">
            {starterBackCourt.map((player) => (
              <div key={player.id} className="court-slot">
                <CourtPlayerCard player={player} captain={data.lineup.captainId === player.id} showPoints />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="bg-[#d7dde3] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#111]">Bench</div>
        <div className="panel-body">
          <div className="court-bench">
            {data.lineup.bench.map((player) => (
              <div key={player.id} className="court-slot">
                <CourtPlayerCard player={player} compact showPoints captain={data.lineup.captainId === player.id} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </ContentWithSidebar>
  );
}
