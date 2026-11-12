import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { collectBalances } from '../src/balances.ts';
import type { Config } from '../src/config.ts';
import type { Chain, Explorer, Token, Wallet } from '../src/types.ts';
import { fakeChains, fakeTokens, TRON_WALLET, TRON_WALLET_2 } from './fakes.ts';

const TRX = fakeTokens.find((t) => t.symbol === 'TRX') as Token;
const USDT = fakeTokens.find((t) => t.symbol === 'USDT') as Token;
const tron = fakeChains.tron as Chain;

interface Call {
  explorer: string;
  wallet: string;
  tokens: string[];
}

/** An explorer answering each wallet with `answer`, recording its calls in `calls`. */
function explorer(
  id: string,
  calls: Call[],
  answer: (wallet: Wallet, tokens: Token[]) => Map<string, bigint>,
  supportsContracts = true,
): Explorer {
  return {
    id,
    supportsContracts,
    serialIntervalMs: 1000,
    // Any error ending in HTTP 429 is this fake's rate limit.
    rateLimitAdvice: (error, { serial }) =>
      error instanceof Error && error.message.endsWith('HTTP 429')
        ? serial
          ? 'run less often'
          : 'set serial: true'
        : null,
    getBalances: async ({ wallet, tokens, fetch }) => {
      calls.push({ explorer: id, wallet: wallet.address, tokens: tokens.map((t) => t.symbol) });
      await fetch(`http://explorer.test/${wallet.address}`);
      return answer(wallet, tokens);
    },
  };
}

const all = (raw: bigint) => (_wallet: Wallet, tokens: Token[]) =>
  new Map(tokens.map((t) => [t.symbol, raw]));
const failing = (message: string) => () => {
  throw new Error(message);
};

function config(
  explorers: { label: string; explorer: Explorer; serial?: boolean }[],
  accounts: { name: string; token: Token; wallet: string }[],
): Config {
  return {
    actual: { serverURL: 'http://actual:5006', syncId: 'x', auth: { kind: 'session', token: 'x' } },
    prices: { currency: 'eur', providers: [] },
    chains: {
      tron: {
        chain: tron,
        explorers: explorers.map((e) => ({ serial: false, ...e, settings: {} })),
      },
    },
    accounts: accounts.map(({ name, token, wallet }) => ({
      name,
      chain: 'tron',
      token,
      wallets: [{ address: wallet }],
    })),
  };
}

/** A fetch that answers after a tick, counting how many requests were open at once. */
function trackingFetch() {
  const state = { active: 0, maxActive: 0 };
  const fetch = (async () => {
    state.active++;
    state.maxActive = Math.max(state.maxActive, state.active);
    await new Promise((resolve) => setImmediate(resolve));
    state.active--;
    return new Response('{}');
  }) as typeof globalThis.fetch;
  return { fetch, state };
}

const { fetch } = trackingFetch();

describe('collectBalances', () => {
  test('TRX and USDT accounts on the same address make one request', async () => {
    const calls: Call[] = [];
    const result = await collectBalances({
      config: config(
        [{ label: 'trongrid', explorer: explorer('trongrid', calls, all(5n)) }],
        [
          { name: 'trx', token: TRX, wallet: TRON_WALLET },
          { name: 'usdt', token: USDT, wallet: TRON_WALLET },
        ],
      ),
      fetch,
    });
    assert.deepEqual(calls, [
      { explorer: 'trongrid', wallet: TRON_WALLET, tokens: ['TRX', 'USDT'] },
    ]);
    assert.deepEqual(
      result,
      new Map([
        ['trx', { raw: 5n, explorer: 'trongrid' }],
        ['usdt', { raw: 5n, explorer: 'trongrid' }],
      ]),
    );
  });

  test('a failing first explorer passes the wallet to the second', async () => {
    const calls: Call[] = [];
    const warnings: string[] = [];
    const result = await collectBalances({
      config: config(
        [
          { label: 'first', explorer: explorer('trongrid', calls, failing('trongrid: HTTP 503')) },
          { label: 'second', explorer: explorer('trongrid', calls, all(7n)) },
        ],
        [{ name: 'trx', token: TRX, wallet: TRON_WALLET }],
      ),
      fetch,
      warn: (message) => warnings.push(message),
    });
    assert.deepEqual(result.get('trx'), { raw: 7n, explorer: 'second' });
    assert.equal(calls.length, 2);
    assert.deepEqual(warnings, ['TC9F...R2MJ: first failed: trongrid: HTTP 503']);
  });

  test('an explorer that leaves out a token passes the whole wallet on', async () => {
    // Never one explorer's TRX with another's USDT for the same wallet.
    const calls: Call[] = [];
    const result = await collectBalances({
      config: config(
        [
          {
            label: 'first',
            explorer: explorer('trongrid', calls, () => new Map([['TRX', 1n]])),
          },
          { label: 'second', explorer: explorer('trongrid', calls, all(2n)) },
        ],
        [
          { name: 'trx', token: TRX, wallet: TRON_WALLET },
          { name: 'usdt', token: USDT, wallet: TRON_WALLET },
        ],
      ),
      fetch,
    });
    assert.deepEqual(result.get('trx'), { raw: 2n, explorer: 'second' });
    assert.deepEqual(result.get('usdt'), { raw: 2n, explorer: 'second' });
  });

  test('a native-only explorer is skipped for a wallet with a contract token', async () => {
    const calls: Call[] = [];
    const result = await collectBalances({
      config: config(
        [
          { label: 'native', explorer: explorer('tron-native-only', calls, all(1n), false) },
          { label: 'trongrid', explorer: explorer('trongrid', calls, all(3n)) },
        ],
        [
          { name: 'usdt', token: USDT, wallet: TRON_WALLET },
          { name: 'trx-2', token: TRX, wallet: TRON_WALLET_2 },
        ],
      ),
      fetch,
    });
    assert.deepEqual(result.get('usdt'), { raw: 3n, explorer: 'trongrid' });
    // The native-only explorer still answers a wallet with only TRX.
    assert.deepEqual(result.get('trx-2'), { raw: 1n, explorer: 'native' });
    assert.deepEqual(
      calls.filter((c) => c.explorer === 'tron-native-only').map((c) => c.wallet),
      [TRON_WALLET_2],
    );
  });

  test('every explorer failing fails only the accounts on that wallet', async () => {
    const calls: Call[] = [];
    const broken = (wallet: Wallet, tokens: Token[]) => {
      if (wallet.address === TRON_WALLET) {
        throw new Error('trongrid: HTTP 500');
      }
      return all(9n)(wallet, tokens);
    };
    const result = await collectBalances({
      config: config(
        [
          { label: 'first', explorer: explorer('trongrid', calls, broken) },
          { label: 'second', explorer: explorer('trongrid', calls, broken) },
        ],
        [
          { name: 'trx', token: TRX, wallet: TRON_WALLET },
          { name: 'usdt', token: USDT, wallet: TRON_WALLET },
          { name: 'trx-2', token: TRX, wallet: TRON_WALLET_2 },
        ],
      ),
      fetch,
    });
    assert.deepEqual(result.get('trx-2'), { raw: 9n, explorer: 'first' });
    for (const name of ['trx', 'usdt']) {
      const entry = result.get(name);
      assert.ok(entry && 'error' in entry, name);
      assert.equal(
        entry.error.message,
        'TC9F...R2MJ: every explorer failed (first: trongrid: HTTP 500; second: trongrid: HTTP 500)',
      );
      assert.equal(entry.error.message.includes(TRON_WALLET), false);
    }
  });

  test('a wallet no explorer can read fails with the reason', async () => {
    const result = await collectBalances({
      config: config(
        [{ label: 'native', explorer: explorer('tron-native-only', [], all(1n), false) }],
        [{ name: 'usdt', token: USDT, wallet: TRON_WALLET }],
      ),
      fetch,
    });
    const entry = result.get('usdt');
    assert.ok(entry && 'error' in entry);
    assert.equal(
      entry.error.message,
      "TC9F...R2MJ: every explorer failed (native: doesn't read contract tokens)",
    );
  });

  describe('rate limits and serial mode', () => {
    const twoWallets = [
      { name: 'trx', token: TRX, wallet: TRON_WALLET },
      { name: 'trx-2', token: TRX, wallet: TRON_WALLET_2 },
    ];

    test('a rate limit warns once with the advice, and fails only that wallet', async () => {
      const warnings: string[] = [];
      const limited = (wallet: Wallet, tokens: Token[]) => {
        if (wallet.address === TRON_WALLET_2) {
          throw new Error('trongrid: HTTP 429');
        }
        return all(4n)(wallet, tokens);
      };
      const result = await collectBalances({
        config: config(
          [{ label: 'trongrid', explorer: explorer('trongrid', [], limited) }],
          twoWallets,
        ),
        fetch,
        warn: (message) => warnings.push(message),
      });
      assert.deepEqual(result.get('trx'), { raw: 4n, explorer: 'trongrid' });
      assert.ok('error' in (result.get('trx-2') ?? {}));
      assert.deepEqual(warnings, [
        'TF4E...JKv2: trongrid failed: trongrid: HTTP 429',
        'trongrid is rate limiting requests: set serial: true',
      ]);
    });

    test('the advice is given once per entry, however many wallets hit it', async () => {
      const warnings: string[] = [];
      await collectBalances({
        config: config(
          [
            {
              label: 'trongrid',
              explorer: explorer('trongrid', [], failing('trongrid: HTTP 429')),
            },
          ],
          twoWallets,
        ),
        fetch,
        warn: (message) => warnings.push(message),
      });
      assert.equal(warnings.filter((w) => w.includes('rate limiting')).length, 1);
    });

    test('the advice knows serial mode is on', async () => {
      const warnings: string[] = [];
      await collectBalances({
        config: config(
          [
            {
              label: 'trongrid',
              explorer: explorer('trongrid', [], failing('trongrid: HTTP 429')),
              serial: true,
            },
          ],
          [twoWallets[0] as (typeof twoWallets)[number]],
        ),
        fetch,
        sleep: async () => {},
        warn: (message) => warnings.push(message),
      });
      assert.ok(warnings.includes('trongrid is rate limiting requests: run less often'));
    });

    test('other errors give no advice', async () => {
      const warnings: string[] = [];
      await collectBalances({
        config: config(
          [
            {
              label: 'trongrid',
              explorer: explorer('trongrid', [], failing('trongrid: HTTP 500')),
            },
          ],
          twoWallets,
        ),
        fetch,
        warn: (message) => warnings.push(message),
      });
      assert.equal(warnings.filter((w) => w.includes('rate limiting')).length, 0);
    });

    test('without serial, wallets are read in parallel', async () => {
      const tracking = trackingFetch();
      const sleeps: number[] = [];
      await collectBalances({
        config: config(
          [{ label: 'trongrid', explorer: explorer('trongrid', [], all(1n)) }],
          twoWallets,
        ),
        fetch: tracking.fetch,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      assert.equal(tracking.state.maxActive, 2);
      assert.deepEqual(sleeps, []);
    });

    test('with serial, one request at a time, waiting the interval between them', async () => {
      const tracking = trackingFetch();
      const sleeps: number[] = [];
      const result = await collectBalances({
        config: config(
          [{ label: 'trongrid', explorer: explorer('trongrid', [], all(1n)), serial: true }],
          twoWallets,
        ),
        fetch: tracking.fetch,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      assert.equal(tracking.state.maxActive, 1);
      assert.deepEqual(sleeps, [1000]);
      assert.equal(result.size, 2);
    });

    test('serial is per entry: a fallback without it is not slowed down', async () => {
      const tracking = trackingFetch();
      const sleeps: number[] = [];
      await collectBalances({
        config: config(
          [
            { label: 'first', explorer: explorer('trongrid', [], failing('x')), serial: true },
            { label: 'second', explorer: explorer('trongrid', [], all(1n)) },
          ],
          twoWallets,
        ),
        fetch: tracking.fetch,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      // Only the serial entry waits: once, between its two requests.
      assert.deepEqual(sleeps, [1000]);
    });
  });
});
