"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import ContentWithSidebar from "@/components/ContentWithSidebar";
import RightSidebar from "@/components/RightSidebar";
import { createTransfer, getTransactionsOptions } from "@/lib/api";
import { TransactionsResponse } from "@/lib/types";

export default function TransactionsPage() {
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [outPlayerId, setOutPlayerId] = useState("");
  const [inPlayerId, setInPlayerId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTransactionsOptions()
      .then((payload) => {
        setData(payload);
        const allLineup = [...payload.lineup.starters, ...payload.lineup.bench];
        setOutPlayerId(allLineup[0]?.id ?? "");
        setInPlayerId(payload.market[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load transaction data."));
  }, []);

  const lineupPlayers = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data.lineup.starters, ...data.lineup.bench];
  }, [data]);

  if (!data && !error) {
    return <div className="panel panel-body">Loading transfer market...</div>;
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

  async function onTransfer(event: FormEvent) {
    event.preventDefault();
    if (!outPlayerId || !inPlayerId) {
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await createTransfer(outPlayerId, inPlayerId);
      setData(response.payload);
      const nextLineup = [...response.payload.lineup.starters, ...response.payload.lineup.bench];
      setOutPlayerId(nextLineup[0]?.id ?? "");
      setInPlayerId(response.payload.market[0]?.id ?? "");
      setFeedback("Transfer completed successfully.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Transfer failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ContentWithSidebar sidebar={<RightSidebar />}>
      <section className="panel">
        <div className="panel-head">Transactions</div>
        <div className="panel-body">
          <div className="grid gap-3 md:grid-cols-4">
            <article className="rounded border border-slate-200 p-3 text-center">
              <p className="text-xs uppercase text-slate-500">Free Left</p>
              <p className="text-4xl font-semibold">{data.freeTransfersLeft}</p>
            </article>
            <article className="rounded border border-slate-200 p-3 text-center">
              <p className="text-xs uppercase text-slate-500">Used This Week</p>
              <p className="text-4xl font-semibold">{data.usedThisWeek}</p>
            </article>
            <article className="rounded border border-slate-200 p-3 text-center">
              <p className="text-xs uppercase text-slate-500">Roster Value</p>
              <p className="text-4xl font-semibold">{data.rosterValue}</p>
            </article>
            <article className="rounded border border-slate-200 p-3 text-center">
              <p className="text-xs uppercase text-slate-500">In the Bank</p>
              <p className="text-4xl font-semibold">{data.bank}</p>
            </article>
          </div>

          <form onSubmit={onTransfer} className="mt-4 grid gap-3 rounded border border-slate-200 p-4 md:grid-cols-[1fr_1fr_auto]">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Transfer Out</span>
              <select
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={outPlayerId}
                onChange={(event) => setOutPlayerId(event.target.value)}
              >
                {lineupPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} ({player.team})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-semibold">Transfer In</span>
              <select
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={inPlayerId}
                onChange={(event) => setInPlayerId(event.target.value)}
              >
                {data.market.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} ({player.team}) - Avg {player.recentAverage}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={submitting || data.freeTransfersLeft <= 0}
              className="self-end rounded bg-brand-yellow px-4 py-2 text-sm font-semibold"
            >
              {submitting ? "Processing..." : "Confirm Transfer"}
            </button>
          </form>

          {feedback ? <p className="mt-3 rounded bg-slate-100 p-2 text-sm">{feedback}</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Transfer Market</div>
        <div className="panel-body overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Position</th>
                <th>Salary</th>
                <th>Recent Avg</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {data.market.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.team}</td>
                  <td>{player.position}</td>
                  <td>{player.salary.toFixed(1)}</td>
                  <td>{player.recentAverage}</td>
                  <td className={player.trend === "up" ? "text-emerald-600" : "text-rose-600"}>{player.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Transaction History</div>
        <div className="panel-body overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Time</th>
                <th>Out</th>
                <th>In</th>
                <th>Cost</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.timestamp).toLocaleString()}</td>
                  <td>{item.outPlayer}</td>
                  <td>{item.inPlayer}</td>
                  <td>{item.cost}</td>
                  <td>{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ContentWithSidebar>
  );
}

