"use client";

import Link from "next/link";
import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { getSchedule } from "@/lib/api";
import { ScheduleResponse, TeamAsset } from "@/lib/types";

function onLogoError(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
}

function TeamLabel({ team, align = "left" }: { team?: TeamAsset; align?: "left" | "right" }) {
  const logoUrl = team?.logoUrl ?? team?.logoFallbackUrl;

  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "justify-end" : "justify-start"}`}>
      {align === "left" && logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-10 w-10 object-contain"
          onError={(event) => onLogoError(event, team?.logoFallbackUrl)}
        />
      ) : null}
      <p className={`text-base font-semibold ${align === "right" ? "text-right" : "text-left"}`}>{team?.name ?? "TBD"}</p>
      {align === "right" && logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-10 w-10 object-contain"
          onError={(event) => onLogoError(event, team?.logoFallbackUrl)}
        />
      ) : null}
    </div>
  );
}

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
          <Link href="/" className="nba-button-blue">
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
        <div className="grid items-center gap-3 rounded-sm border border-slate-200 p-3 md:grid-cols-[200px_1fr_200px]">
          <button className="nba-button-blue">Previous</button>
          <div className="text-center">
            <p className="text-4xl font-semibold uppercase">{data.gameweek}</p>
            <p className="text-sm text-slate-500">{data.deadline}</p>
          </div>
          <button className="nba-button-blue">Next</button>
        </div>

        {grouped.map((group) => (
          <section key={group.date} className="overflow-hidden rounded-sm border border-slate-200">
            <h2 className="border-b border-slate-200 bg-[#eef1f3] px-4 py-2 text-center text-sm font-semibold">
              {new Date(group.date).toDateString()}
            </h2>

            <div className="divide-y divide-slate-200 bg-white">
              {group.games.map((game) => (
                <article key={game.id} className="grid items-center gap-2 px-4 py-3 md:grid-cols-[1fr_120px_1fr]">
                  <TeamLabel team={game.homeTeam ?? { name: game.home }} />
                  <div className="text-center">
                    <div className="inline-block rounded border border-brand-blue px-3 py-1 text-2xl font-semibold text-brand-blue">
                      {game.tipoff}
                    </div>
                    <p className="text-xs text-slate-500">@</p>
                  </div>
                  <TeamLabel team={game.awayTeam ?? { name: game.away }} align="right" />
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
