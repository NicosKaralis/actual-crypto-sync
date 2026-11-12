import type { Config } from './config.ts';
import { entryFetch, type Sleep } from './http.ts';
import { tokenKey } from './tokens.ts';
import type { Quote, Token } from './types.ts';

export interface QuoteResult {
  quote: Quote;
  source: string;
}

/**
 * A quote for every token the accounts hold, keyed by `tokenKey`. Providers are
 * tried in the config's order, each asked only for the tokens still without a
 * price that it has an id for. A token no provider prices is left out, so its
 * accounts fail instead of being written with a price of 0. An entry in serial
 * mode sends its requests one at a time; a rate limit is warned about with the
 * provider's advice.
 */
export async function collectQuotes({
  config,
  fetch,
  warn = () => {},
  sleep,
}: {
  config: Config;
  fetch: typeof globalThis.fetch;
  warn?: (message: string) => void;
  sleep?: Sleep;
}): Promise<Map<string, QuoteResult>> {
  const { currency, providers } = config.prices;
  const pending = new Map<string, Token>();
  for (const { token } of config.accounts) {
    pending.set(tokenKey(token), token);
  }

  const result = new Map<string, QuoteResult>();
  for (const { label, provider, settings, serial } of providers) {
    const tokens = [...pending.values()].filter((token) =>
      Object.hasOwn(token.priceIds, provider.id),
    );
    if (tokens.length === 0 || !provider.supportsCurrency(currency)) {
      continue;
    }
    let quotes: Map<string, Quote>;
    try {
      quotes = await provider.getQuotes({
        tokens,
        currency,
        settings,
        fetch: entryFetch(fetch, { serial, intervalMs: provider.serialIntervalMs, sleep }),
      });
    } catch (error) {
      warn(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      const advice = provider.rateLimitAdvice(error, { settings, serial });
      if (advice !== null) {
        warn(`${label} is rate limiting requests: ${advice}`);
      }
      continue;
    }
    for (const token of tokens) {
      const key = tokenKey(token);
      const quote = quotes.get(key);
      if (quote === undefined) {
        continue;
      }
      if (quote.currency !== currency) {
        warn(`${key}: ${label} answered in ${quote.currency}, not ${currency}; quote dropped`);
        continue;
      }
      if (!Number.isFinite(quote.price) || quote.price <= 0) {
        warn(`${key}: ${label} answered a price of ${quote.price}; quote dropped`);
        continue;
      }
      result.set(key, { quote, source: label });
      pending.delete(key);
    }
  }
  return result;
}
