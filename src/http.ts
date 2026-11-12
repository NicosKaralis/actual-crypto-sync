// Requests to explorers and price providers. Errors name the service and the
// HTTP status only: never the URL, which holds wallet addresses, nor headers,
// which hold API keys, nor the body.

import { setTimeout as delay } from 'node:timers/promises';

/** A request that gets no answer in this time fails, so the next explorer or provider is tried. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * An answer the API gave but that isn't a result: an HTTP error, or an error in
 * the body. It keeps the status and body for the explorer's or provider's
 * `rateLimitAdvice`; its message never holds the body.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(service: string, detail: string, status: number, body: unknown) {
    super(`${service}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** `settings.api_url` without trailing slashes, or the service's default. */
export function apiUrl(settings: Record<string, string>, fallback: string): string {
  return (settings.api_url ?? fallback).replace(/\/+$/, '');
}

/**
 * The `fetch` one explorer or provider entry uses for a run: each request times
 * out, and in serial mode requests go one at a time, `intervalMs` apart.
 */
export function entryFetch(
  fetch: typeof globalThis.fetch,
  { serial, intervalMs, sleep = delay }: { serial: boolean; intervalMs: number; sleep?: Sleep },
): typeof globalThis.fetch {
  const timed = ((input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })) as typeof globalThis.fetch;
  return serial ? oneAtATime(timed, intervalMs, sleep) : timed;
}

export type Sleep = (ms: number) => Promise<unknown>;

// The timeout starts when a request is sent, not while it waits its turn.
function oneAtATime(
  fetch: typeof globalThis.fetch,
  intervalMs: number,
  sleep: Sleep,
): typeof globalThis.fetch {
  let previous: Promise<unknown> | undefined;
  return ((input, init) => {
    const after = previous;
    const request = (async () => {
      if (after) {
        await after;
        await sleep(intervalMs);
      }
      return fetch(input, init);
    })();
    previous = request.catch(() => {});
    return request;
  }) as typeof globalThis.fetch;
}

/** GETs `url` and returns its parsed JSON body, as `unknown` for the caller to check. */
export async function getJson(
  service: string,
  url: string,
  fetch: typeof globalThis.fetch,
  headers: Record<string, string> = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json', ...headers } });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`${service}: request timed out`);
    }
    // Only the system error code (ECONNREFUSED, ENOTFOUND): the message may quote the URL.
    const code = error instanceof Error && isRecord(error.cause) ? error.cause.code : undefined;
    throw new Error(
      `${service}: request failed${typeof code === 'string' && /^[A-Z_]+$/.test(code) ? ` (${code})` : ''}`,
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(service, `HTTP ${response.status}`, response.status, parseBody(text));
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${service}: the response isn't JSON`);
  }
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * A raw amount sent as a JSON number, as a bigint. Above 2^53 a JSON number has
 * already lost digits, so it's an error, never a rounded balance.
 */
export function wholeNumber(value: unknown, service: string, path: string): bigint {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  throw new Error(`${service}: ${path}: expected a whole number`);
}

/** A raw amount sent as a string of digits, as a bigint, exact at any size. */
export function wholeNumberString(value: unknown, service: string, path: string): bigint {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new Error(`${service}: ${path}: expected a whole number`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
