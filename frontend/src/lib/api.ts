import {
  AuthUser,
  HelpResponse,
  LeagueDetailResponse,
  LeagueMutationResponse,
  LeaguesResponse,
  LineupResponse,
  LoginResponse,
  PlayerSearchResponse,
  PointsResponse,
  ProfileResponse,
  RegisterResponse,
  ScheduleResponse,
  TransactionsResponse
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("playoff_token") : null;

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Request failed");
  }

  return (await response.json()) as T;
}

export function register(account: string, gameId: string, password: string, confirmPassword: string) {
  return request<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ account, gameId, password, confirmPassword })
  });
}

export function login(account: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ account, password })
  });
}

export function logout() {
  return request<{ ok: true }>("/auth/logout", {
    method: "POST"
  });
}

export function getMe() {
  return request<{ user: AuthUser }>("/auth/me");
}

export function getProfile() {
  return request<ProfileResponse>("/profile");
}

export function getLineup() {
  return request<LineupResponse>("/lineup");
}

export function getPlayers(params?: {
  search?: string;
  position?: string;
  teamId?: string;
  maxSalary?: string;
  sort?: "salary" | "totalPoints" | "recentAverage";
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.search) {
    query.set("search", params.search);
  }
  if (params?.position) {
    query.set("position", params.position);
  }
  if (params?.teamId) {
    query.set("teamId", params.teamId);
  }
  if (params?.maxSalary) {
    query.set("maxSalary", params.maxSalary);
  }
  if (params?.sort) {
    query.set("sort", params.sort);
  }
  if (params?.limit) {
    query.set("limit", String(params.limit));
  }

  const queryString = query.toString();
  return request<PlayerSearchResponse>(`/players${queryString ? `?${queryString}` : ""}`);
}

export function createInitialTeam(playerIds: string[]) {
  return request<LineupResponse>("/team/create", {
    method: "POST",
    body: JSON.stringify({ playerIds })
  });
}

export function saveLineup(lineup: Partial<LineupResponse["lineup"]> & { captainId?: string; captainDecisionLocked?: boolean }) {
  return request<LineupResponse>("/lineup", {
    method: "PUT",
    body: JSON.stringify(lineup)
  });
}

export function getPointsToday() {
  return request<PointsResponse>("/points/today");
}

export function getTransactionsOptions() {
  return request<TransactionsResponse>("/transactions/options");
}

export function createTransfer(outPlayerId: string, inPlayerId: string) {
  return request<{ payload: TransactionsResponse }>("/transactions", {
    method: "POST",
    body: JSON.stringify({ outPlayerId, inPlayerId })
  });
}

export function getLeagues() {
  return request<LeaguesResponse>("/leagues");
}

export function getLeague(leagueId: string) {
  return request<LeagueDetailResponse>(`/leagues/${leagueId}`);
}

export function createLeague(name: string) {
  return request<LeagueMutationResponse>("/leagues/create", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export function joinLeague(code: string) {
  return request<LeagueMutationResponse>("/leagues/join", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function getSchedule() {
  return request<ScheduleResponse>("/schedule");
}

export function getHelpRules() {
  return request<HelpResponse>("/help/rules");
}

