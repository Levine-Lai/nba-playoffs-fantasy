import {
  AuthUser,
  HelpResponse,
  LineupResponse,
  LoginResponse,
  PlayerSearchResponse,
  PointsResponse,
  ProfileResponse,
  RegisterResponse,
  ScheduleResponse,
  StandingResponse,
  TransactionsResponse,
  UpdateTeamNameResponse
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787/api";
const DEFAULT_TIMEOUT_MS = 10000;

type RequestOptions = {
  allowStaleOnError?: boolean;
  cacheTtlMs?: number;
  retries?: number;
  timeoutMs?: number;
};

type ResponseCacheEntry = {
  data: unknown;
  expiresAt: number;
  staleUntil: number;
};

const responseCache = new Map<string, ResponseCacheEntry>();

function buildCacheKey(path: string, method: string, token: string | null) {
  return `${method}:${token ?? "anon"}:${API_BASE}${path}`;
}

function clearResponseCache() {
  responseCache.clear();
}

function isNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || error.name === "TypeError";
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function request<T>(path: string, init?: RequestInit, options: RequestOptions = {}): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const token = typeof window !== "undefined" ? window.localStorage.getItem("playoff_token") : null;
  const cacheKey = method === "GET" && options.cacheTtlMs ? buildCacheKey(path, method, token) : null;
  const cached = cacheKey ? responseCache.get(cacheKey) : null;
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  let attempt = 0;
  const maxRetries = options.retries ?? (method === "GET" ? 1 : 0);

  while (true) {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE}${path}`,
        {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(init?.headers ?? {})
          },
          cache: "no-store"
        },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? (response.status === 401 ? "Please log in first." : "Request failed"));
      }

      const data = (await response.json()) as T;

      if (cacheKey && options.cacheTtlMs) {
        responseCache.set(cacheKey, {
          data,
          expiresAt: now + options.cacheTtlMs,
          staleUntil: now + Math.max(options.cacheTtlMs * 6, 60000)
        });
      }

      if (method !== "GET") {
        clearResponseCache();
      }

      return data;
    } catch (error) {
      if (attempt < maxRetries && isNetworkError(error)) {
        attempt += 1;
        continue;
      }

      if (cacheKey && options.allowStaleOnError && cached && cached.staleUntil > Date.now()) {
        return cached.data as T;
      }

      if (isNetworkError(error)) {
        throw new Error("Network error. Please try again.");
      }

      throw error instanceof Error ? error : new Error("Request failed");
    }
  }
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
  return request<ProfileResponse>("/profile", undefined, {
    cacheTtlMs: 10000,
    allowStaleOnError: true
  });
}

export function updateTeamName(teamName: string) {
  return request<UpdateTeamNameResponse>("/profile/team-name", {
    method: "PUT",
    body: JSON.stringify({ teamName })
  });
}

export function getLineup() {
  return request<LineupResponse>("/lineup", undefined, {
    cacheTtlMs: 5000,
    allowStaleOnError: true
  });
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
  return request<PlayerSearchResponse>(`/players${queryString ? `?${queryString}` : ""}`, undefined, {
    cacheTtlMs: 15000,
    allowStaleOnError: true
  });
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
  return request<PointsResponse>("/points/today", undefined, {
    cacheTtlMs: 15000,
    allowStaleOnError: true
  });
}

export function getTransactionsOptions() {
  return request<TransactionsResponse>("/transactions/options", undefined, {
    cacheTtlMs: 5000,
    allowStaleOnError: true
  });
}

export function createTransfer(outPlayerId: string, inPlayerId: string) {
  return request<{ payload: TransactionsResponse }>("/transactions", {
    method: "POST",
    body: JSON.stringify({ outPlayerId, inPlayerId })
  });
}

export function confirmTransactions(
  transfers: Array<{ outPlayerId: string; inPlayerId: string }>,
  chip?: "wildcard" | "all-star" | null
) {
  return request<{ payload: TransactionsResponse }>("/transactions/confirm", {
    method: "POST",
    body: JSON.stringify({ transfers, chip: chip ?? null })
  });
}

export function getStandings(phase?: string) {
  const query = new URLSearchParams();
  if (phase) {
    query.set("phase", phase);
  }

  const queryString = query.toString();
  return request<StandingResponse>(`/standings${queryString ? `?${queryString}` : ""}`, undefined, {
    cacheTtlMs: 15000,
    allowStaleOnError: true
  });
}

export function getStandingPreview(userId: string, phase?: string) {
  const query = new URLSearchParams();
  query.set("userId", userId);
  if (phase) {
    query.set("phase", phase);
  }
  return request<PointsResponse>(`/standings/preview?${query.toString()}`, undefined, {
    cacheTtlMs: 15000,
    allowStaleOnError: true
  });
}

export function getSchedule() {
  return request<ScheduleResponse>("/schedule", undefined, {
    cacheTtlMs: 30000,
    allowStaleOnError: true
  });
}

export function getHelpRules() {
  return request<HelpResponse>("/help/rules", undefined, {
    cacheTtlMs: 5 * 60 * 1000,
    allowStaleOnError: true
  });
}

