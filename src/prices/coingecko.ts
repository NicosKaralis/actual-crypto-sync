import { apiUrl, getJson, isRecord } from '../http.ts';
import { tokenKey } from '../tokens.ts';
import type { PriceProvider, Quote } from '../types.ts';

const ID = 'coingecko';
const DEFAULT_API_URL = 'https://api.coingecko.com/api/v3';

/**
 * The fiat currencies among CoinGecko's `vs_currencies`
 * (`GET /simple/supported_vs_currencies`, 2026-11-12). The crypto ones (btc,
 * sats, ...) and the metals and SDR (xag, xau, xdr) are left out. Updated
 * together with the token table.
 */
const CURRENCIES = new Set(
  [
    'aed ars aud bdt bhd bmd brl cad chf clp cny czk dkk eur gbp gel hkd huf idr ils inr jpy',
    'krw kwd lkr mmk mxn myr ngn nok nzd php pkr pln rub sar sek sgd thb try twd uah usd vef',
    'vnd zar',
  ]
    .join(' ')
    .split(' '),
);

/** `GET /simple/price`: every token in one request. Ids it doesn't answer are left out. */
export const coingecko: PriceProvider = {
  id: ID,
  supportsCurrency: (currency) => CURRENCIES.has(currency),
  async getQuotes({ tokens, currency, settings, fetch }) {
    const ids = [...new Set(tokens.map((token) => token.priceIds[ID]))].filter(
      (id): id is string => id !== undefined,
    );
    const url =
      `${apiUrl(settings, DEFAULT_API_URL)}/simple/price` +
      `?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=${encodeURIComponent(currency)}`;
    const body = await getJson(ID, url, fetch);
    if (!isRecord(body)) {
      throw new Error(`${ID}: expected a map of ids to prices`);
    }

    const quotes = new Map<string, Quote>();
    for (const token of tokens) {
      const id = token.priceIds[ID];
      const prices = id !== undefined && Object.hasOwn(body, id) ? body[id] : undefined;
      const price = isRecord(prices) ? prices[currency] : undefined;
      if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
        quotes.set(tokenKey(token), { price, currency });
      }
    }
    return quotes;
  },
};
