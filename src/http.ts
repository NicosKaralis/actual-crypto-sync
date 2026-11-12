// Requests to explorers and price providers. Errors name the service and the
// HTTP status only: never the URL, which holds wallet addresses, nor headers,
// which hold API keys, nor the body.

/** A request that gets no answer in this time fails, so the next explorer or provider is tried. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** `settings.api_url` without trailing slashes, or the service's default. */
export function apiUrl(settings: Record<string, string>, fallback: string): string {
  return (settings.api_url ?? fallback).replace(/\/+$/, '');
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
    response = await fetch(url, {
      headers: { accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
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
    await response.body?.cancel();
    throw new Error(`${service}: HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${service}: the response isn't JSON`);
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
