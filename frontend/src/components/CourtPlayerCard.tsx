"use client";

import { SyntheticEvent } from "react";
import { Player } from "@/lib/types";

interface CourtPlayerCardProps {
  player: Player;
  captain?: boolean;
  compact?: boolean;
  showPoints?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  selectable?: boolean;
  onClick?: () => void;
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

function formatCardName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return name.toUpperCase();
  }

  return `${parts[0][0]}.${parts.slice(1).join(" ")}`.toUpperCase();
}

export default function CourtPlayerCard({
  player,
  captain,
  compact,
  showPoints,
  dimmed,
  highlighted,
  selectable,
  onClick
}: CourtPlayerCardProps) {
  const isFrontCourt = player.position === "FC";
  const hasNextOpponent = Boolean(player.nextOpponent && player.nextOpponent !== "TBD");
  const nextOpponentLogoUrl = player.nextOpponentLogoUrl ?? player.nextOpponentLogoFallbackUrl;
  const cardClassName = [
    "court-card",
    isFrontCourt ? "court-card--fc" : "court-card--bc",
    compact ? "court-card--compact" : "",
    dimmed ? "court-card--dimmed" : "",
    highlighted ? "court-card--highlighted" : "",
    onClick ? "court-card--interactive" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const scheduleValue = hasNextOpponent ? (
    <span className="inline-flex items-center gap-2">
      {nextOpponentLogoUrl ? (
        <img
          src={nextOpponentLogoUrl}
          alt=""
          aria-hidden="true"
          className="h-4 w-4 object-contain"
          onError={(event) => useFallbackImage(event, player.nextOpponentLogoFallbackUrl)}
        />
      ) : null}
      <span>{player.nextOpponent}</span>
    </span>
  ) : (
    <span>-</span>
  );

  const body = (
    <>
      <div className="court-card__top">
        <span className="court-card__info">i</span>
        {captain ? <span className="court-card__captain">C</span> : null}
      </div>

      <div className="court-card__header">
        {player.teamLogoUrl || player.teamLogoFallbackUrl ? (
          <img
            src={player.teamLogoUrl ?? player.teamLogoFallbackUrl ?? ""}
            alt=""
            aria-hidden="true"
            className="court-card__logo"
            onError={(event) => useFallbackImage(event, player.teamLogoFallbackUrl)}
          />
        ) : null}
        <span className="court-card__team">{player.team}</span>
      </div>

      {!compact ? (
        <div className={`court-card__photo ${showPoints ? "court-card__photo--portrait" : ""}`}>
          {player.headshotUrl || player.headshotFallbackUrl ? (
            <img
              src={player.headshotUrl ?? player.headshotFallbackUrl ?? ""}
              alt={player.name}
              className={`court-card__headshot ${showPoints ? "court-card__headshot--portrait" : ""}`}
              onError={(event) => useFallbackImage(event, player.headshotFallbackUrl)}
            />
          ) : (
            <img src="/LOGO.png" alt="" aria-hidden="true" className="court-card__fallback-logo" />
          )}
        </div>
      ) : null}

      <div className="court-card__name">{formatCardName(player.name)}</div>

      {showPoints ? (
        <div className="court-card__points-only">
          <strong>{Number(player.points ?? 0).toFixed(1)}</strong>
        </div>
      ) : (
        <div className="court-card__schedule">
          <div className="court-card__schedule-row">
            <span>Next</span>
            {scheduleValue}
          </div>
        </div>
      )}
    </>
  );

  if (!onClick) {
    return <article className={cardClassName}>{body}</article>;
  }

  return (
    <button type="button" onClick={onClick} disabled={selectable === false} className={cardClassName}>
      {body}
    </button>
  );
}
