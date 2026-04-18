"use client";

import { SyntheticEvent } from "react";
import { Player } from "@/lib/types";

interface PlayerCardProps {
  player: Player;
  showPoints?: boolean;
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return name.toUpperCase();
  }

  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`.toUpperCase();
}

function useFallbackImage(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
}

export default function PlayerCard({ player, showPoints }: PlayerCardProps) {
  const isHot = player.color === "hot";
  const footerValue = showPoints ? (player.pointsWindowKey ? Number(player.points ?? 0).toFixed(1) : "-") : player.salary.toFixed(1);
  const headshotUrl = player.headshotUrl ?? player.headshotFallbackUrl;
  const teamLogoUrl = player.teamLogoUrl ?? player.teamLogoFallbackUrl;
  const nextOpponentLogoUrl = player.nextOpponentLogoUrl ?? player.nextOpponentLogoFallbackUrl;

  return (
    <article className={`player-card ${isHot ? "player-card--hot" : ""}`}>
      <span className="player-card__info" aria-hidden="true">i</span>
      {teamLogoUrl ? (
        <img
          className="player-card__logo"
          src={teamLogoUrl}
          alt=""
          aria-hidden="true"
          onError={(event) => useFallbackImage(event, player.teamLogoFallbackUrl)}
        />
      ) : null}
      <span className="player-card__team">{player.team}</span>

      <div className="player-card__photo" aria-hidden="true">
        {headshotUrl ? (
          <img
            className="player-card__headshot"
            src={headshotUrl}
            alt=""
            onError={(event) => useFallbackImage(event, player.headshotFallbackUrl)}
          />
        ) : null}
      </div>

      <div className="player-card__name">{shortName(player.name)}</div>

      {!showPoints ? (
        <div className="player-card__meta">
          <span className="inline-flex items-center gap-2">
            <span>Next {player.nextOpponent ?? "TBD"}</span>
            {nextOpponentLogoUrl ? (
              <img
                className="h-4 w-4 object-contain"
                src={nextOpponentLogoUrl}
                alt=""
                aria-hidden="true"
                onError={(event) => useFallbackImage(event, player.nextOpponentLogoFallbackUrl)}
              />
            ) : null}
          </span>
          <span>{(player.upcoming ?? []).slice(0, 2).join(" / ") || "Upcoming"}</span>
        </div>
      ) : (
        <div className="player-card__meta">
          <span>{player.position}</span>
          <span>{player.status ?? "Available"}</span>
        </div>
      )}

      <footer className="player-card__score">{footerValue}</footer>
    </article>
  );
}
