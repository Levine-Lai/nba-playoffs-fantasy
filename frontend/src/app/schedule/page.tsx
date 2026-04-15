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

function MatchCenter({
  tipoff,
  status,
  statusText,
  homeScore,
  awayScore,
  stageLabel
}: {
  tipoff: string;
  status: "upcoming" | "live" | "final";
  statusText?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  stageLabel?: string;
}) {
  const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined;

  return (
    <div className="text-center">
      {hasScore ? (
        <div className="inline-flex min-w-[110px] items-center justify-center rounded border border-brand-blue px-3 py-1 text-2xl font-semibold text-brand-blue">
          {homeScore} - {awayScore}
        </div>
      ) : (
        <div className="inline-block rounded border border-brand-blue px-3 py-1 text-2xl font-semibold text-brand-blue">{tipoff}</div>
      )}
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {status === "upcoming" ? "Scheduled" : statusText || status}
      </p>
      {stageLabel ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{stageLabel}</p> : null}
    </div>
  );
}

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = () => {
      getSchedule()
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
          setError(err instanceof Error ? err.message : "Failed to load schedule.");
        });
    };

    load();
    const timer = window.setInterval(load, 60000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const grouped = useMemo(() => {
    if (!data) {
      return [] as Array<{ key: string; label: string; dateLabel: string; games: ScheduleResponse["games"] }>;
    }

    const map = new Map<string, { key: string; label: string; dateLabel: string; games: ScheduleResponse["games"] }>();
    data.games.forEach((game) => {
      const key = game.gamedayKey ?? String(game.date).slice(0, 10);
      const existing = map.get(key) ?? {
        key,
        label: game.gamedayLabel ?? data.gameweek,
        dateLabel: game.gamedayDateLabel ?? new Date(game.date).toDateString(),
        games: []
      };

      existing.games.push(game);
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((left, right) => left.key.localeCompare(right.key));
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
        <div className="rounded-sm border border-slate-200 p-3 text-center">
          <p className="text-4xl font-semibold uppercase">{data.gameweek}</p>
          <p className="text-sm text-slate-500">{data.deadline}</p>
        </div>

        {grouped.map((group) => (
          <section key={group.key} className="overflow-hidden rounded-sm border border-slate-200">
            <div className="border-b border-slate-200 bg-[#eef1f3] px-4 py-2 text-center">
              <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-slate-800">{group.label}</h2>
              <p className="mt-1 text-xs text-slate-500">{group.dateLabel}</p>
            </div>

            <div className="divide-y divide-slate-200 bg-white">
              {group.games.map((game) => (
                <article key={game.id} className="grid items-center gap-2 px-4 py-3 md:grid-cols-[1fr_120px_1fr]">
                  <TeamLabel team={game.homeTeam ?? { name: game.home }} />
                  <MatchCenter
                    tipoff={game.tipoff}
                    status={game.status}
                    statusText={game.statusText}
                    homeScore={game.homeScore}
                    awayScore={game.awayScore}
                    stageLabel={game.stageLabel}
                  />
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
