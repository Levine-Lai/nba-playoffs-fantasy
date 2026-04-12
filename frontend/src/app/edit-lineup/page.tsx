"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ContentWithSidebar from "@/components/ContentWithSidebar";
import CourtPlayerCard from "@/components/CourtPlayerCard";
import InitialTeamBuilder from "@/components/InitialTeamBuilder";
import RightSidebar from "@/components/RightSidebar";
import { getLineup, saveLineup } from "@/lib/api";
import { LineupResponse, Player } from "@/lib/types";

type Zone = "starters" | "bench";

type SwitchConfirm = {
  sourceId: string;
  targetId: string;
};

function closeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function isValidStarterMix(starters: Player[]) {
  const bcCount = starters.filter((player) => player.position === "BC").length;
  const fcCount = starters.filter((player) => player.position === "FC").length;
  return (bcCount === 3 && fcCount === 2) || (bcCount === 2 && fcCount === 3);
}

function findPlayerLocation(lineup: LineupResponse["lineup"], playerId: string): { zone: Zone; index: number } | null {
  const starterIndex = lineup.starters.findIndex((player) => player.id === playerId);
  if (starterIndex !== -1) {
    return { zone: "starters", index: starterIndex };
  }

  const benchIndex = lineup.bench.findIndex((player) => player.id === playerId);
  if (benchIndex !== -1) {
    return { zone: "bench", index: benchIndex };
  }

  return null;
}

function simulateSwitch(lineup: LineupResponse["lineup"], sourceId: string, targetId: string) {
  const sourceLocation = findPlayerLocation(lineup, sourceId);
  const targetLocation = findPlayerLocation(lineup, targetId);

  if (!sourceLocation || !targetLocation) {
    return null;
  }

  const starters = [...lineup.starters];
  const bench = [...lineup.bench];
  const sourcePool = sourceLocation.zone === "starters" ? starters : bench;
  const targetPool = targetLocation.zone === "starters" ? starters : bench;
  const sourcePlayer = sourcePool[sourceLocation.index];
  const targetPlayer = targetPool[targetLocation.index];

  if (!sourcePlayer || !targetPlayer) {
    return null;
  }

  sourcePool[sourceLocation.index] = targetPlayer;
  targetPool[targetLocation.index] = sourcePlayer;

  if (!isValidStarterMix(starters)) {
    return null;
  }

  let captainId = lineup.captainId;
  if (!starters.some((player) => player.id === captainId)) {
    captainId = starters[0]?.id ?? "";
  }

  return { starters, bench, captainId };
}

export default function EditLineupPage() {
  const [data, setData] = useState<LineupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerModalId, setPlayerModalId] = useState<string | null>(null);
  const [switchSourceId, setSwitchSourceId] = useState<string | null>(null);
  const [switchConfirm, setSwitchConfirm] = useState<SwitchConfirm | null>(null);
  const [captainMode, setCaptainMode] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getLineup()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load lineup."))
      .finally(() => setLoading(false));
  }, []);

  const lineupPlayers = useMemo(() => {
    if (!data) {
      return [] as Player[];
    }

    return [...data.lineup.starters, ...data.lineup.bench];
  }, [data]);

  const actionPlayer = useMemo(() => {
    if (!playerModalId) {
      return null;
    }

    return lineupPlayers.find((player) => player.id === playerModalId) ?? null;
  }, [lineupPlayers, playerModalId]);

  const starterFrontCourt = useMemo(() => (data ? data.lineup.starters.filter((player) => player.position === "FC") : []), [data]);
  const starterBackCourt = useMemo(() => (data ? data.lineup.starters.filter((player) => player.position === "BC") : []), [data]);

  const validSwitchTargets = useMemo(() => {
    const ids = new Set<string>();
    if (!switchSourceId || !data) {
      return ids;
    }

    lineupPlayers.forEach((player) => {
      if (player.id !== switchSourceId && simulateSwitch(data.lineup, switchSourceId, player.id)) {
        ids.add(player.id);
      }
    });

    return ids;
  }, [data, lineupPlayers, switchSourceId]);

  const confirmPlayers = useMemo(() => {
    if (!switchConfirm || !data) {
      return { source: null, target: null };
    }

    return {
      source: lineupPlayers.find((player) => player.id === switchConfirm.sourceId) ?? null,
      target: lineupPlayers.find((player) => player.id === switchConfirm.targetId) ?? null
    };
  }, [data, lineupPlayers, switchConfirm]);

  function clearSwitchFlow() {
    setSwitchSourceId(null);
    setSwitchConfirm(null);
  }

  function closePlayerModal() {
    setPlayerModalId(null);
  }

  function handleCardClick(playerId: string) {
    if (switchSourceId && playerId !== switchSourceId) {
      if (!validSwitchTargets.has(playerId)) {
        setFeedback("This player cannot be switched with the selected card because the Starting 5 shape must stay valid.");
        return;
      }

      setSwitchConfirm({ sourceId: switchSourceId, targetId: playerId });
      return;
    }

    setPlayerModalId(playerId);
  }

  function markCaptain(playerId: string) {
    setData((prev) => {
      if (!prev) {
        return prev;
      }

      if (!prev.lineup.starters.some((player) => player.id === playerId)) {
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
    setDirty(true);
    setCaptainMode(false);
    setPlayerModalId(null);
    setFeedback("Captain updated. Click Save to keep this change.");
  }

  function startSwitch(playerId: string) {
    setSwitchSourceId(playerId);
    setSwitchConfirm(null);
    setPlayerModalId(null);
    setCaptainMode(false);
    const sourcePlayer = lineupPlayers.find((player) => player.id === playerId);
    setFeedback(sourcePlayer ? `Switch mode active for ${sourcePlayer.name}. Click any highlighted card to continue.` : "Switch mode active.");
  }

  function applySwitch() {
    if (!data || !switchConfirm) {
      return;
    }

    const nextLineup = simulateSwitch(data.lineup, switchConfirm.sourceId, switchConfirm.targetId);
    if (!nextLineup) {
      setFeedback("That switch is not allowed.");
      clearSwitchFlow();
      return;
    }

    setData({
      ...data,
      lineup: nextLineup
    });
    setDirty(true);
    setFeedback("Player positions updated. Click Save to keep this change.");
    clearSwitchFlow();
  }

  async function onSave() {
    if (!data || !dirty) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const next = await saveLineup({
        captainId: data.lineup.captainId,
        starters: data.lineup.starters,
        bench: data.lineup.bench
      });
      setData(next);
      setDirty(false);
      setCaptainMode(false);
      clearSwitchFlow();
      setFeedback("Line-up saved for this gameweek.");
    } catch (nextError) {
      setFeedback(nextError instanceof Error ? nextError.message : "Failed to save line-up.");
    } finally {
      setSaving(false);
    }
  }

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

  if (!data.hasTeam) {
    return (
      <ContentWithSidebar sidebar={<RightSidebar />}>
        <InitialTeamBuilder initialBudget={data.budget} onCreated={setData} />
      </ContentWithSidebar>
    );
  }

  return (
    <ContentWithSidebar sidebar={<RightSidebar />}>
      <section className="panel">
        <div className="panel-body space-y-3">
          <div>
            <h1 className="text-4xl font-semibold uppercase">{data.gameweek.label}</h1>
            <p className="mt-1 text-sm text-slate-600">Deadline: {new Date(data.gameweek.deadline).toLocaleString()}</p>
            <p className="mt-1 text-sm text-slate-600">
              Free transfers left: {data.transactions.freeLeft} / {data.transactions.weeklyFreeLimit}
            </p>
          </div>
          {feedback ? <p className="rounded bg-slate-100 p-2 text-sm text-slate-700">{feedback}</p> : null}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="bg-[#d7dde3] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#111]">Starting 5</div>
        <div className="court-formation">
          <div className="court-row court-row--top">
            {starterFrontCourt.map((player) => (
              <div
                key={player.id}
                className={`court-slot ${switchSourceId === player.id ? "court-slot--active" : validSwitchTargets.has(player.id) ? "court-slot--highlighted" : ""}`}
              >
                <CourtPlayerCard
                  player={player}
                  captain={data.lineup.captainId === player.id}
                  highlighted={switchSourceId === player.id}
                  selectable={switchSourceId ? validSwitchTargets.has(player.id) || switchSourceId === player.id : true}
                  onClick={() => handleCardClick(player.id)}
                />
              </div>
            ))}
          </div>
          <div className="court-row court-row--bottom">
            {starterBackCourt.map((player) => (
              <div
                key={player.id}
                className={`court-slot ${switchSourceId === player.id ? "court-slot--active" : validSwitchTargets.has(player.id) ? "court-slot--highlighted" : ""}`}
              >
                <CourtPlayerCard
                  player={player}
                  captain={data.lineup.captainId === player.id}
                  highlighted={switchSourceId === player.id}
                  selectable={switchSourceId ? validSwitchTargets.has(player.id) || switchSourceId === player.id : true}
                  onClick={() => handleCardClick(player.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="captain-bar">
        <div className="captain-bar__title">
          <span>Gameday Captain</span>
          <span className="court-card__info">i</span>
        </div>
        <button
          type="button"
          onClick={() => {
            clearSwitchFlow();
            if (captainMode) {
              setCaptainMode(false);
              setFeedback("Captain mode cancelled.");
              return;
            }

            if (data.lineup.captainId) {
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      lineup: {
                        ...prev.lineup,
                        captainId: ""
                      }
                    }
                  : prev
              );
              setDirty(true);
              setFeedback("Captain removed. Click Save to keep the no-captain state.");
              return;
            }

            setCaptainMode(true);
            setFeedback("Captain mode active. Open any starter card and choose Make Captain.");
          }}
          className={`captain-bar__button ${captainMode ? "captain-bar__button--active" : ""}`}
        >
          {captainMode || data.lineup.captainId ? "Cancel" : "Select Captain"}
        </button>
        <button className="captain-bar__button captain-bar__button--save" type="button" onClick={onSave} disabled={!dirty || saving}>
          {saving ? "Saving..." : dirty ? "Save" : "Saved"}
        </button>
      </div>

      <section className="panel overflow-hidden">
        <div className="bg-[#d7dde3] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#111]">Bench</div>
        <div className="panel-body">
          <div className="court-bench">
            {data.lineup.bench.map((player) => (
              <div
                key={player.id}
                className={`court-slot ${switchSourceId === player.id ? "court-slot--active" : validSwitchTargets.has(player.id) ? "court-slot--highlighted" : ""}`}
              >
                <CourtPlayerCard
                  player={player}
                  compact
                  selectable={switchSourceId ? validSwitchTargets.has(player.id) || switchSourceId === player.id : true}
                  highlighted={switchSourceId === player.id}
                  onClick={() => handleCardClick(player.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {actionPlayer ? (
        <div
          className="lineup-modal-overlay"
          onClick={() => {
            closePlayerModal();
          }}
        >
          <div className="lineup-modal" onClick={(event) => event.stopPropagation()}>
            <div className="lineup-modal__head">
              <h2 className="lineup-modal__title">{actionPlayer.name}</h2>
              <button type="button" className="lineup-modal__close" onClick={closePlayerModal}>
                {closeIcon()}
              </button>
            </div>
            <div className="lineup-modal__body">
              <div className="lineup-modal__actions">
                <button type="button" className="lineup-modal__action" onClick={() => startSwitch(actionPlayer.id)}>
                  Switch
                </button>
                {captainMode && data.lineup.starters.some((player) => player.id === actionPlayer.id) ? (
                  <button type="button" className="lineup-modal__action lineup-modal__action--yellow" onClick={() => markCaptain(actionPlayer.id)}>
                    Make Captain
                  </button>
                ) : null}
                <button
                  type="button"
                  className="lineup-modal__action"
                  onClick={() => {
                    setFeedback(`${actionPlayer.name} | ${actionPlayer.team} ${actionPlayer.position} | Next ${actionPlayer.nextOpponent ?? "TBD"}`);
                    closePlayerModal();
                  }}
                >
                  View Information
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {switchConfirm && confirmPlayers.source && confirmPlayers.target ? (
        <div
          className="lineup-modal-overlay"
          onClick={() => {
            clearSwitchFlow();
          }}
        >
          <div className="lineup-modal" onClick={(event) => event.stopPropagation()}>
            <div className="lineup-modal__head">
              <h2 className="lineup-modal__title">Confirm Switch</h2>
              <button type="button" className="lineup-modal__close" onClick={clearSwitchFlow}>
                {closeIcon()}
              </button>
            </div>
            <div className="lineup-modal__body space-y-4">
              <p className="text-sm text-slate-700">Switch {confirmPlayers.source.name} with {confirmPlayers.target.name}?</p>
              <div className="lineup-modal__actions">
                <button type="button" className="lineup-modal__action lineup-modal__action--yellow" onClick={applySwitch}>
                  Switch
                </button>
                <button type="button" className="lineup-modal__action" onClick={clearSwitchFlow}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </ContentWithSidebar>
  );
}
