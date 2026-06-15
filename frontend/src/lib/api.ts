import {
  AuthUser,
  HomeLeadersResponse,
  HelpResponse,
  LineupResponse,
  LoginResponse,
  PlayerSearchResponse,
  PointsHistoryResponse,
  PointsResponse,
  ProfileResponse,
  RegisterResponse,
  ScheduleGameDetailResponse,
  ScheduleResponse,
  StandingResponse,
  TransactionsHistoryResponse,
  TransactionsResponse,
  UpdateTeamNameResponse
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787/api";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_DELAY_MS = 500;
const MIN_STALE_CACHE_MS = 10 * 60 * 1000;

type RequestOptions = {
  allowStaleOnError?: boolean;
  cacheTtlMs?: number;
  retryDelayMs?: number;
  retries?: number;
  timeoutMs?: number;
};

type ResponseCacheEntry = {
  data: unknown;
  expiresAt: number;
  staleUntil: number;
};

const responseCache = new Map<string, ResponseCacheEntry>();
const pendingGetRequests = new Map<string, Promise<unknown>>();

class ApiHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

function buildCacheKey(path: string, method: string, token: string | null) {
  return `${method}:${token ?? "anon"}:${API_BASE}${path}`;
}

function clearResponseCache() {
  responseCache.clear();
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isFetchNetworkError(error: unknown) {
  return error instanceof Error && error.name === "TypeError";
}

function isRetryableError(error: unknown) {
  if (isAbortError(error) || isFetchNetworkError(error)) {
    return true;
  }

  if (error instanceof ApiHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  return false;
}

function buildTransientError(error: unknown) {
  if (isAbortError(error)) {
    return new Error("Request timed out. Please try again.");
  }

  if (isFetchNetworkError(error)) {
    return new Error("Unable to reach the server. Please try again.");
  }

  return error instanceof Error ? error : new Error("Request failed");
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

  const pendingRequest = cacheKey ? pendingGetRequests.get(cacheKey) : null;
  if (pendingRequest) {
    return pendingRequest as Promise<T>;
  }

  const runRequest = async () => {
    let attempt = 0;
    const maxRetries = options.retries ?? (method === "GET" ? 2 : 0);

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
          throw new ApiHttpError(body.message ?? (response.status === 401 ? "Please log in first." : "Request failed"), response.status);
        }

        const data = (await response.json()) as T;

        if (cacheKey && options.cacheTtlMs) {
          const cachedAt = Date.now();
          responseCache.set(cacheKey, {
            data,
            expiresAt: cachedAt + options.cacheTtlMs,
            staleUntil: cachedAt + Math.max(options.cacheTtlMs * 12, MIN_STALE_CACHE_MS)
          });
        }

        if (method !== "GET") {
          clearResponseCache();
        }

        return data;
      } catch (error) {
        if (attempt < maxRetries && isRetryableError(error)) {
          attempt += 1;
          await wait((options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS) * attempt);
          continue;
        }

        if (cacheKey && options.allowStaleOnError && cached && cached.staleUntil > Date.now()) {
          return cached.data as T;
        }

        if (isAbortError(error) || isFetchNetworkError(error)) {
          throw buildTransientError(error);
        }

        throw error instanceof Error ? error : new Error("Request failed");
      }
    }
  };

  const requestPromise = runRequest();
  if (cacheKey) {
    pendingGetRequests.set(cacheKey, requestPromise);
    const clearPendingRequest = () => {
      if (pendingGetRequests.get(cacheKey) === requestPromise) {
        pendingGetRequests.delete(cacheKey);
      }
    };
    requestPromise.then(clearPendingRequest, clearPendingRequest);
  }

  return requestPromise;
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
    timeoutMs: 30000,
    cacheTtlMs: 10000,
    allowStaleOnError: true
  });
}

export function getHomeLeaders() {
  return request<HomeLeadersResponse>("/home-leaders", undefined, {
    timeoutMs: 30000,
    cacheTtlMs: 15000,
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
    timeoutMs: 30000,
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
    timeoutMs: 30000,
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

export function saveLineup(lineup: Pick<LineupResponse["lineup"], "starters" | "bench">) {
  return request<LineupResponse>("/lineup", {
    method: "PUT",
    body: JSON.stringify(lineup)
  });
}

export function getPointsToday() {
  return request<PointsResponse>("/points/today", undefined, {
    timeoutMs: 45000,
    retries: 2,
    cacheTtlMs: 15000,
    allowStaleOnError: true
  });
}

export function getPointsHistory(userId?: string) {
  const query = new URLSearchParams();
  if (userId) {
    query.set("userId", userId);
  }

  const queryString = query.toString();
  return request<PointsHistoryResponse>(`/points/history${queryString ? `?${queryString}` : ""}`, undefined, {
    timeoutMs: 30000,
    cacheTtlMs: 15000,
    allowStaleOnError: true
  });
}

export function getTransactionsOptions() {
  return request<TransactionsResponse>("/transactions/options", undefined, {
    timeoutMs: 30000,
    cacheTtlMs: 5000,
    allowStaleOnError: true
  });
}

export function getTransactionsHistory(userId?: string) {
  const query = new URLSearchParams();
  if (userId) {
    query.set("userId", userId);
  }

  const queryString = query.toString();
  return request<TransactionsHistoryResponse>(`/transactions/history${queryString ? `?${queryString}` : ""}`, undefined, {
    timeoutMs: 30000,
    cacheTtlMs: 15000,
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
    timeoutMs: 45000,
    retries: 2,
    cacheTtlMs: 5000,
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
    timeoutMs: 45000,
    retries: 2,
    cacheTtlMs: 15000,
    allowStaleOnError: true
  });
}

export function getSchedule() {
  return request<ScheduleResponse>("/schedule", undefined, {
    timeoutMs: 30000,
    cacheTtlMs: 30000,
    allowStaleOnError: true
  });
}

export function getScheduleGameDetail(gameId: string) {
  const query = new URLSearchParams();
  query.set("gameId", gameId);

  return request<ScheduleGameDetailResponse>(`/schedule/game?${query.toString()}`, undefined, {
    timeoutMs: 30000,
    cacheTtlMs: 15000,
    allowStaleOnError: true
  });
}

export function getHelpRules() {
  return request<HelpResponse>("/help/rules", undefined, {
    timeoutMs: 30000,
    cacheTtlMs: 5 * 60 * 1000,
    allowStaleOnError: true
  });
}

