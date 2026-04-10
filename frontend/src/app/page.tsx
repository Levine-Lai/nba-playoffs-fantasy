"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, logout, register } from "@/lib/api";
import { AuthUser } from "@/lib/types";

type Mode = "login" | "register";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerAccount, setRegisterAccount] = useState("");
  const [registerGameId, setRegisterGameId] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  useEffect(() => {
    const rawUser = window.localStorage.getItem("playoff_user");
    if (!rawUser) {
      return;
    }

    try {
      setCurrentUser(JSON.parse(rawUser));
    } catch {
      window.localStorage.removeItem("playoff_user");
    }
  }, []);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await login(loginAccount, loginPassword);
      window.localStorage.setItem("playoff_token", response.token);
      window.localStorage.setItem("playoff_user", JSON.stringify(response.user));
      setCurrentUser(response.user);
      setMessage(`Welcome back, ${response.user.displayName}.`);
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
      const response = await register(registerAccount, registerGameId, registerPassword, registerConfirmPassword);
      window.localStorage.setItem("playoff_token", response.token);
      window.localStorage.setItem("playoff_user", JSON.stringify(response.user));
      setCurrentUser(response.user);
      setMessage(`Account created for ${response.user.gameId}.`);
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
    setMessage("Logged out.");
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[480px_1fr]">
      <section className="panel">
        <div className="panel-head">Account</div>
        <div className="panel-body">
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
                <span className="mb-1 block text-sm font-semibold text-slate-700">Game ID (self-picked)</span>
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

          {message ? <p className="mt-3 rounded bg-slate-100 p-2 text-sm text-slate-700">{message}</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Playoff Fantasy Basics</div>
        <div className="panel-body space-y-3 text-sm text-slate-700">
          {currentUser ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
              <p className="font-semibold">Logged in as {currentUser.gameId}</p>
              <p>Account: {currentUser.account}</p>
              <button type="button" className="mt-2 rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white" onClick={onLogout}>
                Logout
              </button>
            </div>
          ) : (
            <p>Create an account first, then login to manage your own lineup and transfers.</p>
          )}

          <ul className="list-disc space-y-2 pl-5">
            <li>Each account has its own roster and transfer history in database.</li>
            <li>You can login on any browser and keep your saved lineup state.</li>
            <li>After login, go to Edit line-up / Transactions to manage your team.</li>
          </ul>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Link className="rounded bg-brand-yellow px-3 py-2 text-center text-sm font-semibold" href="/edit-lineup">
              Go Edit Line-up
            </Link>
            <Link className="rounded bg-brand-blue px-3 py-2 text-center text-sm font-semibold text-white" href="/transactions">
              Manage Transfers
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
