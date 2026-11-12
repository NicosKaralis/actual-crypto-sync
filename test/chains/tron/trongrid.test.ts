import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { trongrid } from '../../../src/chains/tron/trongrid.ts';
import type { Token } from '../../../src/types.ts';
import { fakeFetch, fakeTokens, fixture, jsonResponse, TRON_WALLET } from '../../fakes.ts';

const TRX = fakeTokens.find((t) => t.symbol === 'TRX') as Token;
const USDT = fakeTokens.find((t) => t.symbol === 'USDT') as Token;
const SUNDOG: Token = {
  chain: 'tron',
  symbol: 'SUNDOG',
  kind: 'contract',
  contract: 'TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT',
  decimals: 18,
  displayDecimals: 8,
  priceIds: { coingecko: 'sundog' },
};

// test/fixtures/trongrid/account.json: TRON_WALLET, with TRX staked for bandwidth and
// energy, USDT and SUNDOG. account-unstaked.json: TRON_WALLET_2, nothing staked.
function balances(body: unknown, tokens: Token[], settings: Record<string, string> = {}) {
  const { fetch, calls } = fakeFetch(() => jsonResponse(body));
  const result = trongrid.getBalances({
    wallet: { address: TRON_WALLET },
    tokens,
    settings,
    fetch,
  });
  return { result, calls };
}

describe('trongrid', () => {
  test('reads contract tokens', () => {
    assert.equal(trongrid.id, 'trongrid');
    assert.equal(trongrid.supportsContracts, true);
  });

  test('TRX is the balance plus the staked amounts, in sun', async () => {
    const { result } = balances(fixture('trongrid/account.json'), [TRX]);
    // balance 2187378616 + bandwidth 5922000000 + energy 134000000000; TRON_POWER has none
    assert.deepEqual(await result, new Map([['TRX', 142_109_378_616n]]));
  });

  test('staked entries without an amount count as 0', async () => {
    const { result } = balances(fixture('trongrid/account-unstaked.json'), [TRX]);
    assert.deepEqual(await result, new Map([['TRX', 66_356_170n]]));
  });

  test('TRX delegated to others is counted, for energy and for bandwidth', async () => {
    const body = structuredClone(fixture('trongrid/account.json')) as {
      data: Record<string, unknown>[];
    };
    const account = body.data[0] as Record<string, unknown>;
    // Energy delegations sit under account_resource, bandwidth ones on the account.
    account.account_resource = { delegated_frozenV2_balance_for_energy: 1_000_000 };
    account.delegated_frozenV2_balance_for_bandwidth = 2_000_000;
    const { result } = balances(body, [TRX]);
    assert.deepEqual(await result, new Map([['TRX', 142_112_378_616n]]));
  });

  test('a missing balance is 0, as TRON leaves out zero fields', async () => {
    const { result } = balances({ data: [{}], success: true }, [TRX, USDT]);
    assert.deepEqual(
      await result,
      new Map([
        ['TRX', 0n],
        ['USDT', 0n],
      ]),
    );
  });

  test("USDT is its contract's entry in trc20", async () => {
    const { result } = balances(fixture('trongrid/account.json'), [USDT]);
    assert.deepEqual(await result, new Map([['USDT', 828_961n]]));
  });

  test('a custom token with 18 decimals keeps every digit', async () => {
    const { result } = balances(fixture('trongrid/account.json'), [SUNDOG]);
    assert.deepEqual(await result, new Map([['SUNDOG', 19_522_120_000_000_000_000n]]));
  });

  test('a token not in trc20 is 0', async () => {
    const { result } = balances(fixture('trongrid/account-unstaked.json'), [SUNDOG]);
    assert.deepEqual(await result, new Map([['SUNDOG', 0n]]));
  });

  test('every token comes from one request', async () => {
    const { result, calls } = balances(fixture('trongrid/account.json'), [TRX, USDT, SUNDOG]);
    assert.deepEqual(
      await result,
      new Map([
        ['TRX', 142_109_378_616n],
        ['USDT', 828_961n],
        ['SUNDOG', 19_522_120_000_000_000_000n],
      ]),
    );
    assert.deepEqual(
      calls.map((c) => c.url),
      [`https://api.trongrid.io/v1/accounts/${TRON_WALLET}`],
    );
  });

  test('a custom api_url is used, with or without a trailing slash', async () => {
    for (const apiUrl of ['http://tron.lan:8090', 'http://tron.lan:8090/']) {
      const { result, calls } = balances(fixture('trongrid/account.json'), [TRX], {
        api_url: apiUrl,
      });
      await result;
      assert.equal(calls[0]?.url, `http://tron.lan:8090/v1/accounts/${TRON_WALLET}`);
    }
  });

  test('the API key header is sent only when set', async () => {
    const withKey = balances(fixture('trongrid/account.json'), [TRX], { api_key: 'test-key' });
    await withKey.result;
    assert.equal(withKey.calls[0]?.headers['tron-pro-api-key'], 'test-key');

    const without = balances(fixture('trongrid/account.json'), [TRX]);
    await without.result;
    assert.equal('tron-pro-api-key' in (without.calls[0]?.headers ?? {}), false);
  });

  test('empty data throws account not found, naming the wallet by its prefix', async () => {
    const { result } = balances({ data: [], success: true, meta: { page_size: 0 } }, [TRX]);
    await assert.rejects(result, (error: Error) => {
      assert.equal(error.message, 'trongrid: account not found: TC9F...R2MJ');
      return true;
    });
  });

  test('an HTTP error throws with the status, without the address or the key', async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ Error: 'request rate exceeded' }, 429));
    await assert.rejects(
      trongrid.getBalances({
        wallet: { address: TRON_WALLET },
        tokens: [TRX],
        settings: { api_key: 'test-key' },
        fetch,
      }),
      (error: Error) => {
        assert.equal(error.message, 'trongrid: HTTP 429');
        return true;
      },
    );
  });

  test('a failed request names only the error code, never the URL', async () => {
    const fetch = (() =>
      Promise.reject(
        new TypeError(`fetch failed for ${TRON_WALLET}`, { cause: { code: 'ECONNREFUSED' } }),
      )) as typeof globalThis.fetch;
    await assert.rejects(
      trongrid.getBalances({
        wallet: { address: TRON_WALLET },
        tokens: [TRX],
        settings: {},
        fetch,
      }),
      (error: Error) => {
        assert.equal(error.message, 'trongrid: request failed (ECONNREFUSED)');
        return true;
      },
    );
  });

  test('an amount that is not a whole number of sun throws', async () => {
    for (const balance of [1.5, '100', -1, 2 ** 53]) {
      const { result } = balances({ data: [{ balance }] }, [TRX]);
      await assert.rejects(result, /trongrid: data\[0\]\.balance: expected a whole number/);
    }
    const { result } = balances({ data: [{ trc20: [{ [USDT.contract as string]: '1.5' }] }] }, [
      USDT,
    ]);
    await assert.rejects(result, /trongrid: data\[0\]\.trc20: expected a whole number/);
  });

  test('a body that is not an account list throws', async () => {
    for (const body of [null, [], { data: 'x' }, { data: [null] }]) {
      const { result } = balances(body, [TRX]);
      await assert.rejects(result, /^Error: trongrid: /);
    }
  });
});
