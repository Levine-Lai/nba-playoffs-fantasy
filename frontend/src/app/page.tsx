"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, getProfile, login, logout, register, updateTeamName } from "@/lib/api";
import { AuthUser } from "@/lib/types";

type Mode = "login" | "register";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [teamNameSaving, setTeamNameSaving] = useState(false);

  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerAccount, setRegisterAccount] = useState("");
  const [registerGameId, setRegisterGameId] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  useEffect(() => {
    const rawUser = window.localStorage.getItem("playoff_user");
    const token = window.localStorage.getItem("playoff_token");
    if (!rawUser) {
      return;
    }

    try {
      const parsedUser = JSON.parse(rawUser) as AuthUser;
      setCurrentUser(parsedUser);

      if (!token) {
        window.localStorage.removeItem("playoff_user");
        setCurrentUser(null);
        return;
      }

      void getMe()
        .then((response) => {
          window.localStorage.setItem("playoff_user", JSON.stringify(response.user));
          setCurrentUser(response.user);
        })
        .catch(() => {
          window.localStorage.removeItem("playoff_token");
          window.localStorage.removeItem("playoff_user");
          setCurrentUser(null);
          setMessage("Session expired. Please sign in again.");
        });
    } catch {
      window.localStorage.removeItem("playoff_user");
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (!currentUser) {
      setTeamName("");
      setTeamNameDraft("");
      return () => {
        active = false;
      };
    }

    void getProfile()
      .then((response) => {
        if (!active) {
          return;
        }

        setTeamName(response.profile.teamName);
        setTeamNameDraft(response.profile.teamName);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setTeamName("");
        setTeamNameDraft("");
      });

    return () => {
      active = false;
    };
  }, [currentUser]);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await login(loginAccount.trim(), loginPassword);
      window.localStorage.setItem("playoff_token", response.token);
      window.localStorage.setItem("playoff_user", JSON.stringify(response.user));
      setCurrentUser(response.user);
      setMessage(`Welcome back, ${response.user.gameId} (${response.user.account}).`);
      router.push("/edit-lineup");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await register(registerAccount.trim(), registerGameId.trim(), registerPassword, registerConfirmPassword);
      window.localStorage.setItem("playoff_token", response.token);
      window.localStorage.setItem("playoff_user", JSON.stringify(response.user));
      setCurrentUser(response.user);
      setMessage(`Account created for ${response.user.gameId} (${response.user.account}).`);
      router.push("/edit-lineup");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to register.");
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    try {
      await logout();
    } catch {
      // Ignore logout API errors and clear local session anyway.
    }

    window.localStorage.removeItem("playoff_token");
    window.localStorage.removeItem("playoff_user");
    setCurrentUser(null);
    setTeamName("");
    setTeamNameDraft("");
    setMessage("Logged out.");
  }

  async function onTeamNameSubmit(event: FormEvent) {
    event.preventDefault();

    const nextTeamName = teamNameDraft.trim();
    if (!nextTeamName) {
      setMessage("Team name is required.");
      return;
    }

    setTeamNameSaving(true);
    setMessage(null);

    try {
      const response = await updateTeamName(nextTeamName);
      setTeamName(response.teamName);
      setTeamNameDraft(response.teamName);
      setMessage("Team name updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update team name.");
    } finally {
      setTeamNameSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[480px]">
      <section className="panel">
        <div className="panel-head">{currentUser ? "Home" : "Account"}</div>
        <div className="panel-body">
          {currentUser ? (
            <div className="space-y-4">
              <div className="rounded border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.06em] text-emerald-800">Logged in</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Team Name</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{teamName || currentUser.gameId}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Player Name</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">{currentUser.gameId}</p>
                <p className="mt-2 text-sm text-slate-600">Your team is ready to manage.</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Account</p>
                <p className="mt-1 text-base font-semibold text-slate-700">{currentUser.account}</p>
              </div>
              <form className="space-y-3 rounded border border-slate-200 bg-white p-4" onSubmit={onTeamNameSubmit}>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Edit Team Name</p>
                  <p className="mt-1 text-xs text-slate-500">This updates the team name shown in profile and points views.</p>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Team Name</span>
                  <input
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={teamNameDraft}
                    onChange={(event) => setTeamNameDraft(event.target.value)}
                    type="text"
                    maxLength={30}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded bg-brand-blue px-3 py-2 text-sm font-semibold text-white hover:bg-brand-darkBlue"
                  disabled={teamNameSaving}
                >
                  {teamNameSaving ? "Saving..." : "Save Team Name"}
                </button>
              </form>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link className="rounded bg-brand-yellow px-3 py-3 text-center text-sm font-semibold" href="/edit-lineup">
                  Edit Line-up
                </Link>
                <Link className="rounded bg-brand-blue px-3 py-3 text-center text-sm font-semibold text-white" href="/transactions">
                  Transactions
                </Link>
                <Link className="rounded bg-slate-100 px-3 py-3 text-center text-sm font-semibold" href="/points">
                  Points
                </Link>
                <Link className="rounded bg-slate-100 px-3 py-3 text-center text-sm font-semibold" href="/schedule">
                  Schedule
                </Link>
              </div>
              <button type="button" className="w-full rounded bg-slate-900 px-3 py-3 text-sm font-semibold text-white" onClick={onLogout}>
                Log Out
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`rounded px-3 py-2 text-sm font-semibold ${
                    mode === "login" ? "bg-brand-yellow" : "bg-slate-100"
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={`rounded px-3 py-2 text-sm font-semibold ${
                    mode === "register" ? "bg-brand-yellow" : "bg-slate-100"
                  }`}
                >
                  Register
                </button>
              </div>

              {mode === "login" ? (
                <form className="space-y-4" onSubmit={onLogin}>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Account</span>
                    <input
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      value={loginAccount}
                      onChange={(event) => setLoginAccount(event.target.value)}
                      type="text"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Password</span>
                    <input
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      type="password"
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded bg-brand-blue px-3 py-2 text-base font-semibold text-white hover:bg-brand-darkBlue"
                    disabled={loading}
                  >
                    {loading ? "Signing in..." : "Sign In"}
                  </button>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={onRegister}>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Account (for login)</span>
                    <input
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      value={registerAccount}
                      onChange={(event) => setRegisterAccount(event.target.value)}
                      type="text"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Player Name</span>
                    <input
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      value={registerGameId}
                      onChange={(event) => setRegisterGameId(event.target.value)}
                      type="text"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Password</span>
                    <input
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      type="password"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Confirm Password</span>
                    <input
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      value={registerConfirmPassword}
                      onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                      type="password"
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded bg-brand-blue px-3 py-2 text-base font-semibold text-white hover:bg-brand-darkBlue"
                    disabled={loading}
                  >
                    {loading ? "Creating..." : "Create Account"}
                  </button>
                </form>
              )}
            </>
          )}

          {message ? <p className="mt-3 rounded bg-slate-100 p-2 text-sm text-slate-700">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}
