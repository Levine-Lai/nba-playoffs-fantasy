"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getPointsHistory } from "@/lib/api";
import { formatFantasyPoints } from "@/lib/formatFantasyPoints";
import { getDisplayTeamName } from "@/lib/teamName";
import { PointsHistoryEntry, PointsHistoryResponse } from "@/lib/types";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";

export default function PointsHistoryPage() {
  return (
    <Suspense fallback={<div className="panel panel-body">Loading history...</div>}>
      <PointsHistoryContent />
    </Suspense>
  );
}

function PointsHistoryContent() {
  const [data, setData] = useState<PointsHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("userId")?.trim() ?? "";

  function formatHistoryPoints(entry: PointsHistoryEntry) {
    const penaltyPoints = Number(entry.penaltyPoints ?? 0);
    if (penaltyPoints !== 0) {
      return `${formatFantasyPoints(entry.actualPoints ?? entry.points)}(${formatFantasyPoints(penaltyPoints)})`;
    }

    return formatFantasyPoints(entry.points);
  }

  useVisibilityPolling(async () => {
    try {
      const payload = await getPointsHistory(targetUserId || undefined);
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history.");
    }
  }, {
    intervalMs: 30000
  }, [targetUserId]);

  if (!data && !error) {
    return <div className="panel panel-body">Loading history...</div>;
  }

  if (error || !data) {
    return (
      <section className="panel">
        <div className="panel-head">Gameday History</div>
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
    <section className="panel overflow-hidden">
      <div className="bg-white px-6 py-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-[2.25rem] font-semibold italic leading-none text-[#111] sm:text-[3rem]">Gameday History</h1>
            <p className="mt-3 text-[1.05rem] text-slate-700">
              {getDisplayTeamName(data.viewer.teamName, data.viewer.managerName)}
            </p>
          </div>
          <Link
            href={{
              pathname: "/points",
              query: {
                userId: data.viewer.userId
              }
            }}
            className="text-sm font-semibold text-[#0a3c98] hover:underline"
          >
            Points
          </Link>
        </div>
      </div>

      <div className="panel-body overflow-x-auto">
        {data.visible === false ? (
          <p className="mb-4 rounded bg-slate-100 p-3 text-sm text-slate-700">
            {data.message ?? "Points will unlock after Day 1 deadline."}
          </p>
        ) : null}
        <table className="table-shell">
          <thead>
            <tr>
              <th>Day</th>
              <th>PTS</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length ? (
              data.entries.map((entry) => (
                <tr key={entry.phaseKey}>
                  <td>
                    <Link
                      href={{
                        pathname: "/points",
                        query: {
                          userId: data.viewer.userId,
                          phase: entry.phaseKey
                        }
                      }}
                      className="font-semibold text-[#0a3c98] hover:underline"
                    >
                      {entry.label}
                      {entry.dateLabel ? <span className="ml-2 font-normal text-slate-500">{entry.dateLabel}</span> : null}
                    </Link>
                  </td>
                  <td>{formatHistoryPoints(entry)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-sm text-slate-600">
                  No gameday history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
