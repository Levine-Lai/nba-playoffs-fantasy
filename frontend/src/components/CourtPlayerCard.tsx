"use client";

import { SyntheticEvent } from "react";
import { Player } from "@/lib/types";
import { formatFantasyPoints } from "@/lib/formatFantasyPoints";

interface CourtPlayerCardProps {
  player: Player;
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
  compact,
  showPoints,
  dimmed,
  highlighted,
  selectable,
  onClick
}: CourtPlayerCardProps) {
  const isFrontCourt = player.position === "FC";
  const hasNextOpponent = Boolean(player.nextOpponent && player.nextOpponent !== "TBD");
  const hasPortraitAsset = Boolean(player.headshotUrl || player.headshotFallbackUrl);
  const shouldRenderPortrait = Boolean(hasPortraitAsset && !compact);
  const nextOpponentLogoUrl = player.nextOpponentLogoUrl ?? player.nextOpponentLogoFallbackUrl;
  const numericPoints = Number(player.points ?? 0);
  const numericSalary = Number(player.salary ?? 0);
  const valueRatio = numericSalary > 0 ? numericPoints / numericSalary : 0;
  const hasResolvedPoints = Boolean(showPoints && player.pointsWindowKey);
  const isStandoutPointsCard = Boolean(hasResolvedPoints && (numericPoints > 50 || valueRatio > 5));
  const cardClassName = [
    "court-card",
    isFrontCourt ? "court-card--fc" : "court-card--bc",
    compact ? "court-card--compact" : "",
    showPoints ? "court-card--points" : "court-card--edit",
    shouldRenderPortrait ? "court-card--has-portrait" : "",
    isStandoutPointsCard ? "court-card--standout" : "",
    dimmed ? "court-card--dimmed" : "",
    highlighted ? "court-card--highlighted" : "",
    onClick ? "court-card--interactive" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const scheduleValue = hasNextOpponent && nextOpponentLogoUrl ? (
    <span className="court-card__schedule-value" title={player.nextOpponent ?? ""}>
      <img
        src={nextOpponentLogoUrl}
        alt=""
        aria-hidden="true"
        className="h-4 w-4 object-contain"
        onError={(event) => useFallbackImage(event, player.nextOpponentLogoFallbackUrl)}
      />
    </span>
  ) : (
    <span className="court-card__schedule-value">-</span>
  );
  const pointsValue = player.pointsWindowKey ? formatFantasyPoints(player.points ?? 0) : "-";
  const portrait = shouldRenderPortrait ? (
    <div className={`court-card__portrait ${showPoints ? "court-card__portrait--points" : "court-card__portrait--edit"}`}>
      <img
        src={player.headshotUrl ?? player.headshotFallbackUrl ?? ""}
        alt={player.name}
        className={`court-card__headshot ${showPoints ? "court-card__headshot--portrait" : ""}`}
        onError={(event) => useFallbackImage(event, player.headshotFallbackUrl)}
      />
    </div>
  ) : null;
  const portraitShadow = portrait ? (
    <div
      aria-hidden="true"
      className={`court-card__portrait-shadow ${showPoints ? "court-card__portrait-shadow--points" : "court-card__portrait-shadow--edit"}`}
    />
  ) : null;

  const body = (
    <>
      <div className="court-card__surface">
        <div className={`court-card__photo ${showPoints ? "court-card__photo--portrait" : ""}`}>
          {portrait || compact ? null : <img src="/LOGO.png" alt="" aria-hidden="true" className="court-card__fallback-logo" />}
        </div>

        <div className="court-card__name-band">
          <div className="court-card__name">{formatCardName(player.name)}</div>
        </div>

        {showPoints ? (
          <div className="court-card__points-only">
            <strong>{pointsValue}</strong>
          </div>
        ) : (
          <div className="court-card__schedule">
            <div className="court-card__schedule-row">
              <span className="court-card__schedule-label">Next</span>
              {scheduleValue}
            </div>
          </div>
        )}
      </div>

      {portrait}
      {portraitShadow}
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
