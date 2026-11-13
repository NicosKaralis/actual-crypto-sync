import { ApiError, apiUrl, getJson, isRecord } from '../http.ts';
import { tokenKey } from '../tokens.ts';
import type { PriceProvider, Quote } from '../types.ts';

const ID = 'coinpaprika';
const DEFAULT_API_URL = 'https://api.coinpaprika.com/v1';

/**
 * The fiat currencies among CoinPaprika's `quotes` (API docs, 2026-11-13).
 * The crypto ones (btc, eth) are left out.
 */
const CURRENCIES = new Set(
  [
    'usd eur pln krw gbp cad jpy rub try nzd aud chf uah hkd sgd ngn php mxn brl thb',
    'clp cny czk dkk huf idr ils inr myr nok pkr sek twd zar vnd bob cop pen ars isk',
  ]
    .join(' ')
    .split(' '),
);

/**
 * `GET /tickers/{id}?quotes=EUR`: the API prices one coin per request, so
 * each id is one request. An id it doesn't know (404) is left out.
 */
export const coinpaprika: PriceProvider = {
  id: ID,
  supportsCurrency: (currency) => CURRENCIES.has(currency),
  // The API allows 10 requests a second.
  serialIntervalMs: 100,
  rateLimitAdvice(error) {
    // 402 when the monthly limit is used up, 429 when requests come too fast.
    return error instanceof ApiError && (error.status === 429 || error.status === 402)
      ? "run less often, or list another price provider after it: CoinPaprika's free API allows 20,000 requests a month"
      : null;
  },
  async getQuotes({ tokens, currency, settings, fetch }) {
    const ids = [...new Set(tokens.map((token) => token.priceIds[ID]))].filter(
      (id): id is string => id !== undefined,
    );
    const code = currency.toUpperCase();
    const prices = new Map<string, number>();
    // One at a time: the tokens of a run are a few requests, well under the limit.
    for (const id of ids) {
      const url = `${apiUrl(settings, DEFAULT_API_URL)}/tickers/${encodeURIComponent(id)}?quotes=${encodeURIComponent(code)}`;
      let body: unknown;
      try {
        body = await getJson(ID, url, fetch);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          continue;
        }
        throw error;
      }
      if (!isRecord(body)) {
        throw new Error(`${ID}: expected a ticker`);
      }
      const quote = isRecord(body.quotes) ? body.quotes[code] : undefined;
      const price = isRecord(quote) ? quote.price : undefined;
      if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
        prices.set(id, price);
      }
    }

    const quotes = new Map<string, Quote>();
    for (const token of tokens) {
      const id = token.priceIds[ID];
      const price = id === undefined ? undefined : prices.get(id);
      if (price !== undefined) {
        quotes.set(tokenKey(token), { price, currency });
      }
    }
    return quotes;
  },
};
