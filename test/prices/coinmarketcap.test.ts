import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { redactUrl } from '../../src/format.ts';
import { ApiError } from '../../src/http.ts';
import { coinmarketcap } from '../../src/prices/coinmarketcap.ts';
import type { Token } from '../../src/types.ts';
import { fakeFetch, fakeTokens, fixture, jsonResponse } from '../fakes.ts';

const [TRX, USDT, BTC] = ['TRX', 'USDT', 'BTC'].map((symbol): Token => {
  const token = fakeTokens.find((t) => t.symbol === symbol) as Token;
  return { ...token, priceIds: { coinmarketcap: `${symbol.toLowerCase()}-slug` } };
}) as [Token, Token, Token];

// test/fixtures/coinmarketcap/simple-price.json: bitcoin, tether and tron in
// EUR, from the keyless API.
const SIMPLE_PRICE = fixture('coinmarketcap/simple-price.json');
// test/fixtures/coinmarketcap/invalid-key.json: the keyed API's 401.
const INVALID_KEY = fixture('coinmarketcap/invalid-key.json');
// The documented body of a 429: no keyless rate limit was provoked to record one.
const RATE_LIMITED = {
  status: {
    error_code: '1011',
    error_message: "You've hit an IP rate limit.",
    credit_count: 0,
  },
};

const KEYLESS_URL = 'https://pro-api.coinmarketcap.com/public-api/v2/simple/price';
const KEYED_URL = 'https://pro-api.coinmarketcap.com/v2/simple/price';

/** A simple/price answer pricing each slug in `currency`. */
function prices(currency: string, bySlug: Record<string, unknown>): Response {
  return jsonResponse({
    data: Object.entries(bySlug).map(([slug, price], id) => ({
      id,
      slug,
      quotes: [{ symbol: currency, price }],
    })),
    status: { error_code: '0', error_message: '' },
  });
}

function quotes(
  respond: (url: string) => Response,
  tokens: Token[],
  {
    currency = 'eur',
    settings = {},
  }: { currency?: string; settings?: Record<string, string> } = {},
) {
  const { fetch, calls } = fakeFetch(respond);
  const sleeps: number[] = [];
  const result = coinmarketcap.getQuotes({
    tokens,
    currency,
    settings,
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { result, calls, sleeps };
}

/** Answers each request with the next response, then repeats the last. */
function inTurn(...responses: (() => Response)[]): () => Response {
  let next = 0;
  return () => (responses[Math.min(next++, responses.length - 1)] as () => Response)();
}

describe('coinmarketcap', () => {
  test('supports fiat currencies, not crypto ones or metals', () => {
    for (const currency of ['eur', 'usd', 'jpy', 'gbp', 'brl', 'isk', 'ves']) {
      assert.equal(coinmarketcap.supportsCurrency(currency), true, currency);
    }
    for (const currency of ['btc', 'eth', 'EUR', 'xau', 'xag', 'abc']) {
      assert.equal(coinmarketcap.supportsCurrency(currency), false, currency);
    }
  });

  test('reads the prices from a recorded answer', async () => {
    const tokens = [
      { ...TRX, priceIds: { coinmarketcap: 'tron' } },
      { ...USDT, priceIds: { coinmarketcap: 'tether' } },
      { ...BTC, priceIds: { coinmarketcap: 'bitcoin' } },
    ];
    const { result, calls } = quotes(() => jsonResponse(SIMPLE_PRICE), tokens);
    assert.deepEqual(
      await result,
      new Map([
        ['tron:TRX', { price: 0.28044356337231524, currency: 'eur' }],
        ['tron:USDT', { price: 0.9117059495573707, currency: 'eur' }],
        ['bitcoin:BTC', { price: 56360.09528772283, currency: 'eur' }],
      ]),
    );
    assert.deepEqual(
      calls.map((c) => c.url),
      [`${KEYLESS_URL}?slug=tron,tether,bitcoin&convert=EUR`],
    );
  });

  test('every slug in one request, in the currency asked for', async () => {
    const { result, calls } = quotes(
      () => prices('USD', { 'trx-slug': 0.31, 'usdt-slug': 1, 'btc-slug': 69000 }),
      [TRX, USDT, BTC],
      { currency: 'usd' },
    );
    assert.deepEqual(
      await result,
      new Map([
        ['tron:TRX', { price: 0.31, currency: 'usd' }],
        ['tron:USDT', { price: 1, currency: 'usd' }],
        ['bitcoin:BTC', { price: 69000, currency: 'usd' }],
      ]),
    );
    assert.deepEqual(
      calls.map((c) => c.url),
      [`${KEYLESS_URL}?slug=trx-slug,usdt-slug,btc-slug&convert=USD`],
    );
  });

  test('a slug shared by two tokens is asked once, and prices both', async () => {
    const usdtElsewhere: Token = { ...USDT, chain: 'ethereum', contract: '0xdac1' };
    const { result, calls } = quotes(
      () => prices('EUR', { 'usdt-slug': 0.9 }),
      [USDT, usdtElsewhere],
    );
    assert.deepEqual([...(await result).keys()], ['tron:USDT', 'ethereum:USDT']);
    assert.equal(calls[0]?.url, `${KEYLESS_URL}?slug=usdt-slug&convert=EUR`);
  });

  test('a custom api_url is used, with or without a trailing slash', async () => {
    for (const apiUrl of ['http://prices.lan/v2', 'http://prices.lan/v2/']) {
      const { result, calls } = quotes(() => prices('EUR', {}), [TRX], {
        settings: { api_url: apiUrl },
      });
      await result;
      assert.equal(calls[0]?.url, 'http://prices.lan/v2/simple/price?slug=trx-slug&convert=EUR');
    }
  });

  test('with api_key, it asks the keyed API, with the key in its header', async () => {
    const { result, calls } = quotes(() => prices('EUR', {}), [TRX], {
      settings: { api_key: 'test-key' },
    });
    await result;
    assert.equal(calls[0]?.url, `${KEYED_URL}?slug=trx-slug&convert=EUR`);
    assert.equal(calls[0]?.headers['x-cmc_pro_api_key'], 'test-key');
  });

  test('without a key, it asks the keyless API, with no key header', async () => {
    const { result, calls } = quotes(() => prices('EUR', {}), [TRX]);
    await result;
    assert.equal(calls[0]?.url, `${KEYLESS_URL}?slug=trx-slug&convert=EUR`);
    assert.equal('x-cmc_pro_api_key' in (calls[0]?.headers ?? {}), false);
  });

  test("a slug it doesn't answer is left out, and the others are priced", async () => {
    const { result } = quotes(
      () => prices('EUR', { 'trx-slug': 0.3, 'btc-slug': 69000 }),
      [TRX, USDT, BTC],
    );
    assert.deepEqual([...(await result).keys()], ['tron:TRX', 'bitcoin:BTC']);
  });

  test('a price that is missing, not a positive number, or in another currency is left out', async () => {
    for (const response of [
      prices('EUR', { 'trx-slug': 0 }),
      prices('EUR', { 'trx-slug': -1 }),
      prices('EUR', { 'trx-slug': '0.3' }),
      prices('EUR', { 'trx-slug': null }),
      // A currency CoinMarketCap took for another asset's symbol.
      prices('XYZ', { 'trx-slug': 0.3 }),
      jsonResponse({ data: [{ slug: 'trx-slug' }], status: { error_code: '0' } }),
      jsonResponse({ data: [{ slug: 'trx-slug', quotes: {} }], status: { error_code: '0' } }),
      jsonResponse({ data: [null, 'x'], status: { error_code: '0' } }),
    ]) {
      const { result } = quotes(() => response, [TRX]);
      assert.equal((await result).size, 0);
    }
  });

  test('a body that is not a list of prices throws', async () => {
    for (const body of [null, [], 'x', {}, { data: {} }]) {
      const { result } = quotes(() => jsonResponse(body), [TRX]);
      await assert.rejects(result, (error: Error) => {
        assert.equal(error.message, 'coinmarketcap: expected a list of prices');
        return true;
      });
    }
  });

  test('a 200 with an error code in its status throws, without its message', async () => {
    for (const code of ['1006', 1006]) {
      const { result } = quotes(
        () => jsonResponse({ status: { error_code: code, error_message: 'Not allowed' } }),
        [TRX],
      );
      await assert.rejects(result, (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.message, 'coinmarketcap: error 1006');
        assert.equal(error.status, 200);
        return true;
      });
    }
  });

  test('an error code of 0 is no error, as a string or a number', async () => {
    for (const code of ['0', 0]) {
      const { result } = quotes(
        () => jsonResponse({ data: [], status: { error_code: code } }),
        [TRX],
      );
      assert.equal((await result).size, 0);
    }
  });

  test('another HTTP error throws with the status', async () => {
    const { result } = quotes(() => jsonResponse(INVALID_KEY, 401), [TRX], {
      settings: { api_key: 'test-key' },
    });
    await assert.rejects(result, (error: Error) => {
      assert.equal(error.message, 'coinmarketcap: HTTP 401');
      return true;
    });
  });

  test("the key is never in the URL or an error's message", async () => {
    const { result, calls } = quotes(() => jsonResponse(INVALID_KEY, 401), [TRX], {
      settings: { api_key: 'secret-test-key' },
    });
    const error = await result.then(
      () => assert.fail('expected getQuotes to throw'),
      (error: unknown) => error,
    );
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes('secret-test-key'));
    assert.ok(!String(error.stack).includes('secret-test-key'));
    const url = calls[0]?.url ?? '';
    assert.ok(!url.includes('secret-test-key'));
    assert.ok(!redactUrl(url).includes('secret-test-key'));
  });

  describe('retries without a key', () => {
    const rateLimited = () => jsonResponse(RATE_LIMITED, 429);
    const priced = () => prices('EUR', { 'trx-slug': 0.3 });

    test('a 429 and then an answer gives the prices, after waiting 1 s', async () => {
      const { result, calls, sleeps } = quotes(inTurn(rateLimited, priced), [TRX]);
      assert.deepEqual(await result, new Map([['tron:TRX', { price: 0.3, currency: 'eur' }]]));
      assert.equal(calls.length, 2);
      assert.deepEqual(sleeps, [1000]);
    });

    test('four 429s wait 1, 2 and 4 s, then throw the 429', async () => {
      const { result, calls, sleeps } = quotes(rateLimited, [TRX]);
      await assert.rejects(result, (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 429);
        return true;
      });
      assert.equal(calls.length, 4);
      assert.deepEqual(sleeps, [1000, 2000, 4000]);
    });

    test('with api_key, a 429 is not retried', async () => {
      const { result, calls, sleeps } = quotes(inTurn(rateLimited, priced), [TRX], {
        settings: { api_key: 'test-key' },
      });
      await assert.rejects(result, /HTTP 429/);
      assert.equal(calls.length, 1);
      assert.deepEqual(sleeps, []);
    });

    test('another error is never retried', async () => {
      for (const response of [
        () => jsonResponse({ status: { error_code: '500' } }, 500),
        () => jsonResponse(INVALID_KEY, 401),
      ]) {
        const { result, calls, sleeps } = quotes(inTurn(response, priced), [TRX]);
        await assert.rejects(result);
        assert.equal(calls.length, 1);
        assert.deepEqual(sleeps, []);
      }
    });
  });

  describe('rate limits', () => {
    async function failure(
      response: () => Response,
      settings: Record<string, string> = {},
    ): Promise<unknown> {
      const { result } = quotes(response, [TRX], { settings });
      return result.then(
        () => assert.fail('expected getQuotes to throw'),
        (error: unknown) => error,
      );
    }

    test('one request every 2 s in serial mode', () => {
      assert.equal(coinmarketcap.serialIntervalMs, 2000);
    });

    test('a 429 is a rate limit: add a key, or run less often', async () => {
      const error = await failure(() => jsonResponse(RATE_LIMITED, 429));
      assert.ok(error instanceof ApiError);
      assert.equal(
        coinmarketcap.rateLimitAdvice(error, { settings: {}, serial: false }),
        "add an API key (api_key: ${COINMARKETCAP_API_KEY}), run less often, or list another price provider after it: CoinMarketCap's keyless API shares one limit for each IP address",
      );
      assert.equal(
        coinmarketcap.rateLimitAdvice(error, { settings: { api_key: 'k' }, serial: false }),
        'run less often, or list another price provider after it',
      );
    });

    test('a rate limit code in the status of a 200 is a rate limit too', async () => {
      for (const code of ['1008', '1009', '1010', '1011', 1011]) {
        const error = await failure(() => jsonResponse({ status: { error_code: code } }));
        assert.equal(
          coinmarketcap.rateLimitAdvice(error, { settings: { api_key: 'k' }, serial: false }),
          'run less often, or list another price provider after it',
          String(code),
        );
      }
    });

    test('other errors are not rate limits', async () => {
      for (const error of [
        await failure(() => jsonResponse(INVALID_KEY, 401), { api_key: 'k' }),
        await failure(() => jsonResponse({ status: { error_code: '1006' } }, 403)),
        await failure(() => jsonResponse({ status: { error_code: '1006' } })),
        await failure(() => jsonResponse(null)),
        new Error('HTTP 429'),
      ]) {
        assert.equal(coinmarketcap.rateLimitAdvice(error, { settings: {}, serial: false }), null);
      }
    });
  });
});
