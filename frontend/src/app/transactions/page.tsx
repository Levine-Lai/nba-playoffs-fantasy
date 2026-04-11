"use client";

import Link from "next/link";
import { FormEvent, SyntheticEvent, useEffect, useMemo, useState } from "react";
import { createTransfer, getPlayers, getTransactionsOptions } from "@/lib/api";
import { Player, TransactionsResponse } from "@/lib/types";

function onImageError(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
}

function formatDeadline(deadline: string) {
  const date = new Date(deadline);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function groupPlayers(players: Player[]) {
  return [
    { key: "FC", label: "Front Court", colorClass: "selection-band-fc", players: players.filter((player) => player.position === "FC") },
    { key: "BC", label: "Back Court", colorClass: "selection-band-bc", players: players.filter((player) => player.position === "BC") }
  ].filter((group) => group.players.length > 0);
}

function nextOpponentText(player: Player) {
  if (player.nextOpponent && player.nextOpponent !== "TBD") {
    return `Next ${player.nextOpponent}`;
  }

  if (player.upcoming?.length) {
    return `Upcoming ${player.upcoming.join(" / ")}`;
  }

  return "Schedule TBD";
}

export default function TransactionsPage() {
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [selection, setSelection] = useState<Player[]>([]);
  const [selectedOutId, setSelectedOutId] = useState("");
  const [selectedInId, setSelectedInId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState("");
  const [sort, setSort] = useState<"salary" | "totalPoints" | "recentAverage">("salary");
  const [search, setSearch] = useState("");
  const [maxSalary, setMaxSalary] = useState("");

  async function loadSelection() {
    setLoadingSelection(true);
    try {
      const response = await getPlayers({
        position: view || undefined,
        sort,
        search: search || undefined,
        maxSalary: maxSalary || undefined,
        limit: 120
      });
      setSelection(response.players);
    } catch (nextError) {
      setFeedback(nextError instanceof Error ? nextError.message : "Failed to load player selection.");
    } finally {
      setLoadingSelection(false);
    }
  }

  useEffect(() => {
    getTransactionsOptions()
      .then((payload) => {
        setData(payload);
        const allLineup = [...payload.lineup.starters, ...payload.lineup.bench];
        const firstOut = allLineup.find((player) => player.position === "FC") ?? allLineup[0];
        setSelectedOutId(firstOut?.id ?? "");
      })
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Failed to load transaction data."));
  }, []);

  useEffect(() => {
    loadSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sort]);

  useEffect(() => {
    if (!selection.length) {
      setSelectedInId("");
      return;
    }

    const selectedOut = data ? [...data.lineup.starters, ...data.lineup.bench].find((player) => player.id === selectedOutId) : null;
    const firstMatch = selection.find((player) => !selectedOut || player.position === selectedOut.position);
    setSelectedInId((current) => {
      if (current && selection.some((player) => player.id === current && (!selectedOut || player.position === selectedOut.position))) {
        return current;
      }
      return firstMatch?.id ?? selection[0]?.id ?? "";
    });
  }, [selection, data, selectedOutId]);

  const lineupPlayers = useMemo(() => {
    if (!data) {
      return [] as Player[];
    }

    return [...data.lineup.starters, ...data.lineup.bench];
  }, [data]);

  const groupedRoster = useMemo(() => groupPlayers(lineupPlayers), [lineupPlayers]);
  const groupedSelection = useMemo(() => {
    const groups = groupPlayers(selection).map((group) => ({
      ...group,
      players: group.players.slice(0, 5)
    }));
    return groups;
  }, [selection]);

  const selectedOut = lineupPlayers.find((player) => player.id === selectedOutId) ?? null;
  const selectedIn = selection.find((player) => player.id === selectedInId) ?? null;
  const transactionCost = selectedOut && selectedIn ? Number((selectedIn.salary - selectedOut.salary).toFixed(1)) : 0;
  const projectedBank = data && selectedOut && selectedIn ? Number((data.bank + selectedOut.salary - selectedIn.salary).toFixed(1)) : data?.bank ?? 0;

  if (!data && !error) {
    return <div className="panel panel-body">Loading transfer market...</div>;
  }

  if (error || !data) {
    return (
      <section className="panel">
        <div className="panel-head">Access Required</div>
        <div className="panel-body space-y-3 text-sm text-slate-700">
          <p>{error ?? "Please log in first."}</p>
          <Link href="/" className="nba-button-blue">
            Back To Login
          </Link>
        </div>
      </section>
    );
  }

  if (!data.hasTeam) {
    return (
      <section className="panel">
        <div className="panel-head">Create Team First</div>
        <div className="panel-body space-y-3 text-sm text-slate-700">
          <p>You need to create your initial 10-player team before making transfers.</p>
          <Link href="/edit-lineup" className="nba-button-blue">
            Create Initial Team
          </Link>
        </div>
      </section>
    );
  }

  async function onTransfer(event: FormEvent) {
    event.preventDefault();
    if (!selectedOut || !selectedIn) {
      setFeedback("Choose one player to transfer out and one player to transfer in.");
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await createTransfer(selectedOut.id, selectedIn.id);
      setData(response.payload);
      const allLineup = [...response.payload.lineup.starters, ...response.payload.lineup.bench];
      const firstOut = allLineup.find((player) => player.position === "FC") ?? allLineup[0];
      setSelectedOutId(firstOut?.id ?? "");
      setFeedback("Transfer completed successfully.");
      await loadSelection();
    } catch (nextError) {
      setFeedback(nextError instanceof Error ? nextError.message : "Transfer failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel">
        <div className="panel-body space-y-4">
          <div className="border-b border-slate-200 pb-3 text-center">
            <h1 className="text-[2.2rem] font-semibold uppercase leading-none text-[#111]">
              {data.gameweek.label} Deadline: <span className="normal-case">{formatDeadline(data.gameweek.deadline)}</span>
            </h1>
          </div>

          <div className="grid gap-3 md:grid-cols-[220px_220px_1fr_1fr]">
            <button type="button" className="rounded-sm border border-slate-700 bg-white px-4 py-3 text-lg font-semibold text-slate-900">
              Auto Pick
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedOutId(lineupPlayers.find((player) => player.position === "FC")?.id ?? lineupPlayers[0]?.id ?? "");
                setSelectedInId("");
                setFeedback(null);
              }}
              className="rounded-sm border border-slate-700 bg-white px-4 py-3 text-lg font-semibold text-slate-900"
            >
              Reset
            </button>
            <div className="flex items-center justify-between rounded-sm border-2 border-brand-yellow bg-white px-5 py-3 text-lg">
              <span>Wildcard</span>
              <span className="font-semibold">Played</span>
            </div>
            <div className="flex items-center justify-between rounded-sm border-2 border-brand-yellow bg-white px-5 py-3 text-lg">
              <span>All-Star</span>
              <span className="font-semibold">Played</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="flex items-center justify-between rounded-sm border-2 border-brand-yellow bg-white px-4 py-3 text-lg">
              <span>Free Transactions</span>
              <strong>{data.transferMode === "LIMITLESS" ? "Unlimited" : data.freeTransfersLeft}</strong>
            </article>
            <article className="flex items-center justify-between rounded-sm border-2 border-brand-yellow bg-white px-4 py-3 text-lg">
              <span>Cost</span>
              <strong>{transactionCost.toFixed(1)}</strong>
            </article>
            <article className="flex items-center justify-between rounded-sm bg-[#28c5c1] px-4 py-3 text-lg text-[#002b36]">
              <span>Money Remaining</span>
              <strong>{projectedBank.toFixed(1)}</strong>
            </article>
          </div>
        </div>
      </section>

      <form onSubmit={onTransfer} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="panel overflow-hidden">
          <div className="bg-white">
            {groupedRoster.map((group) => (
              <div key={group.key}>
                <div className={`${group.colorClass} grid grid-cols-[1.6fr_100px_110px_110px_120px] items-center px-5 py-3 text-sm`}>
                  <div className="text-[1rem]">{group.label}</div>
                  <div className="text-center">$S</div>
                  <div className="text-center">F.</div>
                  <div className="text-center">TP.</div>
                  <div className="text-center">Schedule</div>
                </div>

                {group.players.map((player) => {
                  const isSelected = player.id === selectedOutId;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => {
                        setSelectedOutId(player.id);
                        setFeedback(null);
                      }}
                      className={`grid w-full grid-cols-[1.6fr_100px_110px_110px_120px] items-center border-b border-slate-200 px-5 py-3 text-left transition hover:bg-[#f8fafc] ${
                        isSelected ? "bg-[rgba(255,219,77,0.18)]" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-700 bg-white text-sm font-semibold">i</span>
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-[#eef1f3]">
                          {player.headshotUrl || player.headshotFallbackUrl ? (
                            <img
                              src={player.headshotUrl ?? player.headshotFallbackUrl ?? ""}
                              alt=""
                              className="h-full w-full object-cover object-top"
                              onError={(event) => onImageError(event, player.headshotFallbackUrl)}
                            />
                          ) : null}
                        </div>
                        <div>
                          <p className="text-[1.1rem] font-semibold leading-tight text-black">{player.name.replace(".", ". ")}</p>
                          <p className="mt-1 text-[1.05rem] font-bold">
                            <span className="text-brand-darkBlue">{player.team}</span>{" "}
                            <span className={player.position === "FC" ? "text-brand-pink" : "text-brand-blue"}>{player.position}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-center text-[1.05rem]">{player.salary.toFixed(1)}</div>
                      <div className="text-center text-[1.05rem]">{player.recentAverage?.toFixed(1) ?? "0.0"}</div>
                      <div className="text-center text-[1.05rem]">{player.totalPoints?.toFixed(1) ?? "0.0"}</div>
                      <div className="flex items-center justify-end gap-2 text-right">
                        <span className="text-xs text-slate-500">{nextOpponentText(player)}</span>
                        {player.teamLogoUrl || player.teamLogoFallbackUrl ? (
                          <img
                            src={player.teamLogoUrl ?? player.teamLogoFallbackUrl ?? ""}
                            alt=""
                            className="h-8 w-8 object-contain"
                            onError={(event) => onImageError(event, player.teamLogoFallbackUrl)}
                          />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="bg-white px-5 py-5 text-center">
            <button
              type="submit"
              disabled={submitting || !selectedOut || !selectedIn || projectedBank < 0}
              className="mx-auto w-full max-w-[470px] rounded-sm border border-slate-700 bg-white px-6 py-3 text-[1.05rem] font-semibold text-black disabled:opacity-50"
            >
              {submitting ? "Making Transaction..." : "Make Transactions"}
            </button>
            {feedback ? <p className="mt-3 text-sm text-slate-700">{feedback}</p> : null}
          </div>
        </section>

        <aside className="sidebar-card h-fit overflow-hidden">
          <div className="bg-[linear-gradient(180deg,#c4ced4,#e6e6e6)] px-4 py-4 text-[1.1rem] font-semibold text-slate-900">Player Selection</div>
          <div className="space-y-4 bg-white p-4">
            <label className="block text-sm text-slate-700">
              <span className="mb-2 block text-[1.05rem]">View</span>
              <select value={view} onChange={(event) => setView(event.target.value)} className="w-full rounded-sm border px-4 py-3 text-[1.05rem]">
                <option value="">All players</option>
                <option value="FC">Front Court</option>
                <option value="BC">Back Court</option>
              </select>
            </label>

            <label className="block text-sm text-slate-700">
              <span className="mb-2 block text-[1.05rem]">Sorted by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as "salary" | "totalPoints" | "recentAverage")} className="w-full rounded-sm border px-4 py-3 text-[1.05rem]">
                <option value="salary">Salary</option>
                <option value="totalPoints">Total points</option>
                <option value="recentAverage">Average points</option>
              </select>
            </label>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadSelection();
              }}
              className="space-y-4"
            >
              <label className="block text-sm text-slate-700">
                <span className="mb-2 block text-[1.05rem]">Search player list</span>
                <div className="flex items-center overflow-hidden rounded-sm border bg-[#efefef]">
                  <button type="submit" className="grid h-12 w-12 place-items-center bg-brand-yellow text-xl font-bold text-black">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                      <path d="M16 16L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-12 flex-1 border-0 bg-[#efefef] px-3 text-[1rem] outline-none"
                    placeholder="Search player"
                  />
                </div>
              </label>

              <label className="block text-sm text-slate-700">
                <span className="mb-2 block text-[1.05rem]">Max cost</span>
                <input
                  value={maxSalary}
                  onChange={(event) => setMaxSalary(event.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-sm border px-4 py-3 text-[1.05rem]"
                  placeholder="22.9"
                />
              </label>
            </form>

            <p className="text-center text-[1.05rem] font-semibold text-brand-darkBlue">{selection.length} players shown</p>
          </div>

          <div className="max-h-[980px] overflow-y-auto bg-white">
            {groupedSelection.map((group) => (
              <div key={group.key}>
                <div className={`${group.colorClass} grid grid-cols-[1fr_62px_62px] items-center px-4 py-3 text-sm`}>
                  <div>{group.label}</div>
                  <div className="text-center">$</div>
                  <div className="text-center">**</div>
                </div>
                {group.players.map((player) => {
                  const isSelected = player.id === selectedInId;
                  const selectable = !selectedOut || player.position === selectedOut.position;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      disabled={!selectable}
                      onClick={() => {
                        setSelectedInId(player.id);
                        setFeedback(null);
                      }}
                      className={`grid w-full grid-cols-[1fr_62px_62px] items-center border-b border-slate-200 px-4 py-2 text-left transition ${
                        isSelected ? "bg-[rgba(255,219,77,0.18)]" : "bg-white"
                      } ${selectable ? "hover:bg-[#f8fafc]" : "cursor-not-allowed opacity-45"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${player.position === "FC" ? "border-brand-pink text-brand-pink" : "border-brand-blue text-brand-blue"}`}>
                          i
                        </span>
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-sm bg-[#eef1f3]">
                          {player.headshotUrl || player.headshotFallbackUrl ? (
                            <img
                              src={player.headshotUrl ?? player.headshotFallbackUrl ?? ""}
                              alt=""
                              className="h-full w-full object-cover object-top"
                              onError={(event) => onImageError(event, player.headshotFallbackUrl)}
                            />
                          ) : null}
                        </div>
                        <div>
                          <p className="text-[1rem] leading-tight text-black">{player.name.replace(".", ". ")}</p>
                          <p className="mt-1 text-[1rem] font-bold">
                            <span className="text-brand-darkBlue">{player.team}</span>{" "}
                            <span className={player.position === "FC" ? "text-brand-pink" : "text-brand-blue"}>{player.position}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-center text-[1rem]">{player.salary.toFixed(1)}</div>
                      <div className="text-center text-[1rem]">{(player.recentAverage ?? 0).toFixed(1)}</div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>
      </form>

      {data.history.length ? (
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
      ) : null}
    </div>
  );
}
