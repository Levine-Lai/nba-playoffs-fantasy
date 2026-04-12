"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createLeague, getLeagues, joinLeague } from "@/lib/api";
import { LeaguesResponse } from "@/lib/types";

type LeagueFlowMode = "chooser" | "join" | "create" | null;

function ChevronIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden="true">
      <path d="M2 2L7 7L2 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94a7.48 7.48 0 0 0 .05-.94a7.48 7.48 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.49.49 0 0 0-.49-.42h-3.84a.49.49 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.63-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54a.49.49 0 0 0 .49.42h3.84a.49.49 0 0 0 .49-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
    </svg>
  );
}

export default function LeaguesPage() {
  const [data, setData] = useState<LeaguesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<LeagueFlowMode>(null);
  const [leagueName, setLeagueName] = useState("");
  const [leagueCode, setLeagueCode] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getLeagues()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load leagues."));
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmedName = leagueName.trim();

    if (!trimmedName) {
      setFeedback("League name is required.");
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await createLeague(trimmedName);
      setData(response.leagues);
      setLeagueName("");
      setMode(null);
      setFeedback(`League created. Share code ${response.league.code} with your friends.`);
    } catch (nextError) {
      setFeedback(nextError instanceof Error ? nextError.message : "Failed to create league.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    const trimmedCode = leagueCode.trim().toUpperCase();

    if (!trimmedCode) {
      setFeedback("League code is required.");
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await joinLeague(trimmedCode);
      setData(response.leagues);
      setLeagueCode("");
      setMode(null);
      setFeedback(`Joined ${response.league.name}.`);
    } catch (nextError) {
      setFeedback(nextError instanceof Error ? nextError.message : "Failed to join league.");
    } finally {
      setSubmitting(false);
    }
  }

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
      <section className="panel overflow-hidden">
        <div className="panel-body space-y-6">
          <button
            type="button"
            onClick={() => {
              setMode("chooser");
              setFeedback(null);
            }}
            className="block w-full rounded-sm border-2 border-brand-yellow bg-[#ffde58] px-6 py-4 text-center text-[1.1rem] font-semibold text-black"
          >
            Create and join new leagues
          </button>

          {mode === "chooser" ? (
            <div className="space-y-7">
              <div>
                <h2 className="text-[2.6rem] font-semibold italic uppercase leading-none text-[#111]">Create And Join Leagues</h2>
                <div className="mt-8 space-y-4">
                  <h3 className="text-[2rem] font-semibold text-slate-900">Join a League</h3>
                  <p className="text-[1.05rem] text-slate-700">Join a private league to compete against friends and other game players.</p>
                  <button
                    type="button"
                    onClick={() => setMode("join")}
                    className="rounded-sm border-2 border-brand-yellow bg-[#ffde58] px-6 py-3 text-[1.05rem] font-semibold text-black"
                  >
                    Join a league
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-5 text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[1.05rem] text-slate-700">or</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="space-y-4">
                <h3 className="text-[2rem] font-semibold text-slate-900">Create a new league</h3>
                <p className="text-[1.05rem] text-slate-700">Create a private league to compete against friends.</p>
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className="rounded-sm border-2 border-brand-yellow bg-[#ffde58] px-6 py-3 text-[1.05rem] font-semibold text-black"
                >
                  Create a league
                </button>
              </div>
            </div>
          ) : null}

          {mode === "join" ? (
            <form className="space-y-5" onSubmit={handleJoin}>
              <h2 className="text-[2.6rem] font-semibold italic uppercase leading-none text-[#111]">Join Private League</h2>
              <label className="block text-[1.05rem] text-slate-900">
                <span className="mb-2 block">League code*</span>
                <input
                  value={leagueCode}
                  onChange={(event) => setLeagueCode(event.target.value.toUpperCase())}
                  className="h-14 w-full rounded-sm border border-slate-300 bg-[#efefef] px-4 text-[1.05rem] outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-sm border border-slate-700 bg-white px-6 py-3 text-[1.05rem] font-semibold text-black disabled:opacity-50"
                >
                  Join league
                </button>
                <button type="button" onClick={() => setMode("chooser")} className="rounded-sm px-4 py-3 text-sm font-semibold text-brand-darkBlue">
                  Back
                </button>
              </div>
            </form>
          ) : null}

          {mode === "create" ? (
            <form className="space-y-5" onSubmit={handleCreate}>
              <h2 className="text-[2.6rem] font-semibold italic uppercase leading-none text-[#111]">Create A New Classic League</h2>
              <label className="block text-[1.05rem] text-slate-900">
                <span className="mb-2 block">League name*</span>
                <span className="mb-2 block text-sm text-slate-500">Maximum 30 characters</span>
                <input
                  value={leagueName}
                  onChange={(event) => setLeagueName(event.target.value.slice(0, 30))}
                  className="h-14 w-full rounded-sm border border-slate-300 bg-[#efefef] px-4 text-[1.05rem] outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-sm border-2 border-brand-yellow bg-[#ffde58] px-6 py-3 text-[1.05rem] font-semibold text-black disabled:opacity-50"
                >
                  Create league
                </button>
                <button type="button" onClick={() => setMode("chooser")} className="rounded-sm px-4 py-3 text-sm font-semibold text-brand-darkBlue">
                  Back
                </button>
              </div>
            </form>
          ) : null}

          {feedback ? <p className="text-sm font-semibold text-brand-darkBlue">{feedback}</p> : null}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="sidebar-card__head">Private classic leagues</div>
        <div className="bg-white">
          <div className="grid grid-cols-[minmax(0,1.8fr)_110px_140px_140px_180px] gap-4 border-b border-slate-200 px-4 py-4 text-[1.05rem] text-slate-700">
            <div>League</div>
            <div />
            <div>Current Rank</div>
            <div>Last Rank</div>
            <div />
          </div>

          {data.privateClassic.length ? (
            data.privateClassic.map((league) => (
              <div
                key={league.id}
                className="grid grid-cols-[minmax(0,1.8fr)_110px_140px_140px_180px] items-center gap-4 border-b border-slate-200 px-4 py-4 text-[1.1rem]"
              >
                <Link href={`/leagues/${league.id}`} className="font-semibold text-[#0a3c98] hover:underline">
                  {league.name}
                </Link>
                <div className="text-slate-500">
                  <ChevronIcon />
                </div>
                <div>{league.rank || "-"}</div>
                <div>{league.lastRank || "-"}</div>
                <div className="flex items-center gap-2 font-semibold text-black">
                  <span className="text-[0.95rem]">
                    <GearIcon />
                  </span>
                  <span>Options</span>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-6 text-sm text-slate-700">You have not joined or created any private classic leagues yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
