"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ContentWithSidebar from "@/components/ContentWithSidebar";
import CourtPlayerCard from "@/components/CourtPlayerCard";
import RightSidebar from "@/components/RightSidebar";
import { getPointsToday, getStandingPreview } from "@/lib/api";
import { formatFantasyPoints } from "@/lib/formatFantasyPoints";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";
import { Player, PointsResponse } from "@/lib/types";
import { getDisplayTeamName } from "@/lib/teamName";

export default function PointsPage() {
  return (
    <Suspense fallback={<div className="panel panel-body">Loading points...</div>}>
      <PointsPageContent />
    </Suspense>
  );
}

function PointsPageContent() {
  const [data, setData] = useState<PointsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("userId")?.trim() ?? "";
  const targetPhase = searchParams.get("phase")?.trim() ?? "";

  const starterFrontCourt = data ? data.lineup.starters.filter((player) => player.position === "FC") : ([] as Player[]);
  const starterBackCourt = data ? data.lineup.starters.filter((player) => player.position === "BC") : ([] as Player[]);

  useVisibilityPolling(async () => {
    try {
      const payload = targetUserId ? await getStandingPreview(targetUserId, targetPhase || undefined) : await getPointsToday();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load points.");
    }
  }, 30000, [targetPhase, targetUserId]);

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
    <ContentWithSidebar sidebar={<RightSidebar snapshot={data.profileSnapshot} />}>
      <section className="panel">
        <div className="panel-body space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-4xl font-semibold uppercase">{data.gameweek.label}</h1>
              {data.viewer ? (
                <p className="mt-2 text-sm text-slate-600">
                  {getDisplayTeamName(data.viewer.teamName, data.viewer.gameId)}
                </p>
              ) : null}
            </div>
            <p className="text-sm text-slate-600">Daily points snapshot</p>
          </div>

          {data.visible === false ? (
            <p className="rounded bg-slate-100 p-3 text-sm text-slate-700">{data.message ?? "Points will unlock after Day 1 deadline."}</p>
          ) : (
            <>
              {data.message ? <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{data.message}</p> : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-1">
                <article className="nba-stat-card">
                  <p className="text-sm">Gameday Points</p>
                  <p className="text-5xl font-semibold">{formatFantasyPoints(data.summary.final)}</p>
                </article>
              </div>
            </>
          )}
        </div>
      </section>

      {data.visible === false ? null : (
        <>
          <section className="panel overflow-hidden">
            <div className="bg-[#d7dde3] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#111]">Starting 5</div>
            <div className="court-formation">
              <div className="court-row court-row--top">
                {starterFrontCourt.map((player) => (
                  <div key={player.id} className="court-slot">
                    <CourtPlayerCard player={player} showPoints highlighted={player.countsForGameday} />
                  </div>
                ))}
              </div>
              <div className="court-row court-row--bottom">
                {starterBackCourt.map((player) => (
                  <div key={player.id} className="court-slot">
                    <CourtPlayerCard player={player} showPoints highlighted={player.countsForGameday} />
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
                    <CourtPlayerCard player={player} compact showPoints highlighted={player.countsForGameday} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </ContentWithSidebar>
  );
}
