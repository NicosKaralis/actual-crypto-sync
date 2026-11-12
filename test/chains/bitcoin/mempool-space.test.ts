import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { mempoolSpace } from '../../../src/chains/bitcoin/mempool-space.ts';
import { ApiError } from '../../../src/http.ts';
import type { Token } from '../../../src/types.ts';
import { BTC_WALLET, fakeFetch, fakeTokens, fixture, jsonResponse } from '../../fakes.ts';

const BTC = fakeTokens.find((t) => t.symbol === 'BTC') as Token;

// test/fixtures/mempool-space/address.json: BTC_WALLET, with unconfirmed transactions.
function balances(response: Response, settings: Record<string, string> = {}) {
  const { fetch, calls } = fakeFetch(() => response);
  const result = mempoolSpace.getBalances({
    wallet: { address: BTC_WALLET },
    tokens: [BTC],
    settings,
    fetch,
  });
  return { result, calls };
}

describe('mempool-space', () => {
  test('reads only the native token', () => {
    assert.equal(mempoolSpace.id, 'mempool-space');
    assert.equal(mempoolSpace.supportsContracts, false);
  });

  test('BTC is the confirmed balance, in satoshi', async () => {
    const { result, calls } = balances(jsonResponse(fixture('mempool-space/address.json')));
    // funded 103759120635710 - spent 103750381076134; mempool_stats aren't counted
    assert.deepEqual(await result, new Map([['BTC', 8_739_559_576n]]));
    assert.deepEqual(
      calls.map((c) => c.url),
      [`https://mempool.space/api/address/${BTC_WALLET}`],
    );
  });

  test('a custom api_url is used, with or without a trailing slash', async () => {
    for (const apiUrl of ['http://mempool.lan/api', 'http://mempool.lan/api/']) {
      const { result, calls } = balances(jsonResponse(fixture('mempool-space/address.json')), {
        api_url: apiUrl,
      });
      await result;
      assert.equal(calls[0]?.url, `http://mempool.lan/api/address/${BTC_WALLET}`);
    }
  });

  test('a 400 throws with the status, without the address', async () => {
    const { result } = balances(new Response('Invalid Bitcoin address', { status: 400 }));
    await assert.rejects(result, (error: Error) => {
      assert.equal(error.message, 'mempool-space: HTTP 400');
      return true;
    });
  });

  test('a body without whole-number sums throws', async () => {
    for (const body of [
      null,
      {},
      { chain_stats: { funded_txo_sum: 1.5, spent_txo_sum: 0 } },
      { chain_stats: { funded_txo_sum: '10', spent_txo_sum: 0 } },
      { chain_stats: { funded_txo_sum: 1, spent_txo_sum: 2 } },
    ]) {
      const { result } = balances(jsonResponse(body));
      await assert.rejects(result, /^Error: mempool-space: /, JSON.stringify(body));
    }
  });

  test('a contract token throws, as Bitcoin has none', async () => {
    const { fetch } = fakeFetch(() => jsonResponse(fixture('mempool-space/address.json')));
    const token: Token = { ...BTC, symbol: 'XYZ', kind: 'contract', contract: 'x' };
    await assert.rejects(
      mempoolSpace.getBalances({
        wallet: { address: BTC_WALLET },
        tokens: [token],
        settings: {},
        fetch,
      }),
      /mempool-space: reads only BTC, not XYZ/,
    );
  });

  describe('rate limits', () => {
    async function failure(response: Response): Promise<unknown> {
      const { result } = balances(response);
      return result.then(
        () => assert.fail('expected getBalances to throw'),
        (error: unknown) => error,
      );
    }

    test('one request a second in serial mode', () => {
      assert.equal(mempoolSpace.serialIntervalMs, 1000);
    });

    test('a 429 is a rate limit: set serial, or use your own instance', async () => {
      const error = await failure(new Response('Too Many Requests', { status: 429 }));
      assert.ok(error instanceof ApiError);
      assert.equal(error.body, 'Too Many Requests');
      assert.equal(
        mempoolSpace.rateLimitAdvice(error, { settings: {}, serial: false }),
        'set serial: true to send one request at a time, or point api_url at your own mempool instance',
      );
      assert.equal(
        mempoolSpace.rateLimitAdvice(error, { settings: {}, serial: true }),
        'point api_url at your own mempool instance',
      );
    });

    test('other errors are not rate limits', async () => {
      for (const error of [
        await failure(new Response('Invalid Bitcoin address', { status: 400 })),
        await failure(new Response('', { status: 503 })),
        new Error('HTTP 429'),
      ]) {
        assert.equal(mempoolSpace.rateLimitAdvice(error, { settings: {}, serial: false }), null);
      }
    });
  });
});
