"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { createInitialTeam, getPlayers } from "@/lib/api";
import { LineupResponse, Player, PlayerDataMeta } from "@/lib/types";

interface InitialTeamBuilderProps {
  initialBudget: number;
  onCreated: (lineup: LineupResponse) => void;
}

type SortMode = "salary" | "totalPoints" | "recentAverage";

function onImageError(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
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

const MAX_COST_OPTIONS = Array.from({ length: 38 }, (_, index) => (23 - index * 0.5).toFixed(1));

export default function InitialTeamBuilder({ initialBudget, onCreated }: InitialTeamBuilderProps) {
  const [selected, setSelected] = useState<Player[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [meta, setMeta] = useState<PlayerDataMeta | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [sort, setSort] = useState<SortMode>("salary");
  const [maxSalary, setMaxSalary] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedIds = useMemo(() => new Set(selected.map((player) => player.id)), [selected]);
  const budgetUsed = useMemo(() => selected.reduce((sum, player) => sum + Number(player.salary), 0), [selected]);
  const budgetLeft = Number((initialBudget - budgetUsed).toFixed(1));
  const bcCount = selected.filter((player) => player.position === "BC").length;
  const fcCount = selected.filter((player) => player.position === "FC").length;
  const rosterSlots = useMemo(() => Array.from({ length: 10 }, (_, index) => selected[index] ?? null), [selected]);
  const groupedPlayers = useMemo(() => {
    return [
      { label: "Front Court", tone: "FC", players: players.filter((player) => player.position === "FC") },
      { label: "Back Court", tone: "BC", players: players.filter((player) => player.position === "BC") }
    ].filter((group) => group.players.length);
  }, [players]);

  const displayedPlayerCount = groupedPlayers.reduce((sum, group) => sum + group.players.length, 0);

  async function loadPlayers() {
    setLoading(true);
    setMessage(null);
    try {
      const parsedView = parseView(view);
      const response = await getPlayers({
        search: search || undefined,
        position: parsedView.position || undefined,
        teamId: parsedView.teamId || undefined,
        maxSalary: maxSalary || undefined,
        sort,
        limit: 120
      });
      setPlayers(response.players);
      setMeta(response.meta);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load players.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sort, search, maxSalary]);

  function addPlayer(player: Player) {
    setMessage(null);

    if (selectedIds.has(player.id)) {
      return;
    }

    if (selected.length >= 10) {
      setMessage("You already selected 10 players.");
      return;
    }

    if (player.position === "BC" && bcCount >= 5) {
      setMessage("You already selected 5 BC players.");
      return;
    }

    if (player.position === "FC" && fcCount >= 5) {
      setMessage("You already selected 5 FC players.");
      return;
    }

    if (budgetLeft - Number(player.salary) < 0) {
      setMessage(`This player would exceed your ${initialBudget.toFixed(1)} budget.`);
      return;
    }

    setSelected((prev) => [...prev, player]);
  }

  function removePlayer(playerId: string) {
    setSelected((prev) => prev.filter((player) => player.id !== playerId));
  }

  async function onCreateTeam() {
    setCreating(true);
    setMessage(null);
    try {
      const response = await createInitialTeam(selected.map((player) => player.id));
      onCreated(response);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create team.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">Create Your Playoff Roster</div>
      <div className="panel-body">
        <div className="mb-4 grid gap-3 text-sm sm:grid-cols-4">
          <div className="builder-metric"><span>Budget left</span><strong>{budgetLeft.toFixed(1)}</strong></div>
          <div className="builder-metric"><span>Selected</span><strong>{selected.length}/10</strong></div>
          <div className="builder-metric"><span>Back Court</span><strong>{bcCount}/5</strong></div>
          <div className="builder-metric"><span>Front Court</span><strong>{fcCount}/5</strong></div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[330px_1fr]">
          <section className="sidebar-card">
            <div className="sidebar-card__head">Selected Squad</div>
            <div className="divide-y divide-slate-200">
              {rosterSlots.map((player, index) => (
                <div key={player?.id ?? `slot-${index}`} className="grid min-h-[58px] grid-cols-[34px_1fr_auto] items-center gap-2 px-3 py-2 text-sm">
                  <span className="grid h-7 w-7 place-items-center rounded-sm bg-[#eef1f3] text-xs font-bold text-slate-700">{index + 1}</span>
                  {player ? (
                    <div className="flex items-center gap-2">
                      {player.teamLogoUrl || player.teamLogoFallbackUrl ? (
                        <img
                          src={player.teamLogoUrl ?? player.teamLogoFallbackUrl ?? ""}
                          alt=""
                          className="h-7 w-7 object-contain"
                          onError={(event) => onImageError(event, player.teamLogoFallbackUrl)}
                        />
                      ) : null}
                      <div>
                        <p className="font-semibold uppercase leading-tight text-brand-darkBlue">{player.name}</p>
                        <p className="text-xs text-slate-500">
                          {player.team} / <span className={player.position === "FC" ? "font-semibold text-brand-pink" : "font-semibold text-brand-blue"}>{player.position}</span> / {player.salary.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold text-slate-500">Empty roster slot</p>
                      <p className="text-xs text-slate-400">Pick 5 BC and 5 FC players.</p>
                    </div>
                  )}
                  {player ? (
                    <button
                      type="button"
                      onClick={() => removePlayer(player.id)}
                      className="rounded-sm border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 p-3">
              <button
                type="button"
                onClick={onCreateTeam}
                disabled={creating || selected.length !== 10 || bcCount !== 5 || fcCount !== 5 || budgetLeft < 0}
                className="nba-button-yellow w-full disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Team"}
              </button>
            </div>
          </section>

          <section className="sidebar-card">
            <div className="sidebar-card__head">Player Selection</div>
            <div className="space-y-4 bg-white p-4">
              <label className="block text-sm text-slate-700">
                <span className="mb-2 block text-[1.05rem]">View</span>
                <select value={view} onChange={(event) => setView(event.target.value)} className="w-full rounded-sm border px-4 py-3 text-[1.05rem]">
                  <option value="all">All players</option>
                  <option value="position:FC">Front Court</option>
                  <option value="position:BC">Back Court</option>
                  {meta?.teams
                    .slice()
                    .sort((left, right) => left.name.localeCompare(right.name))
                    .map((team) => (
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
                <select value={maxSalary} onChange={(event) => setMaxSalary(event.target.value)} className="w-full rounded-sm border px-4 py-3 text-[1.05rem]">
                  <option value="">Any price</option>
                  {MAX_COST_OPTIONS.map((price) => (
                    <option key={price} value={price}>
                      {price}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-center text-[1.05rem] font-semibold text-brand-darkBlue">
                {loading ? "Loading players..." : `${displayedPlayerCount} players shown`}
              </p>
            </div>

            <div className="builder-selection-list">
              <div className="builder-selection-head">
                <div>Player</div>
                <div>Team</div>
                <div>Cost</div>
                <div />
              </div>

              {groupedPlayers.length ? (
                groupedPlayers.map((group) => (
                  <div key={group.label}>
                    <div className={group.tone === "FC" ? "selection-band-fc px-4 py-4 text-[1rem]" : "selection-band-bc px-4 py-4 text-[1rem]"}>
                      {group.label}
                    </div>
                    {group.players.map((player) => {
                      const picked = selectedIds.has(player.id);
                      const limitReached =
                        selected.length >= 10 ||
                        (player.position === "BC" && bcCount >= 5) ||
                        (player.position === "FC" && fcCount >= 5) ||
                        budgetLeft - Number(player.salary) < 0;
                      const addDisabled = picked || limitReached;
                      return (
                        <div key={player.id} className="builder-selection-row">
                          <div className="flex items-center gap-3">
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
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold uppercase text-brand-darkBlue">{player.name}</span>
                                <span
                                  className={`rounded-sm px-1.5 py-0.5 text-[0.7rem] font-bold ${
                                    player.position === "FC"
                                      ? "bg-[rgba(200,16,46,0.12)] text-brand-pink"
                                      : "bg-[rgba(42,99,210,0.12)] text-brand-blue"
                                  }`}
                                >
                                  {player.position}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div>{player.team}</div>
                          <div className="font-semibold">{player.salary.toFixed(1)}</div>
                          <div className="text-right">
                            <button
                              type="button"
                              onClick={() => addPlayer(player)}
                              disabled={addDisabled}
                              className="nba-button-yellow min-h-0 px-4 py-2 text-sm disabled:opacity-40"
                            >
                              {picked ? "Picked" : "Add"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-slate-500">No players found.</div>
              )}
            </div>
          </section>
        </div>

        {message ? <p className="mt-3 rounded-sm bg-[#eef1f3] p-2 text-sm text-slate-700">{message}</p> : null}
      </div>
    </section>
  );
}
