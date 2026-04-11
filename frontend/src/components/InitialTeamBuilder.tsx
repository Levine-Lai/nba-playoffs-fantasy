"use client";

import { Fragment, FormEvent, SyntheticEvent, useEffect, useMemo, useState } from "react";
import { createInitialTeam, getPlayers } from "@/lib/api";
import { LineupResponse, Player, PlayerDataMeta } from "@/lib/types";

interface InitialTeamBuilderProps {
  initialBudget: number;
  onCreated: (lineup: LineupResponse) => void;
}

function onImageError(event: SyntheticEvent<HTMLImageElement>, fallback?: string | null) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
    return;
  }

  image.hidden = true;
}

export default function InitialTeamBuilder({ initialBudget, onCreated }: InitialTeamBuilderProps) {
  const [selected, setSelected] = useState<Player[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [meta, setMeta] = useState<PlayerDataMeta | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [teamId, setTeamId] = useState("");
  const [sort, setSort] = useState<"salary" | "totalPoints" | "recentAverage">("salary");
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
    if (position) {
      return [{ label: position === "BC" ? "Back Court" : "Front Court", tone: position, players }];
    }

    return [
      { label: "Front Court", tone: "FC", players: players.filter((player) => player.position === "FC") },
      { label: "Back Court", tone: "BC", players: players.filter((player) => player.position === "BC") }
    ].filter((group) => group.players.length);
  }, [players, position]);

  async function loadPlayers(next?: { search?: string; position?: string; teamId?: string; maxSalary?: string }) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await getPlayers({
        search: next?.search ?? search,
        position: next?.position ?? position,
        teamId: next?.teamId ?? teamId,
        maxSalary: next?.maxSalary ?? maxSalary,
        sort,
        limit: 80
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
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await loadPlayers();
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
            <form className="grid gap-2 border-b border-slate-200 bg-[#fafafa] p-3 md:grid-cols-2 xl:grid-cols-[140px_150px_1fr_145px_120px_auto]" onSubmit={onSearch}>
              <select
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                className="rounded-sm border px-3 py-2 text-sm"
                aria-label="View"
              >
                <option value="">All players</option>
                <option value="BC">Back Court</option>
                <option value="FC">Front Court</option>
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as "salary" | "totalPoints" | "recentAverage")}
                className="rounded-sm border px-3 py-2 text-sm"
                aria-label="Sorted by"
              >
                <option value="salary">Salary</option>
                <option value="totalPoints">Total points</option>
                <option value="recentAverage">Average points</option>
              </select>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="rounded-sm border px-3 py-2 text-sm"
                placeholder="Search player"
              />
              <select
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                className="rounded-sm border px-3 py-2 text-sm"
              >
                <option value="">All teams</option>
                {meta?.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input
                value={maxSalary}
                onChange={(event) => setMaxSalary(event.target.value)}
                className="rounded-sm border px-3 py-2 text-sm"
                inputMode="decimal"
                placeholder="Max cost"
              />
              <button type="submit" className="nba-button-blue min-h-0 px-4 py-2 text-sm">
                {loading ? "Loading" : "Search"}
              </button>
            </form>

            <div className="max-h-[620px] overflow-auto">
              <table className="table-shell">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>Status</th>
                    <th>Cost</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groupedPlayers.length ? groupedPlayers.map((group) => (
                    <Fragment key={group.label}>
                      <tr>
                        <td colSpan={6} className={group.tone === "FC" ? "selection-band-fc" : "selection-band-bc"}>
                          {group.label}
                        </td>
                      </tr>
                      {group.players.map((player) => (
                        <tr key={player.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              {player.headshotUrl || player.headshotFallbackUrl ? (
                                <img
                                  src={player.headshotUrl ?? player.headshotFallbackUrl ?? ""}
                                  alt=""
                                  className="h-10 w-10 rounded-sm bg-[#eef1f3] object-cover object-top"
                                  onError={(event) => onImageError(event, player.headshotFallbackUrl)}
                                />
                              ) : null}
                              <div>
                                <span className="font-semibold uppercase text-brand-darkBlue">{player.name}</span>
                                <span
                                  className={`ml-2 rounded-sm px-1.5 py-0.5 text-[0.7rem] font-bold ${
                                    player.position === "FC"
                                      ? "bg-[rgba(200,16,46,0.12)] text-brand-pink"
                                      : "bg-[rgba(42,99,210,0.12)] text-brand-blue"
                                  }`}
                                >
                                  {player.position}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>{player.team}</td>
                          <td>{player.status ?? "Available"}</td>
                          <td className="font-semibold">{player.salary.toFixed(1)}</td>
                          <td>{player.totalPoints ?? 0}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => addPlayer(player)}
                              disabled={selectedIds.has(player.id)}
                              className="nba-button-yellow min-h-0 px-3 py-1 text-xs disabled:opacity-40"
                            >
                              {selectedIds.has(player.id) ? "Picked" : "Add"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  )) : (
                    <tr>
                      <td colSpan={6} className="text-center text-slate-500">No players found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {message ? <p className="mt-3 rounded-sm bg-[#eef1f3] p-2 text-sm text-slate-700">{message}</p> : null}
      </div>
    </section>
  );
}
