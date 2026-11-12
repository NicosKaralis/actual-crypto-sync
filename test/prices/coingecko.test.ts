import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

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
});
