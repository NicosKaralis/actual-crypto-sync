import { setTimeout as delay } from 'node:timers/promises';

import { ApiError, apiUrl, getJson, isRecord } from '../http.ts';
import { tokenKey } from '../tokens.ts';
import type { PriceProvider, Quote } from '../types.ts';

const ID = 'coinmarketcap';
// The keyless API is a different path on the same host. A key is never sent to it.
const DEFAULT_API_URL = 'https://pro-api.coinmarketcap.com/public-api/v2';
const KEYED_API_URL = 'https://pro-api.coinmarketcap.com/v2';

/** Without a key, a 429 is tried again after each of these waits. */
const RETRY_WAITS_MS = [1000, 2000, 4000];

/** The body's error codes for the minute, daily, monthly and IP rate limits. */
const RATE_LIMIT_CODES = new Set(['1008', '1009', '1010', '1011']);

/**
 * The fiat currencies of CoinMarketCap (`GET /v1/fiat/map`, 2026-11-20). The
 * metals are left out. An unknown `convert` isn't an error there: it can be
 * taken for another asset's symbol and still give a price, so only these are asked.
 */
const CURRENCIES = new Set(
  [
    'usd aud brl cad chf clp cny czk dkk eur gbp hkd huf idr ils inr jpy krw mxn myr nok',
    'nzd php pkr pln rub sek sgd thb try twd zar aed bgn hrk mur ron isk ngn cop ars pen',
    'vnd uah bob all amd azn bam bdt bhd bmd byn crc cup dop dzd egp gel ghs gtq hnl iqd',
    'irr jmd jod kes kgs khr kwd kzt lbp lkr mad mdl mkd mmk mnt nad nio npr omr pab qar',
    'rsd sar ssp tnd ttd ugx uyu uzs ves',
  ]
    .join(' ')
    .split(' '),
);

/**
 * `GET /simple/price?slug=...&convert=EUR`: every token in one request. Slugs
 * it doesn't answer are left out. Without `api_key`, it asks the keyless API,
 * whose limit is shared by everyone on the same IP address, so a 429 is tried
 * again a few times. With `api_key`, it asks the keyed API, with the key in the
 * `X-CMC_PRO_API_KEY` header.
 */
export const coinmarketcap: PriceProvider = {
  id: ID,
  supportsCurrency: (currency) => CURRENCIES.has(currency),
  settingKeys: ['api_url', 'api_key'],
  // The free Basic plan allows 50 requests a minute (/v1/key/info, 2026-11-20); a run is
  // one request anyway.
  serialIntervalMs: 2000,
  rateLimitAdvice(error, { settings }) {
    if (!(error instanceof ApiError)) {
      return null;
    }
    if (error.status !== 429 && !RATE_LIMIT_CODES.has(errorCode(error.body))) {
      return null;
    }
    return settings.api_key
      ? 'run less often, or list another price provider after it'
      : "add an API key (api_key: ${COINMARKETCAP_API_KEY}), run less often, or list another price provider after it: CoinMarketCap's keyless API shares one limit for each IP address";
  },
  async getQuotes({ tokens, currency, settings, fetch, sleep = delay }) {
    const slugs = [...new Set(tokens.map((token) => token.priceIds[ID]))].filter(
      (slug): slug is string => slug !== undefined,
    );
    const code = currency.toUpperCase();
    const url =
      `${apiUrl(settings, settings.api_key ? KEYED_API_URL : DEFAULT_API_URL)}/simple/price` +
      `?slug=${slugs.map(encodeURIComponent).join(',')}&convert=${encodeURIComponent(code)}`;
    const headers: Record<string, string> = settings.api_key
      ? { 'x-cmc_pro_api_key': settings.api_key }
      : {};

    let body: unknown;
    for (let attempt = 0; ; attempt++) {
      try {
        body = await getJson(ID, url, fetch, headers);
        break;
      } catch (error) {
        const wait = RETRY_WAITS_MS[attempt];
        if (
          settings.api_key ||
          wait === undefined ||
          !(error instanceof ApiError && error.status === 429)
        ) {
          throw error;
        }
        await sleep(wait);
      }
    }

    const status = errorCode(body);
    if (status !== '' && status !== '0') {
      throw new ApiError(ID, `error ${status}`, 200, body);
    }
    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new Error(`${ID}: expected a list of prices`);
    }
    const prices = new Map<string, number>();
    for (const entry of body.data) {
      if (!isRecord(entry) || typeof entry.slug !== 'string' || !Array.isArray(entry.quotes)) {
        continue;
      }
      // Only a quote in the currency asked for: never another asset's.
      const quote = entry.quotes.find((q) => isRecord(q) && q.symbol === code);
      const price = isRecord(quote) ? quote.price : undefined;
      if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
        prices.set(entry.slug, price);
      }
    }

    const quotes = new Map<string, Quote>();
    for (const token of tokens) {
      const slug = token.priceIds[ID];
      const price = slug === undefined ? undefined : prices.get(slug);
      if (price !== undefined) {
        quotes.set(tokenKey(token), { price, currency });
      }
    }
    return quotes;
  },
};

/** `status.error_code` of a body, as a string ("0" is no error); '' when it has none. */
function errorCode(body: unknown): string {
  const status = isRecord(body) && isRecord(body.status) ? body.status : {};
  const code = status.error_code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : '';
}
