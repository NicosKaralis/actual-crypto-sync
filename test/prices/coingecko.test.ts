import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError } from '../../src/http.ts';
import { coingecko } from '../../src/prices/coingecko.ts';
import type { Token } from '../../src/types.ts';
import { fakeFetch, fakeTokens, fixture, jsonResponse } from '../fakes.ts';

const [TRX, USDT, BTC] = ['TRX', 'USDT', 'BTC'].map(
  (symbol) => fakeTokens.find((t) => t.symbol === symbol) as Token,
) as [Token, Token, Token];

// test/fixtures/coingecko/simple-price.json: tron, tether and bitcoin in eur.
function quotes(response: Response, tokens: Token[], settings: Record<string, string> = {}) {
  const { fetch, calls } = fakeFetch(() => response);
  const result = coingecko.getQuotes({ tokens, currency: 'eur', settings, fetch });
  return { result, calls };
}

describe('coingecko', () => {
  test('supports fiat currencies, not crypto ones', () => {
    for (const currency of ['eur', 'usd', 'jpy', 'chf', 'gbp']) {
      assert.equal(coingecko.supportsCurrency(currency), true, currency);
    }
    for (const currency of ['btc', 'eth', 'sats', 'bits', 'xau', 'EUR', 'abc']) {
      assert.equal(coingecko.supportsCurrency(currency), false, currency);
    }
  });

  test('prices every token in one request', async () => {
    const { result, calls } = quotes(jsonResponse(fixture('coingecko/simple-price.json')), [
      TRX,
      USDT,
      BTC,
    ]);
    assert.deepEqual(
      await result,
      new Map([
        ['tron:TRX', { price: 0.285883, currency: 'eur' }],
        ['tron:USDT', { price: 0.904102, currency: 'eur' }],
        ['bitcoin:BTC', { price: 65005, currency: 'eur' }],
      ]),
    );
    assert.deepEqual(
      calls.map((c) => c.url),
      ['https://api.coingecko.com/api/v3/simple/price?ids=tron,tether,bitcoin&vs_currencies=eur'],
    );
  });

  test('an id shared by two tokens is asked once', async () => {
    const usdtElsewhere: Token = { ...USDT, chain: 'ethereum', contract: '0xdac1' };
    const { result, calls } = quotes(jsonResponse(fixture('coingecko/simple-price.json')), [
      USDT,
      usdtElsewhere,
    ]);
    assert.deepEqual([...(await result).keys()], ['tron:USDT', 'ethereum:USDT']);
    assert.match(calls[0]?.url ?? '', /\?ids=tether&vs_currencies=eur$/);
  });

  test('a custom api_url is used, with or without a trailing slash', async () => {
    for (const apiUrl of ['http://prices.lan/v3', 'http://prices.lan/v3/']) {
      const { result, calls } = quotes(
        jsonResponse(fixture('coingecko/simple-price.json')),
        [TRX],
        {
          api_url: apiUrl,
        },
      );
      await result;
      assert.equal(calls[0]?.url, 'http://prices.lan/v3/simple/price?ids=tron&vs_currencies=eur');
    }
  });

  test('an id missing from the answer is left out, never 0', async () => {
    const { result } = quotes(jsonResponse({ tron: { eur: 0.285883 }, tether: {} }), [
      TRX,
      USDT,
      BTC,
    ]);
    assert.deepEqual([...(await result).keys()], ['tron:TRX']);
  });

  test('a price that is not a positive number is left out', async () => {
    const { result } = quotes(
      jsonResponse({ tron: { eur: 0 }, tether: { eur: '0.9' }, bitcoin: { eur: -1 } }),
      [TRX, USDT, BTC],
    );
    assert.equal((await result).size, 0);
  });

  test('an HTTP error throws with the status', async () => {
    const { result } = quotes(jsonResponse({ status: { error_code: 429 } }, 429), [TRX]);
    await assert.rejects(result, (error: Error) => {
      assert.equal(error.message, 'coingecko: HTTP 429');
      return true;
    });
  });

  test('a body that is not a map throws', async () => {
    for (const body of [null, [], 'x']) {
      const { result } = quotes(jsonResponse(body), [TRX]);
      await assert.rejects(result, /^Error: coingecko: /);
    }
  });

  describe('rate limits', () => {
    // CoinGecko's public API answer when it's called too often.
    const RATE_LIMITED = {
      status: { error_code: 429, error_message: "You've exceeded the Rate Limit." },
    };

    async function failure(response: Response): Promise<unknown> {
      const { result } = quotes(response, [TRX]);
      return result.then(
        () => assert.fail('expected getQuotes to throw'),
        (error: unknown) => error,
      );
    }

    test('one request every 6 seconds in serial mode', () => {
      assert.equal(coingecko.serialIntervalMs, 6000);
    });

    test('a 429 without a key: add a free Demo key, run less often, or list another provider', async () => {
      const error = await failure(jsonResponse(RATE_LIMITED, 429));
      assert.ok(error instanceof ApiError);
      assert.equal(
        coingecko.rateLimitAdvice(error, { settings: {}, serial: false }),
        "add a free Demo key (demo_api_key: ${COINGECKO_API_KEY}), run less often, or list another price provider after it: CoinGecko's public API allows a few requests a minute",
      );
    });

    test('a 429 with a key: run less often, or list another provider', async () => {
      const error = await failure(jsonResponse(RATE_LIMITED, 429));
      for (const settings of [{ demo_api_key: 'test-key' }, { pro_api_key: 'test-key' }] as Record<
        string,
        string
      >[]) {
        assert.equal(
          coingecko.rateLimitAdvice(error, { settings, serial: false }),
          'run less often, or list another price provider after it',
        );
      }
    });

    test('other errors are not rate limits', async () => {
      for (const error of [
        await failure(jsonResponse({ status: { error_code: 500 } }, 500)),
        await failure(jsonResponse(null)),
        new Error('HTTP 429'),
      ]) {
        assert.equal(coingecko.rateLimitAdvice(error, { settings: {}, serial: false }), null);
      }
    });
  });

  describe('API keys', () => {
    // Demo and Pro keys look the same, so the setting says which plan a key is for.
    const PRICE = fixture('coingecko/simple-price.json');

    test('no key: the public API, with no key header', async () => {
      const { result, calls } = quotes(jsonResponse(PRICE), [TRX]);
      await result;
      assert.match(calls[0]?.url ?? '', /^https:\/\/api\.coingecko\.com\/api\/v3\//);
      assert.deepEqual(Object.keys(calls[0]?.headers ?? {}), ['accept']);
    });

    test('demo_api_key: the public API, with the Demo key header', async () => {
      const { result, calls } = quotes(jsonResponse(PRICE), [TRX], { demo_api_key: 'test-key' });
      await result;
      assert.match(calls[0]?.url ?? '', /^https:\/\/api\.coingecko\.com\/api\/v3\//);
      assert.equal(calls[0]?.headers['x-cg-demo-api-key'], 'test-key');
      assert.equal(calls[0]?.headers['x-cg-pro-api-key'], undefined);
    });

    test('pro_api_key: the Pro API, with the Pro key header', async () => {
      const { result, calls } = quotes(jsonResponse(PRICE), [TRX], { pro_api_key: 'test-key' });
      await result;
      assert.equal(
        calls[0]?.url,
        'https://pro-api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=eur',
      );
      assert.equal(calls[0]?.headers['x-cg-pro-api-key'], 'test-key');
      assert.equal(calls[0]?.headers['x-cg-demo-api-key'], undefined);
    });

    test('api_url overrides the Pro API', async () => {
      const { result, calls } = quotes(jsonResponse(PRICE), [TRX], {
        pro_api_key: 'test-key',
        api_url: 'http://prices.lan/v3',
      });
      await result;
      assert.match(calls[0]?.url ?? '', /^http:\/\/prices\.lan\/v3\/simple\/price/);
    });

    test('an error never shows the key', async () => {
      const { result } = quotes(jsonResponse({}, 401), [TRX], { demo_api_key: 'test-key' });
      await assert.rejects(result, (error: Error) => {
        assert.equal(error.message, 'coingecko: HTTP 401');
        return true;
      });
    });

    test('one key or none is fine; both is an error', () => {
      assert.equal(coingecko.checkSettings?.({}), null);
      assert.equal(coingecko.checkSettings?.({ demo_api_key: 'a' }), null);
      assert.equal(coingecko.checkSettings?.({ pro_api_key: 'a' }), null);
      assert.equal(
        coingecko.checkSettings?.({ demo_api_key: 'a', pro_api_key: 'b' }),
        'set only one of demo_api_key and pro_api_key',
      );
    });
  });
});
