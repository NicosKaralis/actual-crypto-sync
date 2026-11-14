import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import {
  type ActualApi,
  type AqlQuery,
  LOOKBACK_TRANSACTIONS,
  type OpenBudgetOptions,
  openBudget,
  prepareDataDir,
} from '../src/actual.ts';
import type { ActualAuth } from '../src/config.ts';

const SECRET = 'hunter2-very-secret-value';

interface ApiCall {
  method: string;
  args: unknown[];
}

/** A query builder recording each step, as `q('transactions')` gives. */
function fakeQuery(table: string, steps: unknown[][] = [[`q ${table}`]]): AqlQuery {
  const next = (step: unknown[]) => fakeQuery(table, [...steps, step]);
  return {
    filter: (expr) => next(['filter', expr]),
    select: (fields) => next(['select', fields]),
    orderBy: (order) => next(['orderBy', order]),
    limit: (n) => next(['limit', n]),
    steps,
  } as AqlQuery & { steps: unknown[][] };
}

/** A fake `@actual-app/api`; `override` replaces single methods, e.g. a failing `init`. */
function fakeApi(override: Partial<ActualApi> = {}, data: { rows?: unknown[][] } = {}) {
  const calls: ApiCall[] = [];
  const rows = [...(data.rows ?? [[], []])];
  const record =
    <T>(method: string, result: T) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      return result;
    };
  const api: ActualApi = {
    init: record('init', {}),
    downloadBudget: record('downloadBudget', undefined),
    getAccounts: record('getAccounts', [
      { id: 'acc-trx', name: 'TRX', offbudget: true, closed: false },
      { id: 'acc-checking', name: 'Checking', offbudget: false, closed: false },
      { id: 'acc-old', name: 'Old', offbudget: true, closed: true },
    ]),
    q: (table) => fakeQuery(table),
    aqlQuery: async (query) => {
      calls.push({ method: 'aqlQuery', args: [(query as AqlQuery & { steps: unknown }).steps] });
      return { data: rows.shift() ?? [] };
    },
    getAccountBalance: record('getAccountBalance', 12345),
    addTransactions: record('addTransactions', 'ok'),
    updateTransaction: record('updateTransaction', []),
    deleteTransaction: record('deleteTransaction', []),
    sync: record('sync', undefined),
    shutdown: record('shutdown', undefined),
    ...override,
  };
  return { api, calls };
}

function options(auth: ActualAuth, extra: Partial<OpenBudgetOptions> = {}): OpenBudgetOptions {
  return {
    serverURL: 'http://actual:5006',
    auth,
    syncId: 'budget-sync-id',
    dataDir: '/cache',
    ...extra,
  };
}

/** An error the way @actual-app/api throws one: a message and a `code`. */
function apiError(message: string, code?: string): Error {
  return Object.assign(new Error(message), code === undefined ? {} : { code });
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }
  assert.fail('expected a rejection');
}

describe('openBudget', () => {
  test('session: init with the token as sessionToken, then download the budget', async () => {
    const { api, calls } = fakeApi();
    await openBudget(api, options({ kind: 'session', token: SECRET }));
    assert.deepEqual(calls, [
      {
        method: 'init',
        args: [
          {
            serverURL: 'http://actual:5006',
            dataDir: '/cache',
            sessionToken: SECRET,
            verbose: false,
          },
        ],
      },
      { method: 'downloadBudget', args: ['budget-sync-id', { password: undefined }] },
    ]);
  });

  test('password: init with password', async () => {
    const { api, calls } = fakeApi();
    await openBudget(api, options({ kind: 'password', password: SECRET }));
    assert.deepEqual(calls[0]?.args, [
      { serverURL: 'http://actual:5006', dataDir: '/cache', password: SECRET, verbose: false },
    ]);
  });

  test('api key: init with the key as sessionToken', async () => {
    const { api, calls } = fakeApi();
    await openBudget(api, options({ kind: 'apiKey', key: SECRET }));
    assert.deepEqual(calls[0]?.args, [
      { serverURL: 'http://actual:5006', dataDir: '/cache', sessionToken: SECRET, verbose: false },
    ]);
  });

  test('encryption_password goes to downloadBudget', async () => {
    const { api, calls } = fakeApi();
    await openBudget(
      api,
      options({ kind: 'session', token: 'x' }, { encryptionPassword: 'budget-key' }),
    );
    assert.deepEqual(calls[1]?.args, ['budget-sync-id', { password: 'budget-key' }]);
  });

  const initErrors: [string, ActualAuth, Error, string][] = [
    [
      'an expired session',
      { kind: 'session', token: SECRET },
      apiError(
        `Authentication failed: invalid or expired session token ${SECRET}`,
        'token-expired',
      ),
      'session token rejected or expired; log in again and replace it (docs/authentication.md)',
    ],
    [
      'a wrong password',
      { kind: 'password', password: SECRET },
      apiError(`Authentication failed: invalid-password ${SECRET}`, 'invalid-password'),
      'password rejected (docs/authentication.md)',
    ],
    [
      'a password on a server that started with OpenID',
      { kind: 'password', password: SECRET },
      apiError('Authentication failed: user-not-found', 'user-not-found'),
      "password login isn't available on this server (it may use OpenID only); use auth.session (docs/authentication.md)",
    ],
    [
      'a password on a server that allows only OpenID',
      { kind: 'password', password: SECRET },
      apiError('Authentication failed: Invalid redirect URL', 'Invalid redirect URL'),
      "password login isn't available on this server (it may use OpenID only); use auth.session (docs/authentication.md)",
    ],
    [
      'a rejected API key',
      { kind: 'apiKey', key: SECRET },
      apiError('Authentication failed: invalid or expired session token', 'token-expired'),
      'API key rejected; it may be revoked, or the server may be older than API keys (26.11.0 has none) (docs/authentication.md)',
    ],
    [
      'a server it cannot reach',
      { kind: 'session', token: SECRET },
      apiError('Authentication failed: server offline or unreachable', 'network-failure'),
      "can't reach the Actual server at http://actual:5006 (docs/authentication.md)",
    ],
    [
      'a password login that cannot reach the server',
      { kind: 'password', password: SECRET },
      apiError('Authentication failed: network-failure', 'network-failure'),
      "can't reach the Actual server at http://actual:5006 (docs/authentication.md)",
    ],
    [
      'any other error',
      { kind: 'session', token: SECRET },
      apiError(`something odd with ${SECRET}`, 'odd-thing'),
      'login failed (odd-thing) (docs/authentication.md)',
    ],
    [
      'an error with no code',
      { kind: 'session', token: SECRET },
      apiError(`something odd with ${SECRET}`),
      'login failed (unknown error) (docs/authentication.md)',
    ],
    [
      'a code that could carry text',
      { kind: 'session', token: SECRET },
      apiError('x', `bad ${SECRET}`),
      'login failed (unknown error) (docs/authentication.md)',
    ],
  ];
  for (const [name, auth, error, message] of initErrors) {
    test(`init failing: ${name}`, async () => {
      const { api, calls } = fakeApi({
        init: async () => {
          throw error;
        },
      });
      const thrown = await rejection(openBudget(api, options(auth)));
      assert.equal(thrown.message, message);
      assert.ok(!JSON.stringify({ ...thrown, message: thrown.message }).includes(SECRET));
      assert.ok(!String(thrown.stack).includes(SECRET));
      assert.equal(thrown.cause, undefined);
      // Nothing downloaded after a failed login.
      assert.ok(!calls.some((call) => call.method === 'downloadBudget'));
    });
  }

  test('a budget the user has no access to', async () => {
    const { api } = fakeApi({
      downloadBudget: async () => {
        throw apiError('Budget "budget-sync-id" not found. Check the sync id', 'budget-not-found');
      },
    });
    const thrown = await rejection(openBudget(api, options({ kind: 'session', token: 'x' })));
    assert.equal(
      thrown.message,
      'budget budget-sync-id not found or not shared with this user (docs/authentication.md)',
    );
  });

  test('another download error keeps only its code', async () => {
    const { api, calls } = fakeApi({
      downloadBudget: async () => {
        throw apiError(`decrypt failed for ${SECRET}`, 'decrypt-failure');
      },
    });
    const thrown = await rejection(openBudget(api, options({ kind: 'session', token: 'x' })));
    assert.equal(thrown.message, "can't download budget budget-sync-id (decrypt-failure)");
    // The engine is shut down so the process can exit.
    assert.ok(calls.some((call) => call.method === 'shutdown'));
  });
});

async function opened(data: { rows?: unknown[][] } = {}, override: Partial<ActualApi> = {}) {
  const { api, calls } = fakeApi(override, data);
  const actual = await openBudget(api, options({ kind: 'session', token: 'x' }));
  calls.length = 0;
  return { actual, calls };
}

describe('the opened budget', () => {
  test('findAccount by name or id, only open off-budget accounts', async () => {
    const { actual } = await opened();
    assert.deepEqual(await actual.findAccount('TRX'), { id: 'acc-trx', name: 'TRX' });
    assert.deepEqual(await actual.findAccount('acc-trx'), { id: 'acc-trx', name: 'TRX' });
    await assert.rejects(actual.findAccount('Nope'), { message: 'account "Nope" not found' });
    await assert.rejects(actual.findAccount('Old'), { message: 'account "Old" is closed' });
    await assert.rejects(actual.findAccount('Checking'), {
      message: 'account "Checking" is on budget; only off-budget accounts are synced',
    });
  });

  test("transactionsForPlan: today's, and the last N before today", async () => {
    const today = {
      id: 'b',
      date: '2026-11-12',
      amount: 100,
      notes: 'x',
      cleared: true,
      reconciled: true,
    };
    const before = {
      id: 'a',
      date: '2026-11-10',
      amount: -5,
      notes: null,
      cleared: true,
      reconciled: false,
    };
    const { actual, calls } = await opened({ rows: [[today], [before]] });
    const txs = await actual.transactionsForPlan('acc-trx', '2026-11-12');
    assert.deepEqual(txs, [today, before]);
    const fields = ['id', 'date', 'amount', 'notes', 'cleared', 'reconciled'];
    const order = [{ date: 'desc' }, 'id'];
    assert.deepEqual(
      calls.map((call) => call.args[0]),
      [
        [
          ['q transactions'],
          ['filter', { account: 'acc-trx', date: '2026-11-12' }],
          ['select', fields],
          ['orderBy', order],
        ],
        [
          ['q transactions'],
          ['filter', { account: 'acc-trx', date: { $lt: '2026-11-12' } }],
          ['select', fields],
          ['orderBy', order],
          ['limit', LOOKBACK_TRANSACTIONS],
        ],
      ],
    );
    assert.equal(LOOKBACK_TRANSACTIONS, 50);
  });

  test('transactionsForPlan rejects rows of the wrong shape', async () => {
    const row = { id: 'a', date: '2026-11-12', amount: 1, notes: null, cleared: true };
    for (const bad of [{ id: 'a', date: 5 }, row, { ...row, reconciled: 1 }]) {
      const { actual } = await opened({ rows: [[bad], []] });
      await assert.rejects(actual.transactionsForPlan('acc-trx', '2026-11-12'), {
        message: 'Actual returned a transaction of an unexpected shape',
      });
    }
  });

  test('balanceThrough asks for the balance through that local date', async () => {
    const { actual, calls } = await opened();
    assert.equal(await actual.balanceThrough('acc-trx', '2026-03-29'), 12345);
    const [id, cutoff] = calls[0]?.args ?? [];
    assert.equal(id, 'acc-trx');
    assert.ok(cutoff instanceof Date);
    // Local noon, clear of DST changes at midnight.
    assert.deepEqual(
      [cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), cutoff.getHours()],
      [2026, 2, 29, 12],
    );
  });

  test('createTransaction writes one uncleared AutoImporter transaction', async () => {
    const { actual, calls } = await opened();
    await actual.createTransaction('acc-trx', { date: '2026-11-12', amount: 4661, notes: 'n' });
    assert.deepEqual(calls, [
      {
        method: 'addTransactions',
        args: [
          'acc-trx',
          [
            {
              date: '2026-11-12',
              amount: 4661,
              notes: 'n',
              payee_name: 'AutoImporter',
              imported_payee: 'AutoImporter',
              cleared: false,
            },
          ],
          { learnCategories: false, runTransfers: false },
        ],
      },
    ]);
  });

  test('update, clear and delete', async () => {
    const { actual, calls } = await opened();
    await actual.updateTransaction('t1', { amount: 5, notes: 'n' });
    await actual.clearTransaction('t2');
    await actual.deleteTransaction('t3');
    assert.deepEqual(calls, [
      { method: 'updateTransaction', args: ['t1', { amount: 5, notes: 'n', cleared: false }] },
      { method: 'updateTransaction', args: ['t2', { cleared: true }] },
      { method: 'deleteTransaction', args: ['t3'] },
    ]);
  });

  test('close syncs, then shuts down; without sync it only shuts down', async () => {
    const first = await opened();
    await first.actual.close({ sync: true });
    assert.deepEqual(
      first.calls.map((call) => call.method),
      ['sync', 'shutdown'],
    );
    const second = await opened();
    await second.actual.close({ sync: false });
    assert.deepEqual(
      second.calls.map((call) => call.method),
      ['shutdown'],
    );
  });

  test('a failing call keeps only its code', async () => {
    const { actual } = await opened(
      {},
      {
        addTransactions: async () => {
          throw apiError(`write failed ${SECRET}`, 'sync-error');
        },
        sync: async () => {
          throw apiError(`sync failed ${SECRET}`);
        },
      },
    );
    const created = await rejection(
      actual.createTransaction('acc-trx', { date: '2026-11-12', amount: 1, notes: 'n' }),
    );
    assert.equal(created.message, 'Actual: addTransactions failed (sync-error)');
    const closed = await rejection(actual.close({ sync: true }));
    assert.equal(closed.message, 'Actual: sync failed (unknown error)');
    assert.ok(!String(created.stack).includes(SECRET));
  });
});

describe('prepareDataDir', () => {
  const withTempDir = (fn: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'actual-crypto-sync-'));
    try {
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test('creates a missing directory, parents included', () => {
    withTempDir((dir) => {
      const dataDir = join(dir, 'a', 'b');
      prepareDataDir(dataDir);
      assert.ok(statSync(dataDir).isDirectory());
    });
  });

  test('accepts a directory that exists', () => {
    withTempDir((dir) => prepareDataDir(dir));
  });

  test("a path it can't create names it, the error code and ACTUAL_DATA_DIR", () => {
    withTempDir((dir) => {
      const file = join(dir, 'file');
      writeFileSync(file, '');
      const dataDir = join(file, 'cache');
      assert.throws(() => prepareDataDir(dataDir), {
        name: 'ActualError',
        code: 'ENOTDIR',
        message: `can't use the data directory ${dataDir} (ENOTDIR); set ACTUAL_DATA_DIR to a writable directory`,
      });
    });
  });
});
