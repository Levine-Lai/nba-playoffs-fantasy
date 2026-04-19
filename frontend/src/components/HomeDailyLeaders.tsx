"use client";

import { SyntheticEvent } from "react";
import { HomeLeaderEntry } from "@/lib/types";
import { formatFantasyPoints } from "@/lib/formatFantasyPoints";

function formatLeaderName(name: string) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 1) {
    return String(name ?? "").toUpperCase();
  }

  return `${parts[0][0]}.${parts.slice(1).join(" ")}`.toUpperCase();
}

function onImageError(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
}

function LeadersRow({
  title,
  tone,
  entries
}: {
  title: string;
  tone: "front" | "back";
  entries: HomeLeaderEntry[];
}) {
  if (!entries.length) {
    return null;
  }

  return (
    <section className={`home-leaders__section home-leaders__section--${tone}`}>
      <div className="home-leaders__section-head">{title}</div>
      <div className="home-leaders__cards">
        {entries.map((entry) => {
          const headshotUrl = entry.player.headshotUrl ?? entry.player.headshotFallbackUrl;
          return (
            <article key={entry.player.id} className={`home-leaders__card home-leaders__card--${tone}`}>
              <div className="home-leaders__rank">{entry.rank}</div>
              <div className="home-leaders__card-inner">
                <div className={`home-leaders__team home-leaders__team--${tone}`}>{entry.player.team}</div>
                <div className="home-leaders__photo-wrap">
                  {headshotUrl ? (
                    <img
                      src={headshotUrl}
                      alt=""
                      className="home-leaders__photo"
                      onError={(event) => onImageError(event, entry.player.headshotFallbackUrl)}
                    />
                  ) : null}
                </div>
                <div className={`home-leaders__name home-leaders__name--${tone}`}>{formatLeaderName(entry.player.name)}</div>
                <div className={`home-leaders__score home-leaders__score--${tone}`}>{formatFantasyPoints(entry.points)}</div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function HomeDailyLeaders({
  dayLabel,
  frontCourt,
  backCourt
}: {
  dayLabel: string;
  frontCourt: HomeLeaderEntry[];
  backCourt: HomeLeaderEntry[];
}) {
  if (!frontCourt.length && !backCourt.length) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="home-leaders__eyebrow">Daily Fantasy Leaders</p>
        <p className="home-leaders__day">{dayLabel}</p>
      </div>
      <LeadersRow title="Front Court" tone="front" entries={frontCourt} />
      <LeadersRow title="Back Court" tone="back" entries={backCourt} />
    </section>
  );
}
