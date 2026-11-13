import { ApiError, apiUrl, getJson, isRecord } from '../http.ts';
import { tokenKey } from '../tokens.ts';
import type { PriceProvider, Quote } from '../types.ts';

const ID = 'coingecko';
const DEFAULT_API_URL = 'https://api.coingecko.com/api/v3';
// A Pro key works only on the Pro API, and a Demo key only on the public one.
// Both start with CG-, so the setting's name says which plan a key is for.
const PRO_API_URL = 'https://pro-api.coingecko.com/api/v3';

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
  settingKeys: ['api_url', 'demo_api_key', 'pro_api_key'],
  // The public API allows a few requests a minute.
  serialIntervalMs: 6000,
  rateLimitAdvice(error, { settings }) {
    if (!(error instanceof ApiError)) {
      return null;
    }
    // CoinGecko also puts the code in the body: { "status": { "error_code": 429 } }.
    const status = isRecord(error.body) && isRecord(error.body.status) ? error.body.status : {};
    if (error.status !== 429 && status.error_code !== 429) {
      return null;
    }
    return settings.demo_api_key || settings.pro_api_key
      ? 'run less often, or list another price provider after it'
      : "add a free Demo key (demo_api_key: ${COINGECKO_API_KEY}), run less often, or list another price provider after it: CoinGecko's public API allows a few requests a minute";
  },
  checkSettings(settings) {
    return settings.demo_api_key && settings.pro_api_key
      ? 'set only one of demo_api_key and pro_api_key'
      : null;
  },
  async getQuotes({ tokens, currency, settings, fetch }) {
    const ids = [...new Set(tokens.map((token) => token.priceIds[ID]))].filter(
      (id): id is string => id !== undefined,
    );
    const url =
      `${apiUrl(settings, settings.pro_api_key ? PRO_API_URL : DEFAULT_API_URL)}/simple/price` +
      `?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=${encodeURIComponent(currency)}`;
    const headers: Record<string, string> = settings.pro_api_key
      ? { 'x-cg-pro-api-key': settings.pro_api_key }
      : settings.demo_api_key
        ? { 'x-cg-demo-api-key': settings.demo_api_key }
        : {};
    const body = await getJson(ID, url, fetch, headers);
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
