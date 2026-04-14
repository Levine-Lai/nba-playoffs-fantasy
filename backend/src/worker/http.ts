import type { Env } from "./types";

export function json(data: unknown, init: ResponseInit = {}, env?: Env) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  applyCorsHeaders(headers, env);
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export function empty(init: ResponseInit = {}, env?: Env) {
  const headers = new Headers(init.headers);
  applyCorsHeaders(headers, env);
  return new Response(null, {
    ...init,
    headers
  });
}

export function handleCorsPreflight(request: Request, env: Env) {
  if (request.method !== "OPTIONS") {
    return null;
  }

  return empty({ status: 204 }, env);
}

export async function parseJsonBody<T>(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {} as T;
  }

  return (await request.json()) as T;
}

function applyCorsHeaders(headers: Headers, env?: Env) {
  const allowOrigin = env?.APP_ORIGIN?.trim() || "*";
  headers.set("Access-Control-Allow-Origin", allowOrigin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
}
