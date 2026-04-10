"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLeagues } from "@/lib/api";
import { LeaguesResponse, LeagueEntry } from "@/lib/types";

function LeagueTable({ title, rows }: { title: string; rows: LeagueEntry[] }) {
  return (
    <section className="panel">
      <div className="panel-head">{title}</div>
      <div className="panel-body overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>League</th>
              <th>Current Rank</th>
              <th>Last Rank</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((entry) => {
                const diff = entry.lastRank - entry.rank;
                const diffColor = diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-slate-500";
                return (
                  <tr key={entry.id}>
                    <td>{entry.name}</td>
                    <td>{entry.rank}</td>
                    <td>{entry.lastRank}</td>
                    <td className={diffColor}>{diff === 0 ? "-" : diff > 0 ? `+${diff}` : diff}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4}>No leagues yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LeaguesPage() {
  const [data, setData] = useState<LeaguesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeagues()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load leagues."));
  }, []);

  if (!data && !error) {
    return <div className="panel panel-body">Loading leagues...</div>;
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
    <div className="space-y-5">
      <section className="panel">
        <div className="panel-body grid gap-3 sm:grid-cols-2">
          <button className="rounded bg-brand-yellow px-4 py-3 text-base font-semibold">Create and join new leagues</button>
          <button className="rounded bg-brand-yellow px-4 py-3 text-base font-semibold">Renew your leagues</button>
        </div>
      </section>

      <LeagueTable title="Private classic leagues" rows={data.privateClassic} />
      <LeagueTable title="Public classic leagues" rows={data.publicClassic} />
      <LeagueTable title="Global leagues" rows={data.global} />
    </div>
  );
}

