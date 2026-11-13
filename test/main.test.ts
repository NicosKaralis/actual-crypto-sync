import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Attributes } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';

import { type Actual, type ActualApi, type OpenBudgetOptions, openBudget } from '../src/actual.ts';
import { type ActualAuth, type Config, ConfigError } from '../src/config.ts';
import { createLog, LOG_FORMATS } from '../src/log.ts';
import { main, run } from '../src/main.ts';
import type { PlanTransaction } from '../src/plan.ts';
import { type GaugeName, startTelemetry, type Telemetry } from '../src/telemetry.ts';
import type { Chain, Explorer, PriceProvider, Quote, Token } from '../src/types.ts';
import { BTC_WALLET, fakeChains, fakeTokens, TRON_WALLET } from './fakes.ts';

const TRX = fakeTokens.find((t) => t.symbol === 'TRX') as Token;
const USDT = fakeTokens.find((t) => t.symbol === 'USDT') as Token;
const BTC = fakeTokens.find((t) => t.symbol === 'BTC') as Token;

// 09:00 local time on 2026-11-12.
const NOW = new Date(2026, 10, 12, 9, 0, 0);
const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';

const RAW: Record<string, bigint> = { TRX: 156_919_300n, USDT: 10_000_000n, BTC: 100_000n };
const PRICES: Record<string, number> = { TRX: 0.297, USDT: 0.9, BTC: 80_000 };

/** An explorer answering every wallet from RAW, or failing for the addresses in `failFor`. */
function explorer(id: string, calls: string[], failFor: string[] = []): Explorer {
  return {
    id,
    supportsContracts: true,
    settingKeys: [],
    serialIntervalMs: 0,
    rateLimitAdvice: () => null,
    getBalances: async ({ wallet, tokens }) => {
      calls.push(`${id} ${wallet.address}`);
      if (failFor.includes(wallet.address)) {
        throw new Error(`${id}: HTTP 500`);
      }
      return new Map(tokens.map((token) => [token.symbol, RAW[token.symbol] ?? 0n]));
    },
  };
}

/** A provider quoting every token in PRICES except `missing`, or failing every call. */
function provider(
  calls: string[],
  missing: string[] = [],
  { fails = false }: { fails?: boolean } = {},
): PriceProvider {
  const id = 'coingecko';
  return {
    id,
    supportsCurrency: () => true,
    settingKeys: [],
    serialIntervalMs: 0,
    rateLimitAdvice: () => null,
    getQuotes: async ({ tokens, currency }) => {
      calls.push(`${id} ${tokens.map((t) => t.symbol).join(',')}`);
      if (fails) {
        throw new Error(`${id}: HTTP 503`);
      }
      const quotes = new Map<string, Quote>();
      for (const token of tokens) {
        const price = PRICES[token.symbol];
        if (price !== undefined && !missing.includes(token.symbol)) {
          quotes.set(`${token.chain}:${token.symbol}`, { price, currency });
        }
      }
      return quotes;
    },
  };
}

function config(
  options: {
    tronExplorers?: Explorer[];
    bitcoinExplorers?: Explorer[];
    priceProvider?: PriceProvider;
    priceProviders?: { label: string; provider: PriceProvider }[];
    auth?: ActualAuth;
  } = {},
): Config {
  const calls: string[] = [];
  const entry = (explorer: Explorer) => ({
    label: explorer.id,
    explorer,
    settings: {},
    serial: false,
  });
  return {
    actual: {
      serverURL: 'http://actual:5006',
      syncId: 'budget-sync-id',
      auth: options.auth ?? { kind: 'session', token: 'x' },
    },
    prices: {
      currency: 'eur',
      providers: (
        options.priceProviders ?? [
          { label: 'coingecko', provider: options.priceProvider ?? provider(calls) },
        ]
      ).map(({ label, provider }) => ({ label, provider, settings: {}, serial: false })),
    },
    chains: {
      tron: {
        chain: fakeChains.tron as Chain,
        explorers: (options.tronExplorers ?? [explorer('trongrid', calls)]).map(entry),
      },
      bitcoin: {
        chain: fakeChains.bitcoin as Chain,
        explorers: (options.bitcoinExplorers ?? [explorer('mempool-space', calls)]).map(entry),
      },
    },
    accounts: [
      { name: 'TRX', chain: 'tron', token: TRX, wallets: [{ address: TRON_WALLET }] },
      { name: 'USDT', chain: 'tron', token: USDT, wallets: [{ address: TRON_WALLET }] },
      { name: 'Bitcoin', chain: 'bitcoin', token: BTC, wallets: [{ address: BTC_WALLET }] },
    ],
  };
}

const WRITES = ['create', 'update', 'clear', 'delete', 'sync'];

/** A fake opened budget: three accounts, `txs` per account, a balance of `balances` cents. */
function fakeActual(
  txs: Record<string, PlanTransaction[]> = {},
  balances: Record<string, number> = {},
) {
  const calls: string[] = [];
  const ids: Record<string, string> = { TRX: 'acc-trx', USDT: 'acc-usdt', Bitcoin: 'acc-btc' };
  const actual: Actual = {
    findAccount: async (name) => {
      calls.push(`find ${name}`);
      const id = ids[name];
      if (id === undefined) {
        throw new Error(`account "${name}" not found`);
      }
      return { id, name };
    },
    transactionsForPlan: async (id, today) => {
      calls.push(`transactions ${id} ${today}`);
      return txs[id] ?? [];
    },
    balanceThrough: async (id, date) => {
      calls.push(`balance ${id} ${date}`);
      return balances[id] ?? 0;
    },
    createTransaction: async (id, tx) => {
      calls.push(`create ${id} ${tx.date} ${tx.amount} ${tx.notes}`);
    },
    updateTransaction: async (id, fields) => {
      calls.push(`update ${id} ${fields.amount} ${fields.notes}`);
    },
    clearTransaction: async (id) => {
      calls.push(`clear ${id}`);
    },
    deleteTransaction: async (id) => {
      calls.push(`delete ${id}`);
    },
    close: async ({ sync }) => {
      calls.push(sync ? 'sync' : 'close');
    },
  };
  return { actual, calls };
}

/** Telemetry recording every gauge value, with spans in memory. */
function fakeTelemetry() {
  const recorded: { gauge: GaugeName; value: number; attributes: Attributes }[] = [];
  const spanExporter = new InMemorySpanExporter();
  const real = startTelemetry({ env: {}, spanExporter, instrumentFetch: false });
  const gauges = new Proxy({} as Telemetry['gauges'], {
    get: (_target, gauge: GaugeName) => ({
      record: (value: number, attributes: Attributes = {}) =>
        recorded.push({ gauge, value, attributes }),
    }),
  });
  const telemetry: Telemetry = { ...real, gauges };
  const values = (gauge: GaugeName) =>
    recorded
      .filter((entry) => entry.gauge === gauge)
      .map(({ value, attributes }): Record<string, unknown> => ({ value, ...attributes }));
  return { telemetry, values, spanExporter };
}

function capturedLog() {
  const lines: string[] = [];
  const log = createLog({ debug: true, format: 'json', write: (line) => lines.push(line) });
  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { log, lines, entries };
}

const noFetch = (() => {
  throw new Error('no network in tests');
}) as typeof fetch;

async function runWith(
  options: {
    config?: Config | (() => Config);
    actual?: ReturnType<typeof fakeActual>;
    openActual?: (options: OpenBudgetOptions) => Promise<Actual>;
    dryRun?: boolean;
    fetch?: typeof fetch;
  } = {},
) {
  const actual = options.actual ?? fakeActual();
  const { telemetry, values, spanExporter } = fakeTelemetry();
  const { log, entries } = capturedLog();
  const opened: OpenBudgetOptions[] = [];
  const given = options.config;
  const readConfig = typeof given === 'function' ? given : () => given ?? config();
  const code = await run({
    readConfig,
    openActual:
      options.openActual ??
      (async (open) => {
        opened.push(open);
        return actual.actual;
      }),
    fetch: options.fetch ?? noFetch,
    telemetry,
    log,
    now: () => NOW,
    dryRun: options.dryRun ?? false,
    dataDir: '/cache',
  });
  // Read before shutdown, which empties the in-memory span exporter.
  const spans = spanExporter.getFinishedSpans();
  await telemetry.shutdown();
  return { code, calls: actual.calls, values, entries, opened, spans };
}

describe('run', () => {
  test('writes one transaction per account and syncs', async () => {
    const { code, calls, values, opened, spans } = await runWith();
    assert.equal(code, 0);
    const root = spans.find((span) => span.name === 'actual-crypto-sync.run');
    assert.ok(root);
    const parentOf = (name: string) =>
      spans.find((span) => span.name === name)?.parentSpanContext?.spanId;
    const childrenOfRoot = spans
      .filter((span) => span.parentSpanContext?.spanId === root.spanContext().spanId)
      .map((span) => span.name)
      .sort();
    assert.deepEqual(childrenOfRoot, [
      'account Bitcoin',
      'account TRX',
      'account USDT',
      'actual.download',
      'quotes',
      'wallet bitcoin bc1q...298v',
      'wallet tron TC9F...R2MJ',
    ]);
    const quotes = spans.find((span) => span.name === 'quotes');
    assert.equal(parentOf('price coingecko'), quotes?.spanContext().spanId);
    const wallet = spans.find((span) => span.name === 'wallet tron TC9F...R2MJ');
    assert.deepEqual(wallet?.attributes, { 'explorer.trongrid': 'ok', explorer: 'trongrid' });
    assert.deepEqual(opened, [
      {
        serverURL: 'http://actual:5006',
        auth: { kind: 'session', token: 'x' },
        syncId: 'budget-sync-id',
        dataDir: '/cache',
        encryptionPassword: undefined,
      },
    ]);
    assert.ok(calls.includes(`balance acc-trx ${YESTERDAY}`));
    assert.ok(calls.includes(`transactions acc-trx ${TODAY}`));
    assert.ok(
      calls.includes(
        `create acc-trx ${TODAY} 4661 156.9193 TRX (Δ +156.9193 @ 0.297 EUR/TRX, 46.61 EUR)`,
      ),
    );
    assert.ok(calls.includes(`create acc-usdt ${TODAY} 900 10 USDT (Δ +10 @ 0.9 EUR/USDT, 9 EUR)`));
    assert.ok(
      calls.includes(`create acc-btc ${TODAY} 8000 0.001 BTC (Δ +0.001 @ 80000 EUR/BTC, 80 EUR)`),
    );
    assert.equal(calls.at(-1), 'sync');

    assert.deepEqual(values('lastRun'), [{ value: NOW.getTime() / 1000 }]);
    assert.deepEqual(values('lastSuccess'), [{ value: NOW.getTime() / 1000 }]);
    assert.equal(values('runDuration').length, 1);
    assert.deepEqual(values('transactions'), [
      { value: 3, action: 'created' },
      { value: 0, action: 'updated' },
      { value: 0, action: 'cleared' },
      { value: 0, action: 'deleted' },
    ]);
    assert.ok(values('errors').every((entry) => entry.value === 0));
    assert.deepEqual(
      values('errors').map((entry) => entry.stage),
      ['config', 'wallet', 'quotes', 'actual', 'account'],
    );
    assert.deepEqual(values('balance')[0], {
      value: 156.9193,
      chain: 'tron',
      symbol: 'TRX',
      account: 'TRX',
      explorer: 'trongrid',
    });
    assert.deepEqual(values('price')[0], {
      value: 0.297,
      symbol: 'TRX',
      currency: 'eur',
      source: 'coingecko',
    });
    assert.deepEqual(values('value')[0], {
      value: 46.61,
      chain: 'tron',
      symbol: 'TRX',
      account: 'TRX',
      currency: 'eur',
    });
  });

  test("updates today's entry, deletes duplicates, clears earlier ones", async () => {
    const note = (balance: string) => `${balance} TRX (Δ +0 @ 0.3 EUR/TRX, 1 EUR)`;
    const actual = fakeActual(
      {
        'acc-trx': [
          { id: 't-b', date: TODAY, amount: 10, notes: note('150'), cleared: false },
          { id: 't-a', date: TODAY, amount: 20, notes: note('150'), cleared: false },
          { id: 'y', date: YESTERDAY, amount: 4000, notes: note('150'), cleared: false },
          { id: 'old', date: '2026-11-01', amount: 100, notes: note('100'), cleared: true },
        ],
      },
      { 'acc-trx': 4100 },
    );
    const { code, calls, values } = await runWith({ actual });
    assert.equal(code, 0);
    assert.ok(calls.includes('update t-a 561 156.9193 TRX (Δ +6.9193 @ 0.297 EUR/TRX, 46.61 EUR)'));
    assert.ok(calls.includes('delete t-b'));
    assert.ok(calls.includes('clear y'));
    assert.ok(!calls.includes('clear old'));
    assert.ok(!calls.some((call) => call.startsWith('create acc-trx')));
    assert.deepEqual(
      values('transactions').map((entry) => entry.value),
      [2, 1, 1, 1],
    );
  });

  test('--dry-run reads everything and calls no write method', async () => {
    const actual = fakeActual({
      'acc-trx': [
        {
          id: 'y',
          date: YESTERDAY,
          amount: 1,
          notes: '1 TRX (Δ +1 @ 0.3 EUR/TRX, 0.3 EUR)',
          cleared: false,
        },
      ],
    });
    const { code, calls, entries } = await runWith({ actual, dryRun: true });
    assert.equal(code, 0);
    assert.ok(calls.includes('find TRX'));
    assert.deepEqual(
      calls.filter((call) => WRITES.some((write) => call.startsWith(write))),
      [],
    );
    assert.equal(calls.at(-1), 'close');
    assert.ok(entries().some((entry) => entry.msg === 'dry run: would create a transaction'));
  });

  test('a wallet every explorer fails on fails only its accounts', async () => {
    const calls: string[] = [];
    const {
      code,
      calls: actualCalls,
      values,
    } = await runWith({
      config: config({
        bitcoinExplorers: [explorer('mempool-space', calls, [BTC_WALLET])],
      }),
    });
    assert.equal(code, 1);
    assert.ok(actualCalls.some((call) => call.startsWith('create acc-trx')));
    assert.ok(actualCalls.some((call) => call.startsWith('create acc-usdt')));
    assert.ok(!actualCalls.some((call) => call.includes('acc-btc')));
    assert.equal(actualCalls.at(-1), 'sync');
    assert.deepEqual(
      values('errors').find((entry) => entry.stage === 'wallet'),
      { value: 1, stage: 'wallet' },
    );
    assert.deepEqual(values('lastSuccess'), []);
    assert.deepEqual(values('lastRun'), [{ value: NOW.getTime() / 1000 }]);
  });

  test('a token with no quote fails only its accounts', async () => {
    const { code, calls, values } = await runWith({
      config: config({ priceProvider: provider([], ['USDT']) }),
    });
    assert.equal(code, 1);
    assert.ok(calls.some((call) => call.startsWith('create acc-trx')));
    assert.ok(calls.some((call) => call.startsWith('create acc-btc')));
    assert.ok(!calls.some((call) => call.includes('acc-usdt')));
    assert.deepEqual(
      values('errors').find((entry) => entry.stage === 'quotes'),
      { value: 1, stage: 'quotes' },
    );
    assert.deepEqual(values('lastSuccess'), []);
  });

  test('a fallback explorer answering counts a provider error and still succeeds', async () => {
    const calls: string[] = [];
    const { code, values } = await runWith({
      config: config({
        tronExplorers: [explorer('trongrid', calls, [TRON_WALLET]), explorer('tron-backup', calls)],
      }),
    });
    assert.equal(code, 0);
    assert.deepEqual(values('providerErrors'), [{ value: 1, kind: 'explorer', id: 'trongrid' }]);
    assert.equal(values('balance')[0]?.explorer, 'tron-backup');
    assert.equal(values('lastSuccess').length, 1);
  });

  test('a fallback price provider answering counts a provider error and still succeeds', async () => {
    const calls: string[] = [];
    const { code, values } = await runWith({
      config: config({
        priceProviders: [
          { label: 'coingecko', provider: provider(calls, [], { fails: true }) },
          { label: 'coingecko#2', provider: provider(calls) },
        ],
      }),
    });
    assert.equal(code, 0);
    assert.deepEqual(values('providerErrors'), [{ value: 1, kind: 'price', id: 'coingecko' }]);
    assert.ok(values('price').every((entry) => entry.source === 'coingecko#2'));
    assert.equal(values('lastSuccess').length, 1);
  });

  test('every price provider failing fails the run, counting each provider', async () => {
    const calls: string[] = [];
    const {
      code,
      values,
      calls: actualCalls,
    } = await runWith({
      config: config({
        priceProviders: [
          { label: 'coingecko', provider: provider(calls, [], { fails: true }) },
          { label: 'coingecko#2', provider: provider(calls, [], { fails: true }) },
        ],
      }),
    });
    assert.equal(code, 1);
    assert.deepEqual(values('providerErrors'), [
      { value: 1, kind: 'price', id: 'coingecko' },
      { value: 1, kind: 'price', id: 'coingecko#2' },
    ]);
    assert.deepEqual(
      values('errors').find((entry) => entry.stage === 'quotes'),
      { value: 3, stage: 'quotes' },
    );
    assert.ok(!actualCalls.some((call) => call.startsWith('create')));
  });

  test('an account missing in Actual fails alone', async () => {
    const base = config();
    const { code, calls, values } = await runWith({
      config: {
        ...base,
        accounts: [
          ...base.accounts,
          { name: 'Gone', chain: 'tron', token: TRX, wallets: [{ address: TRON_WALLET }] },
        ],
      },
    });
    assert.equal(code, 1);
    assert.equal(calls.filter((call) => call.startsWith('create')).length, 3);
    assert.deepEqual(
      values('errors').find((entry) => entry.stage === 'account'),
      { value: 1, stage: 'account' },
    );
  });

  test('--debug logs each request with the wallet shortened and no query string', async () => {
    const fetching: Explorer = {
      ...explorer('trongrid', []),
      getBalances: async ({ wallet, tokens, fetch }) => {
        await fetch(`http://explorer.test/v1/accounts/${wallet.address}?key=secret-key`);
        return new Map(tokens.map((token) => [token.symbol, RAW[token.symbol] ?? 0n]));
      },
    };
    const fetch = (async () => new Response('{}', { status: 200 })) as typeof globalThis.fetch;
    const { code, entries } = await runWith({
      config: config({ tronExplorers: [fetching] }),
      fetch,
    });
    assert.equal(code, 0);
    const request = entries().find((entry) => entry.level === 'debug');
    assert.equal(request?.msg, 'GET http://explorer.test/v1/accounts/TC9F...R2MJ');
    assert.equal(request?.status, 200);
    const everything = JSON.stringify(entries());
    assert.ok(!everything.includes(TRON_WALLET));
    assert.ok(!everything.includes('secret-key'));
  });

  test('an invalid config exits 1 with the config error and calls nothing', async () => {
    const calls: string[] = [];
    let opened = false;
    const { code, entries, values } = await runWith({
      config: () => {
        calls.push('read');
        throw new ConfigError('accounts[0].token', '"XYZ" isn\'t built in on tron');
      },
      openActual: async () => {
        opened = true;
        throw new Error('not called');
      },
    });
    assert.equal(code, 1);
    assert.equal(opened, false);
    const error = entries().find((entry) => entry.level === 'error');
    assert.equal(error?.msg, 'accounts[0].token: "XYZ" isn\'t built in on tron');
    assert.deepEqual(
      values('errors').find((entry) => entry.stage === 'config'),
      { value: 1, stage: 'config' },
    );
    assert.equal(values('lastRun').length, 1);
  });

  test('a rejected login exits 1 before any explorer or provider is called', async () => {
    const calls: string[] = [];
    const { code, values, entries } = await runWith({
      config: config({
        tronExplorers: [explorer('trongrid', calls)],
        bitcoinExplorers: [explorer('mempool-space', calls)],
        priceProvider: provider(calls),
      }),
      openActual: (open) =>
        openBudget(fakeApiFailingInit(new Error('Authentication failed'), 'token-expired'), open),
    });
    assert.equal(code, 1);
    assert.deepEqual(calls, []);
    assert.deepEqual(
      values('errors').find((entry) => entry.stage === 'actual'),
      { value: 1, stage: 'actual' },
    );
    assert.ok(
      entries().some(
        (entry) =>
          entry.msg ===
          'session token rejected or expired; log in again and replace it (docs/authentication.md)',
      ),
    );
  });
});

/** A fake `@actual-app/api` whose `init` fails with `error` and `code`. */
function fakeApiFailingInit(error: Error, code: string): ActualApi {
  const unused = async () => {
    throw new Error('not called');
  };
  return {
    init: async () => {
      throw Object.assign(error, { code });
    },
    downloadBudget: unused,
    getAccounts: unused,
    q: () => {
      throw new Error('not called');
    },
    aqlQuery: unused,
    getAccountBalance: unused,
    addTransactions: unused,
    updateTransaction: unused,
    deleteTransaction: unused,
    sync: unused,
    shutdown: async () => {},
  };
}

describe('secrets', () => {
  const SECRET = 'SeCrEt-value-that-must-not-leak';
  const auths: ActualAuth[] = [
    { kind: 'session', token: SECRET },
    { kind: 'password', password: SECRET },
    { kind: 'apiKey', key: SECRET },
  ];
  for (const [auth, format] of auths.flatMap((a) => LOG_FORMATS.map((f) => [a, f] as const))) {
    test(`a failing ${auth.kind} login never shows the secret in ${format} logs`, async () => {
      const spanExporter = new InMemorySpanExporter();
      const telemetry = startTelemetry({ env: {}, spanExporter, instrumentFetch: false });
      const written: string[] = [];
      const log = createLog({ debug: true, format, write: (line) => written.push(line) });
      // Anything else written to stdout or stderr during the run.
      const stdoutWrite = process.stdout.write;
      const stderrWrite = process.stderr.write;
      const capture = (chunk: unknown) => {
        written.push(String(chunk));
        return true;
      };
      process.stdout.write = capture as typeof process.stdout.write;
      process.stderr.write = capture as typeof process.stderr.write;
      let code: number;
      try {
        code = await run({
          readConfig: () => config({ auth }),
          openActual: (open) =>
            openBudget(
              fakeApiFailingInit(
                new Error(`Authentication failed for ${SECRET}`, { cause: SECRET }),
                `code ${SECRET}`,
              ),
              open,
            ),
          fetch: noFetch,
          telemetry,
          log,
          now: () => NOW,
          dryRun: false,
          dataDir: '/cache',
        });
      } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
      }
      const spans = spanExporter.getFinishedSpans();
      await telemetry.shutdown();
      assert.equal(code, 1);
      assert.ok(written.length > 0);
      assert.ok(!written.join('').includes(SECRET));
      assert.ok(spans.length > 0);
      const exported = JSON.stringify(
        spans.map((span) => [span.name, span.attributes, span.events, span.status]),
      );
      assert.ok(!exported.includes(SECRET));
    });
  }
});

describe('main', () => {
  test('an unknown LOG_FORMAT exits 1 with a text error, before reading the config', async () => {
    const written: string[] = [];
    const stdoutWrite = process.stdout.write;
    process.stdout.write = ((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    let code: number;
    try {
      code = await main(['--config', '/nonexistent/config.yml'], { LOG_FORMAT: 'xml' });
    } finally {
      process.stdout.write = stdoutWrite;
    }
    assert.equal(code, 1);
    assert.equal(written.length, 1);
    assert.match(
      written[0] ?? '',
      /^\S+ ERROR LOG_FORMAT: use text or json, not "xml" stage=config\n$/,
    );
  });
});
