"use client";

import Link from "next/link";
import { FormEvent, SyntheticEvent, useEffect, useMemo, useState } from "react";
import { createTransfer, getPlayers, getTransactionsOptions } from "@/lib/api";
import { Player, TransactionsResponse } from "@/lib/types";

type SortMode = "salary" | "totalPoints" | "recentAverage";

type TeamOption = {
  id: number;
  name: string;
};

type PendingDraft = {
  outPlayer: Player;
  inPlayer: Player | null;
};

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

function parseView(view: string) {
  if (!view || view === "all") {
    return { position: undefined, teamId: undefined };
  }

  if (view.startsWith("position:")) {
    return { position: view.replace("position:", ""), teamId: undefined };
  }

  if (view.startsWith("team:")) {
    return { position: undefined, teamId: view.replace("team:", "") };
  }

  return { position: undefined, teamId: undefined };
}

function formatPlayerName(name: string) {
  return name.replace(/\./g, ". ").replace(/\s+/g, " ").trim();
}

function closeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const MAX_COST_OPTIONS = Array.from({ length: 38 }, (_, index) => (23 - index * 0.5).toFixed(1));

export default function TransactionsPage() {
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [selection, setSelection] = useState<Player[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<PendingDraft[]>([]);
  const [replacementFocusId, setReplacementFocusId] = useState<string | null>(null);
  const [playerModalId, setPlayerModalId] = useState<string | null>(null);
  const [candidateModalId, setCandidateModalId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);

  const [view, setView] = useState("all");
  const [sort, setSort] = useState<SortMode>("salary");
  const [search, setSearch] = useState("");
  const [maxSalary, setMaxSalary] = useState("");

  const lineupPlayers = useMemo(() => {
    if (!data) {
      return [] as Player[];
    }

    return [...data.lineup.starters, ...data.lineup.bench];
  }, [data]);

  const groupedRoster = useMemo(() => groupPlayers(lineupPlayers), [lineupPlayers]);

  const focusedOutPlayer = useMemo(() => {
    if (!replacementFocusId) {
      return null;
    }

    const draftMatch = pendingDrafts.find((draft) => draft.outPlayer.id === replacementFocusId);
    if (draftMatch) {
      return draftMatch.outPlayer;
    }

    return lineupPlayers.find((player) => player.id === replacementFocusId) ?? null;
  }, [lineupPlayers, pendingDrafts, replacementFocusId]);

  async function loadSelection() {
    setLoadingSelection(true);
    try {
      const parsedView = parseView(view);
      const effectivePosition = focusedOutPlayer?.position ?? parsedView.position;
      const response = await getPlayers({
        position: effectivePosition || undefined,
        teamId: parsedView.teamId || undefined,
        sort,
        search: search || undefined,
        maxSalary: maxSalary || undefined,
        limit: 120
      });

      setSelection(response.players);
      setTeamOptions(
        response.meta.teams
          .slice()
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((team) => ({ id: team.id, name: team.name }))
      );
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
      })
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Failed to load transaction data."));
  }, []);

  useEffect(() => {
    void loadSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sort, replacementFocusId, search, maxSalary]);

  const actionPlayer = useMemo(() => {
    if (!playerModalId) {
      return null;
    }

    return lineupPlayers.find((player) => player.id === playerModalId) ?? pendingDrafts.find((draft) => draft.outPlayer.id === playerModalId)?.outPlayer ?? null;
  }, [lineupPlayers, pendingDrafts, playerModalId]);

  const actionPlayerDraft = useMemo(() => {
    if (!actionPlayer) {
      return null;
    }

    return pendingDrafts.find((draft) => draft.outPlayer.id === actionPlayer.id) ?? null;
  }, [actionPlayer, pendingDrafts]);

  const candidatePlayer = useMemo(() => {
    if (!candidateModalId) {
      return null;
    }

    return selection.find((player) => player.id === candidateModalId) ?? null;
  }, [selection, candidateModalId]);

  const isDefaultSelectionView = view === "all" && !search.trim() && !maxSalary && !focusedOutPlayer;
  const selectionLimit = focusedOutPlayer ? 10 : isDefaultSelectionView ? 5 : undefined;
  const groupedSelection = useMemo(() => {
    return groupPlayers(selection).map((group) => ({
      ...group,
      players: typeof selectionLimit === "number" ? group.players.slice(0, selectionLimit) : group.players
    }));
  }, [selection, selectionLimit]);

  const totalOutgoing = pendingDrafts.reduce((sum, draft) => sum + draft.outPlayer.salary, 0);
  const totalIncoming = pendingDrafts.reduce((sum, draft) => sum + (draft.inPlayer?.salary ?? 0), 0);
  const budgetCost = Number(Math.max(0, totalIncoming - totalOutgoing).toFixed(1));
  const projectedBank = data ? Number((data.bank + totalOutgoing - totalIncoming).toFixed(1)) : 0;
  const allDraftsFilled = pendingDrafts.length > 0 && pendingDrafts.every((draft) => draft.inPlayer);
  const canSubmit = Boolean(allDraftsFilled && projectedBank >= 0 && !submitting);
  const displayedSelectionCount = groupedSelection.reduce((total, group) => total + group.players.length, 0);

  function upsertDraft(player: Player, keepReplacement: boolean) {
    setPendingDrafts((current) => {
      const existing = current.find((draft) => draft.outPlayer.id === player.id);
      if (existing) {
        return current.map((draft) =>
          draft.outPlayer.id === player.id
            ? {
                ...draft,
                inPlayer: keepReplacement ? draft.inPlayer : null
              }
            : draft
        );
      }

      return [
        ...current,
        {
          outPlayer: player,
          inPlayer: null
        }
      ];
    });
  }

  function removePlayer(player: Player) {
    upsertDraft(player, false);
    setReplacementFocusId(player.id);
    setPlayerModalId(null);
    setFeedback(`${player.name} has been marked for removal.`);
  }

  function restorePlayer() {
    if (!actionPlayer) {
      return;
    }

    setPendingDrafts((current) => current.filter((draft) => draft.outPlayer.id !== actionPlayer.id));
    setReplacementFocusId((current) => (current === actionPlayer.id ? null : current));
    setPlayerModalId(null);
    setConfirmOpen(false);
    setFeedback(`${actionPlayer.name} was restored to your team.`);
  }

  function selectReplacementFor(player: Player) {
    upsertDraft(player, true);
    setReplacementFocusId(player.id);
    setPlayerModalId(null);
    setFeedback(`Choose a ${player.position} replacement for ${player.name}.`);
  }

  async function confirmTransfer() {
    if (!pendingDrafts.length || pendingDrafts.some((draft) => !draft.inPlayer)) {
      setConfirmOpen(false);
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      let latestPayload: TransactionsResponse | null = null;
      for (const draft of pendingDrafts) {
        if (!draft.inPlayer) {
          continue;
        }

        const response = await createTransfer(draft.outPlayer.id, draft.inPlayer.id);
        latestPayload = response.payload;
      }

      if (latestPayload) {
        setData(latestPayload);
      }
      setPendingDrafts([]);
      setReplacementFocusId(null);
      setConfirmOpen(false);
      setPlayerModalId(null);
      setCandidateModalId(null);
      setFeedback("Transaction completed successfully.");
      await loadSelection();
    } catch (nextError) {
      setFeedback(nextError instanceof Error ? nextError.message : "Transfer failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onTransfer(event: FormEvent) {
    event.preventDefault();

    if (!pendingDrafts.length) {
      setFeedback("Remove one or more players and choose replacements first.");
      return;
    }

    if (pendingDrafts.some((draft) => !draft.inPlayer)) {
      setFeedback("Every removed player needs a replacement before you can confirm transactions.");
      return;
    }

    if (projectedBank < 0) {
      setFeedback("Money Remaining must stay at 0 or above before you confirm the transaction.");
      return;
    }

    setConfirmOpen(true);
  }

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

  return (
    <>
      <div className="space-y-5">
        <section className="panel">
          <div className="panel-body space-y-4">
            <div className="border-b border-slate-200 pb-3 text-center">
              <h1 className="text-[2.2rem] font-semibold uppercase leading-none text-[#111]">
                {data.gameweek.label} Deadline: <span className="normal-case">{formatDeadline(data.gameweek.deadline)}</span>
              </h1>
            </div>

            <div className="grid gap-3 md:grid-cols-[220px_220px_1fr_1fr]">
              <button
                type="button"
                onClick={() => setFeedback("Auto Pick will be connected after the main transaction flow is finished.")}
                className="rounded-sm border border-slate-700 bg-white px-4 py-3 text-lg font-semibold text-slate-900"
              >
                Auto Pick
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingDrafts([]);
                  setReplacementFocusId(null);
                  setConfirmOpen(false);
                  setPlayerModalId(null);
                  setCandidateModalId(null);
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
                <strong>{budgetCost.toFixed(1)}</strong>
              </article>
              <article className={`flex items-center justify-between rounded-sm px-4 py-3 text-lg ${projectedBank < 0 ? "bg-[#d11f3a] text-white" : "bg-[#28c5c1] text-[#002b36]"}`}>
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
                    const matchingDraft = pendingDrafts.find((draft) => draft.outPlayer.id === player.id) ?? null;
                    const isRemoved = Boolean(matchingDraft && !matchingDraft.inPlayer);
                    const isReplaced = Boolean(matchingDraft?.inPlayer);
                    const rowPlayer = matchingDraft?.inPlayer ?? player;

                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => {
                          setPlayerModalId(player.id);
                          setFeedback(null);
                        }}
                        className={`grid w-full grid-cols-[1.6fr_100px_110px_110px_120px] items-center border-b border-slate-200 px-5 py-3 text-left transition hover:bg-[#f8fafc] ${
                          isRemoved ? "opacity-35" : isReplaced ? "bg-[rgba(255,219,77,0.18)]" : "bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-700 bg-white text-sm font-semibold">i</span>
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-[#eef1f3]">
                            {rowPlayer.headshotUrl || rowPlayer.headshotFallbackUrl ? (
                              <img
                                src={rowPlayer.headshotUrl ?? rowPlayer.headshotFallbackUrl ?? ""}
                                alt=""
                                className="h-full w-full object-cover object-top"
                                onError={(event) => onImageError(event, rowPlayer.headshotFallbackUrl)}
                              />
                            ) : null}
                          </div>
                          <div>
                            <p className="text-[1.1rem] font-semibold leading-tight text-black">{formatPlayerName(rowPlayer.name)}</p>
                            <p className="mt-1 text-[1.05rem] font-bold">
                              <span className="text-brand-darkBlue">{rowPlayer.team}</span>{" "}
                              <span className={rowPlayer.position === "FC" ? "text-brand-pink" : "text-brand-blue"}>{rowPlayer.position}</span>
                            </p>
                            {isReplaced ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand-darkBlue">Replacing {player.name}</p> : null}
                          </div>
                        </div>
                        <div className="text-center text-[1.05rem]">{rowPlayer.salary.toFixed(1)}</div>
                        <div className="text-center text-[1.05rem]">{(rowPlayer.recentAverage ?? 0).toFixed(1)}</div>
                        <div className="text-center text-[1.05rem]">{(rowPlayer.totalPoints ?? 0).toFixed(1)}</div>
                        <div className="flex items-center justify-end gap-2 text-right">
                          <span className="text-xs text-slate-500">{nextOpponentText(rowPlayer)}</span>
                          {rowPlayer.teamLogoUrl || rowPlayer.teamLogoFallbackUrl ? (
                            <img
                              src={rowPlayer.teamLogoUrl ?? rowPlayer.teamLogoFallbackUrl ?? ""}
                              alt=""
                              className="h-8 w-8 object-contain"
                              onError={(event) => onImageError(event, rowPlayer.teamLogoFallbackUrl)}
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
                disabled={!canSubmit}
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
                  <option value="all">All players</option>
                  <option value="position:FC">Front Court</option>
                  <option value="position:BC">Back Court</option>
                  {teamOptions.map((team) => (
                    <option key={team.id} value={`team:${team.id}`}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                <span className="mb-2 block text-[1.05rem]">Sorted by</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="w-full rounded-sm border px-4 py-3 text-[1.05rem]">
                  <option value="salary">Salary</option>
                  <option value="totalPoints">Total points</option>
                  <option value="recentAverage">Average points</option>
                </select>
              </label>

              <div className="space-y-4">
                <label className="block text-sm text-slate-700">
                  <span className="mb-2 block text-[1.05rem]">Search player list</span>
                  <div className="flex items-center overflow-hidden rounded-sm border bg-[#efefef]">
                    <div className="grid h-12 w-12 place-items-center bg-brand-yellow text-xl font-bold text-black">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                        <path d="M16 16L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
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
                  <select
                    value={maxSalary}
                    onChange={(event) => setMaxSalary(event.target.value)}
                    className="w-full rounded-sm border px-4 py-3 text-[1.05rem]"
                  >
                    <option value="">Any price</option>
                    {MAX_COST_OPTIONS.map((price) => (
                      <option key={price} value={price}>
                        {price}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="text-center text-[1.05rem] font-semibold text-brand-darkBlue">
                {loadingSelection ? "Loading players..." : `${displayedSelectionCount} players shown`}
              </p>
              {focusedOutPlayer ? <p className="text-center text-sm text-slate-600">Showing {focusedOutPlayer.position} replacements for {focusedOutPlayer.name}</p> : null}
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
                    const isSelected = pendingDrafts.some((draft) => draft.inPlayer?.id === player.id);
                    const selectable = !focusedOutPlayer || player.position === focusedOutPlayer.position;
                    return (
                      <div
                        key={player.id}
                        className={`grid grid-cols-[1fr_62px_62px] items-center border-b border-slate-200 px-4 py-2 ${
                          isSelected ? "bg-[rgba(255,219,77,0.18)]" : "bg-white"
                        } ${selectable ? "" : "opacity-45"}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${player.position === "FC" ? "border-brand-pink text-brand-pink" : "border-brand-blue text-brand-blue"}`}>
                            i
                          </span>
                  <button
                            type="button"
                            disabled={!selectable}
                            onClick={() => {
                              if (!focusedOutPlayer) {
                                setFeedback("Select a player on the left, then choose Select Replacement.");
                                return;
                              }

                              if (isSelected) {
                                setFeedback(`${player.name} is already being used in another pending transaction.`);
                                return;
                              }
                              setCandidateModalId(player.id);
                            }}
                            className="h-11 w-11 shrink-0 overflow-hidden rounded-sm bg-[#eef1f3] disabled:cursor-not-allowed"
                          >
                            {player.headshotUrl || player.headshotFallbackUrl ? (
                              <img
                                src={player.headshotUrl ?? player.headshotFallbackUrl ?? ""}
                                alt={player.name}
                                className="h-full w-full object-cover object-top"
                                onError={(event) => onImageError(event, player.headshotFallbackUrl)}
                              />
                            ) : null}
                          </button>
                          <div>
                            <p className="text-[1rem] leading-tight text-black">{formatPlayerName(player.name)}</p>
                            <p className="mt-1 text-[1rem] font-bold">
                              <span className="text-brand-darkBlue">{player.team}</span>{" "}
                              <span className={player.position === "FC" ? "text-brand-pink" : "text-brand-blue"}>{player.position}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-center text-[1rem]">{player.salary.toFixed(1)}</div>
                        <div className="text-center text-[1rem]">{(player.recentAverage ?? 0).toFixed(1)}</div>
                      </div>
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

      {candidatePlayer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.38)] px-4" onClick={() => setCandidateModalId(null)}>
          <div className="w-full max-w-[640px] overflow-hidden rounded-md bg-white shadow-[0_20px_60px_rgba(0,0,0,0.24)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between bg-[linear-gradient(180deg,#c4ced4,#e6e6e6)] px-4 py-4">
              <h2 className="text-[2rem] font-semibold italic leading-none text-[#111]">{candidatePlayer.name}</h2>
              <button type="button" onClick={() => setCandidateModalId(null)} className="grid h-12 w-12 place-items-center rounded-sm bg-brand-pink text-white">
                {closeIcon()}
              </button>
            </div>
            <div className="space-y-3 px-6 py-8">
              <button
                type="button"
                onClick={() => {
                  if (!focusedOutPlayer) {
                    setFeedback("Select a player on the left, then choose Select Replacement.");
                    setCandidateModalId(null);
                    return;
                  }

                  setPendingDrafts((current) =>
                    current.map((draft) =>
                      draft.outPlayer.id === focusedOutPlayer.id
                        ? {
                            ...draft,
                            inPlayer: candidatePlayer
                          }
                        : draft
                    )
                  );
                  setReplacementFocusId(null);
                  setCandidateModalId(null);
                  setFeedback(`${candidatePlayer.name} is now lined up to replace ${focusedOutPlayer.name}.`);
                }}
                className="block w-full rounded-sm border-2 border-[#efc21d] bg-[#ffde58] px-6 py-4 text-center text-[1.05rem] font-semibold text-black"
              >
                Add player
              </button>
              <button
                type="button"
                onClick={() => {
                  setFeedback(`${candidatePlayer.name} | ${candidatePlayer.team} ${candidatePlayer.position} | Salary ${candidatePlayer.salary.toFixed(1)}`);
                  setCandidateModalId(null);
                }}
                className="block w-full rounded-sm border-2 border-brand-blue bg-white px-6 py-4 text-center text-[1.05rem] font-semibold text-brand-blue"
              >
                View information
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actionPlayer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.38)] px-4" onClick={() => setPlayerModalId(null)}>
          <div className="w-full max-w-[640px] overflow-hidden rounded-md bg-white shadow-[0_20px_60px_rgba(0,0,0,0.24)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between bg-[linear-gradient(180deg,#c4ced4,#e6e6e6)] px-4 py-4">
              <h2 className="text-[2rem] font-semibold italic leading-none text-[#111]">{actionPlayer.name}</h2>
              <button type="button" onClick={() => setPlayerModalId(null)} className="grid h-12 w-12 place-items-center rounded-sm bg-brand-pink text-white">
                {closeIcon()}
              </button>
            </div>
            <div className="space-y-3 px-6 py-8">
              <button
                type="button"
                onClick={() => {
                  if (actionPlayerDraft?.outPlayer.id === actionPlayer.id) {
                    restorePlayer();
                    return;
                  }

                  removePlayer(actionPlayer);
                }}
                className="block w-full rounded-sm border-2 border-brand-blue bg-white px-6 py-4 text-center text-[1.05rem] font-semibold text-brand-blue"
              >
                {actionPlayerDraft?.outPlayer.id === actionPlayer.id ? "Restore Player" : "Remove Player"}
              </button>
              <button
                type="button"
                onClick={() => selectReplacementFor(actionPlayer)}
                className="block w-full rounded-sm border-2 border-[#efc21d] bg-[#ffde58] px-6 py-4 text-center text-[1.05rem] font-semibold text-black"
              >
                Select Replacement
              </button>
              <button
                type="button"
                onClick={() => {
                  setFeedback(`${actionPlayer.name} | ${actionPlayer.team} ${actionPlayer.position} | Salary ${actionPlayer.salary.toFixed(1)}`);
                  setPlayerModalId(null);
                }}
                className="block w-full rounded-sm border-2 border-brand-blue bg-white px-6 py-4 text-center text-[1.05rem] font-semibold text-brand-blue"
              >
                View Information
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen && pendingDrafts.length ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.42)] px-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-[700px] overflow-hidden rounded-md bg-white shadow-[0_20px_60px_rgba(0,0,0,0.24)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between bg-[linear-gradient(180deg,#c4ced4,#e6e6e6)] px-4 py-4">
              <h2 className="text-[2rem] font-semibold italic leading-none text-[#111]">Confirm Transactions</h2>
              <button type="button" onClick={() => setConfirmOpen(false)} className="grid h-12 w-12 place-items-center rounded-sm bg-brand-pink text-white">
                {closeIcon()}
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="grid grid-cols-[1fr_1fr_160px] gap-4 border-b border-slate-200 pb-3 text-[1.05rem] text-slate-700">
                <div>Out</div>
                <div>In</div>
                <div>Cost</div>
              </div>
              {pendingDrafts.map((draft) => (
                <div key={draft.outPlayer.id} className="grid grid-cols-[1fr_1fr_160px] gap-4 border-b border-slate-200 py-4 text-[1.1rem] text-black">
                  <div>{draft.outPlayer.name}</div>
                  <div>{draft.inPlayer?.name ?? "-"}</div>
                  <div>{Math.max(0, Number((draft.inPlayer?.salary ?? 0) - draft.outPlayer.salary)).toFixed(1)}</div>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1fr_160px] gap-4 border-b border-slate-200 py-4 text-[1.1rem] text-black">
                <div />
                <div>Total cost</div>
                <div>{budgetCost.toFixed(1)}</div>
              </div>

              <div className="mt-6 rounded-sm bg-brand-blue px-8 py-7 text-center text-[1.1rem] font-semibold leading-8 text-white">
                This transaction will be active for {data.gameweek.label} ({formatDeadline(data.gameweek.deadline)}) with Money Remaining at {projectedBank.toFixed(1)}.
              </div>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => void confirmTransfer()}
                  disabled={submitting}
                  className="block w-full rounded-sm border-2 border-[#efc21d] bg-[#ffde58] px-6 py-4 text-center text-[1.15rem] font-semibold text-black disabled:opacity-50"
                >
                  Confirm Transactions
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="block w-full rounded-sm bg-[#3868d8] px-6 py-4 text-center text-[1.15rem] font-semibold text-white"
                >
                  Change Transactions
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
