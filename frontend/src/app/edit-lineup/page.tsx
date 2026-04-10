"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ContentWithSidebar from "@/components/ContentWithSidebar";
import PlayerCard from "@/components/PlayerCard";
import RightSidebar from "@/components/RightSidebar";
import { getLineup, saveLineup } from "@/lib/api";
import { LineupResponse } from "@/lib/types";

export default function EditLineupPage() {
  const [data, setData] = useState<LineupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLineup()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load lineup."))
      .finally(() => setLoading(false));
  }, []);

  const captain = useMemo(() => {
    if (!data) {
      return null;
    }

    return [...data.lineup.starters, ...data.lineup.bench].find((item) => item.id === data.lineup.captainId) ?? null;
  }, [data]);

  if (loading) {
    return <div className="panel panel-body">Loading line-up...</div>;
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

  async function onSave() {
    if (!data) {
      return;
    }

    setFeedback(null);
    try {
      const next = await saveLineup({ captainId: data.lineup.captainId });
      setData(next);
      setFeedback("Line-up saved for this gameweek.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save line-up.");
    }
  }

  function selectCaptain(playerId: string) {
    setData((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        lineup: {
          ...prev.lineup,
          captainId: playerId
        }
      };
    });
  }

  return (
    <ContentWithSidebar sidebar={<RightSidebar />}>
      <section className="panel">
        <div className="panel-body">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-4xl font-semibold uppercase">{data.gameweek.label}</h1>
            <button className="rounded bg-brand-yellow px-5 py-2 text-base font-semibold" type="button" onClick={onSave}>
              Save Your Team
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-600">Deadline: {new Date(data.gameweek.deadline).toLocaleString()}</p>
          <p className="mt-1 text-sm text-slate-600">
            Free transfers left: {data.transactions.freeLeft} / {data.transactions.weeklyFreeLimit}
          </p>
          {feedback ? <p className="mt-2 rounded bg-slate-100 p-2 text-sm">{feedback}</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Starting 5</div>
        <div className="panel-body">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.lineup.starters.map((player) => (
              <div key={player.id} className="space-y-2">
                <PlayerCard player={player} captain={data.lineup.captainId === player.id} />
                <button
                  className="w-full rounded border border-slate-300 bg-slate-50 py-1 text-xs font-semibold hover:bg-slate-100"
                  type="button"
                  onClick={() => selectCaptain(player.id)}
                >
                  Make Captain
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Bench</div>
        <div className="panel-body">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {data.lineup.bench.map((player) => (
              <div key={player.id} className="space-y-2">
                <PlayerCard player={player} captain={data.lineup.captainId === player.id} />
                <button
                  className="w-full rounded border border-slate-300 bg-slate-50 py-1 text-xs font-semibold hover:bg-slate-100"
                  type="button"
                  onClick={() => selectCaptain(player.id)}
                >
                  Make Captain
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Captain</div>
        <div className="panel-body text-sm text-slate-700">
          <p>Current captain: {captain ? `${captain.name} (${captain.team})` : "Not selected"}</p>
          <p className="mt-1">Captain gets 1.5x fantasy points.</p>
        </div>
      </section>
    </ContentWithSidebar>
  );
}

