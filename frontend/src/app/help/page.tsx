"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHelpRules } from "@/lib/api";
import { HelpResponse } from "@/lib/types";

export default function HelpPage() {
  const [data, setData] = useState<HelpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHelpRules()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load rules."));
  }, []);

  if (!data && !error) {
    return <div className="panel panel-body">Loading rules...</div>;
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
        <div className="panel-head">Help & Rules</div>
        <div className="panel-body">
          <h2 className="text-3xl font-semibold uppercase">Roster Rules</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {data.rosterRules.map((rule, index) => (
              <li key={`${rule}-${index}`}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Scoring Matrix</div>
        <div className="panel-body overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Event</th>
                <th>Fantasy Points</th>
              </tr>
            </thead>
            <tbody>
              {data.scoringRules.map((item) => (
                <tr key={item.event}>
                  <td>{item.event}</td>
                  <td>{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Weekly Flow</div>
        <div className="panel-body text-sm text-slate-700">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open week before deadline and confirm your 10-man lineup.</li>
            <li>Use free transfers to optimize matchups during each playoff week.</li>
            <li>Track daily points and league ranking changes.</li>
            <li>Repeat until playoffs finish and final rank is locked.</li>
          </ol>
        </div>
      </section>
    </div>
  );
}

