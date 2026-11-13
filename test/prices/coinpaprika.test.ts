import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError } from '../../src/http.ts';
import { coinpaprika } from '../../src/prices/coinpaprika.ts';
import type { Token } from '../../src/types.ts';
import { fakeFetch, fakeTokens, fixture, jsonResponse } from '../fakes.ts';

const [TRX, USDT, BTC] = ['TRX', 'USDT', 'BTC'].map((symbol): Token => {
  const token = fakeTokens.find((t) => t.symbol === symbol) as Token;
  return { ...token, priceIds: { coinpaprika: `${symbol.toLowerCase()}-id` } };
}) as [Token, Token, Token];

// test/fixtures/coinpaprika/ticker.json: trx-tron in EUR.
const TICKER = fixture('coinpaprika/ticker.json');

/** A ticker answer with one quote. */
function ticker(currency: string, price: unknown): Response {
  return jsonResponse({ id: 'x', quotes: { [currency]: { price } } });
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
  const result = coinpaprika.getQuotes({ tokens, currency, settings, fetch });
  return { result, calls };
}

describe('coinpaprika', () => {
  test('supports fiat currencies, not crypto ones', () => {
    for (const currency of ['eur', 'usd', 'jpy', 'gbp', 'brl', 'isk']) {
      assert.equal(coinpaprika.supportsCurrency(currency), true, currency);
    }
    for (const currency of ['btc', 'eth', 'EUR', 'xau', 'abc']) {
      assert.equal(coinpaprika.supportsCurrency(currency), false, currency);
    }
  });

  test('reads the price from a recorded ticker', async () => {
    const trx = { ...TRX, priceIds: { coinpaprika: 'trx-tron' } };
    const { result, calls } = quotes(() => jsonResponse(TICKER), [trx]);
    assert.deepEqual(
      await result,
      new Map([['tron:TRX', { price: 0.2836451012079849, currency: 'eur' }]]),
    );
    assert.deepEqual(
      calls.map((c) => c.url),
      ['https://api.coinpaprika.com/v1/tickers/trx-tron?quotes=EUR'],
    );
  });

  test('one request per id, in the currency asked for', async () => {
    const prices: Record<string, number> = { 'trx-id': 0.31, 'usdt-id': 1, 'btc-id': 69000 };
    const { result, calls } = quotes(
      (url) => ticker('USD', prices[/tickers\/([^?]+)/.exec(url)?.[1] ?? '']),
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
      [
        'https://api.coinpaprika.com/v1/tickers/trx-id?quotes=USD',
        'https://api.coinpaprika.com/v1/tickers/usdt-id?quotes=USD',
        'https://api.coinpaprika.com/v1/tickers/btc-id?quotes=USD',
      ],
    );
  });

  test('an id shared by two tokens is asked once', async () => {
    const usdtElsewhere: Token = { ...USDT, chain: 'ethereum', contract: '0xdac1' };
    const { result, calls } = quotes(() => ticker('EUR', 0.9), [USDT, usdtElsewhere]);
    assert.deepEqual([...(await result).keys()], ['tron:USDT', 'ethereum:USDT']);
    assert.equal(calls.length, 1);
  });

  test('a custom api_url is used, with or without a trailing slash', async () => {
    for (const apiUrl of ['http://prices.lan/v1', 'http://prices.lan/v1/']) {
      const { result, calls } = quotes(() => ticker('EUR', 0.3), [TRX], {
        settings: { api_url: apiUrl },
      });
      await result;
      assert.equal(calls[0]?.url, 'http://prices.lan/v1/tickers/trx-id?quotes=EUR');
    }
  });

  test('an id it does not know (404) is left out, and the others are priced', async () => {
    const { result } = quotes(
      (url) =>
        url.includes('usdt-id') ? jsonResponse({ error: 'id not found' }, 404) : ticker('EUR', 2),
      [TRX, USDT, BTC],
    );
    assert.deepEqual([...(await result).keys()], ['tron:TRX', 'bitcoin:BTC']);
  });

  test('a price that is missing or not a positive number is left out, never 0', async () => {
    for (const response of [
      ticker('EUR', 0),
      ticker('EUR', -1),
      ticker('EUR', '0.3'),
      ticker('USD', 0.3),
      jsonResponse({ id: 'x' }),
    ]) {
      const { result } = quotes(() => response, [TRX]);
      assert.equal((await result).size, 0);
    }
  });

  test('another HTTP error throws with the status', async () => {
    const { result } = quotes(() => jsonResponse({ error: 'Invalid parameters' }, 400), [TRX]);
    await assert.rejects(result, (error: Error) => {
      assert.equal(error.message, 'coinpaprika: HTTP 400');
      return true;
    });
  });

  test('a body that is not a map throws', async () => {
    for (const body of [null, [], 'x']) {
      const { result } = quotes(() => jsonResponse(body), [TRX]);
      await assert.rejects(result, /^Error: coinpaprika: /);
    }
  });

  describe('rate limits', () => {
    async function failure(response: Response): Promise<unknown> {
      const { result } = quotes(() => response, [TRX]);
      return result.then(
        () => assert.fail('expected getQuotes to throw'),
        (error: unknown) => error,
      );
    }

    test('one request every 100 ms in serial mode', () => {
      assert.equal(coinpaprika.serialIntervalMs, 100);
    });

    test('a 429 or a 402 is a rate limit: run less often', async () => {
      for (const status of [429, 402]) {
        const error = await failure(
          jsonResponse({ error: 'you have reached maximum request limit' }, status),
        );
        assert.ok(error instanceof ApiError);
        assert.equal(
          coinpaprika.rateLimitAdvice(error, { settings: {}, serial: false }),
          "run less often, or list another price provider after it: CoinPaprika's free API allows 20,000 requests a month",
          String(status),
        );
      }
    });

    test('other errors are not rate limits', async () => {
      for (const error of [
        await failure(jsonResponse({ error: 'Invalid parameters' }, 400)),
        await failure(jsonResponse(null)),
        new Error('HTTP 429'),
      ]) {
        assert.equal(coinpaprika.rateLimitAdvice(error, { settings: {}, serial: false }), null);
      }
    });
  });
});
