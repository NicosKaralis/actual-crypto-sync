// End to end: the tool against a real Actual server and the mock explorers and
// price provider (mock.ts). Run it with `npm run test:e2e`, which starts the
// throwaway stack in test/e2e/compose.yml; it never runs with `npm test`.
//
// The tests call run() from src/main.ts with the same wiring as the CLI, but
// with their own clock, so they can sync on several days. One test runs the
// real CLI.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env as processEnv } from 'node:process';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';

import { ACCOUNTS, seedBudget } from '../../dev/seed.ts';
import { type ActualApi, openBudget, prepareDataDir } from '../../src/actual.ts';
import { loadConfig } from '../../src/config.ts';
import { parseNote } from '../../src/format.ts';
import { createLog } from '../../src/log.ts';
import { run } from '../../src/main.ts';
import { startTelemetry } from '../../src/telemetry.ts';
import { type Mock, startMock } from './mock.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONFIG = join(ROOT, 'test/e2e/config.yml');
// Required, so the tests never write to another server, such as the dev stack.
const SERVER_URL = processEnv.ACTUAL_SERVER_URL ?? '';
const PASSWORD = 'e2e-password';

// 09:00 local time on three days in a row.
const DAY1 = new Date(2026, 10, 20, 9);
const DAY2 = new Date(2026, 10, 21, 9);
const DAY3 = new Date(2026, 10, 22, 9);

const api: ActualApi = await import('@actual-app/api');

interface Tx {
  date: string;
  amount: number;
  notes: string;
  cleared: boolean;
  imported_payee: string;
}
type Entry = Record<string, unknown>;

let mock: Mock;
let env: Record<string, string>;

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'e2e-'));
}

/** One sync, wired as main() wires it, with the test's clock and env. */
async function sync({
  now,
  dryRun = false,
  extraEnv = {},
  editConfig = (text: string) => text,
}: {
  now: Date;
  dryRun?: boolean;
  extraEnv?: Record<string, string>;
  editConfig?: (text: string) => string;
}): Promise<{ code: number; entries: Entry[]; output: string }> {
  const lines: string[] = [];
  const log = createLog({ format: 'json', write: (line) => lines.push(line) });
  const telemetry = startTelemetry({
    env: {},
    spanExporter: new InMemorySpanExporter(),
    instrumentFetch: false,
  });
  try {
    const code = await run({
      readConfig: () =>
        loadConfig(editConfig(readFileSync(CONFIG, 'utf8')), { ...env, ...extraEnv }),
      openActual: async (options) => {
        prepareDataDir(options.dataDir);
        return openBudget(api, options);
      },
      fetch: globalThis.fetch,
      telemetry,
      log,
      now: () => now,
      dryRun,
      dataDir: freshDir(),
    });
    return {
      code,
      entries: lines.map((line) => JSON.parse(line) as Entry),
      output: lines.join(''),
    };
  } finally {
    await telemetry.shutdown();
  }
}

/** Every transaction in the budget, by account name, oldest first. */
async function budget(): Promise<Map<string, Tx[]>> {
  await api.init({
    serverURL: SERVER_URL,
    dataDir: freshDir(),
    password: PASSWORD,
    verbose: false,
  });
  try {
    await api.downloadBudget(env.ACTUAL_BUDGET_SYNC_ID ?? '', {});
    const byAccount = new Map<string, Tx[]>();
    for (const account of await api.getAccounts()) {
      const result = await api.aqlQuery(
        api
          .q('transactions')
          .filter({ account: account.id })
          .select(['date', 'amount', 'notes', 'cleared', 'imported_payee']),
      );
      const rows = (result as { data: Tx[] }).data;
      byAccount.set(
        account.name,
        rows.sort((a, b) => a.date.localeCompare(b.date)),
      );
    }
    return byAccount;
  } finally {
    await api.shutdown();
  }
}

function messages(entries: Entry[], msg: string): Entry[] {
  return entries.filter((entry) => entry.msg === msg);
}

/** The value_cents each account was synced to, from the run's log. */
function valueCents(entries: Entry[]): Map<string, number> {
  return new Map(
    entries
      .filter((e) => e.msg === 'created a transaction' || e.msg === 'updated a transaction')
      .map((e) => [String(e.account), Number(e.value_cents)]),
  );
}

function total(txs: Tx[]): number {
  return txs.reduce((sum, tx) => sum + tx.amount, 0);
}

describe('e2e', () => {
  before(async () => {
    assert.ok(SERVER_URL, 'set ACTUAL_SERVER_URL; run the e2e tests with npm run test:e2e');
    mock = await startMock();
    const { syncId, token } = await seedBudget({
      serverURL: SERVER_URL,
      password: PASSWORD,
      dataDir: freshDir(),
    });
    env = {
      ACTUAL_SERVER_URL: SERVER_URL,
      ACTUAL_BUDGET_SYNC_ID: syncId,
      ACTUAL_SESSION_TOKEN: token,
      ACTUAL_PASSWORD: PASSWORD,
      MOCK_URL: mock.url,
    };
  });

  after(async () => {
    await mock?.close();
  });

  test('the first run creates one uncleared transaction per account', async () => {
    const { code, entries } = await sync({ now: DAY1 });
    assert.equal(code, 0);
    assert.equal(messages(entries, 'created a transaction').length, ACCOUNTS.length);

    const values = valueCents(entries);
    const accounts = await budget();
    for (const name of ACCOUNTS) {
      const txs = accounts.get(name) ?? [];
      assert.equal(txs.length, 1, name);
      const [tx] = txs;
      assert.equal(tx?.date, '2026-11-20', name);
      assert.equal(tx?.cleared, false, name);
      assert.equal(tx?.imported_payee, 'AutoImporter', name);
      assert.ok(parseNote(tx?.notes ?? null), `${name}: a sync note`);
      assert.equal(tx?.amount, values.get(name), `${name}: the account shows the wallet's value`);
    }
    assert.equal(
      accounts.get('TRON: USDT')?.[0]?.notes,
      '0.828961 USDT (Δ +0.828961 @ 0.9041 EUR/USDT, 0.75 EUR)',
    );
  });

  test('a second run on the same day updates them', async () => {
    const before = await budget();
    const { code, entries } = await sync({ now: DAY1 });
    assert.equal(code, 0);
    assert.equal(messages(entries, 'created a transaction').length, 0);
    assert.equal(messages(entries, 'updated a transaction').length, ACCOUNTS.length);
    assert.deepEqual(await budget(), before);
  });

  test("the next day clears yesterday's transaction and writes the change", async () => {
    mock.state.extraSun = 10_000_000; // 10 TRX more
    const { code, entries } = await sync({ now: DAY2 });
    assert.equal(code, 0);
    assert.equal(messages(entries, 'created a transaction').length, ACCOUNTS.length);

    const values = valueCents(entries);
    const accounts = await budget();
    for (const name of ACCOUNTS) {
      const txs = accounts.get(name) ?? [];
      assert.deepEqual(
        txs.map((tx) => [tx.date, tx.cleared]),
        [
          ['2026-11-20', true],
          ['2026-11-21', false],
        ],
        name,
      );
      assert.equal(total(txs), values.get(name), `${name}: the account shows the wallet's value`);
    }
    const [first, second] = accounts.get('TRON: TRX') ?? [];
    const change =
      (parseNote(second?.notes ?? null)?.balance ?? 0) -
      (parseNote(first?.notes ?? null)?.balance ?? 0);
    assert.equal(Math.round(change * 1e6) / 1e6, 10);
    assert.match(second?.notes ?? '', /\(Δ \+10 @ /);
    assert.equal(accounts.get('TRON: USDT')?.[1]?.amount, 0, 'no change, no amount');
  });

  test('a price provider failure exits 1 and changes nothing', async () => {
    const before = await budget();
    mock.state.coingeckoStatus = 429;
    try {
      const { code, entries } = await sync({ now: DAY3 });
      assert.equal(code, 1);
      assert.ok(
        entries.some(
          (e) => e.level === 'error' && String(e.msg).includes('no price from any provider'),
        ),
      );
    } finally {
      mock.state.coingeckoStatus = null;
    }
    assert.deepEqual(await budget(), before);
  });

  test('--dry-run reads everything and writes nothing', async () => {
    const before = await budget();
    const { code, entries } = await sync({ now: DAY3, dryRun: true });
    assert.equal(code, 0);
    assert.equal(messages(entries, 'dry run: would create a transaction').length, ACCOUNTS.length);
    assert.deepEqual(await budget(), before);
  });

  test('a password login syncs too', async () => {
    const { code, entries } = await sync({
      now: DAY2,
      editConfig: (text) =>
        text.replace('session: ${ACTUAL_SESSION_TOKEN}', 'password: ${ACTUAL_PASSWORD}'),
    });
    assert.equal(code, 0);
    assert.equal(messages(entries, 'updated a transaction').length, ACCOUNTS.length);
  });

  test('a made-up session token exits 1, writes nothing and never shows the token', async () => {
    const before = await budget();
    const token = 'e2e-made-up-session-token';
    const { code, entries, output } = await sync({
      now: DAY3,
      extraEnv: { ACTUAL_SESSION_TOKEN: token },
    });
    assert.equal(code, 1);
    assert.ok(
      entries.some((e) => e.level === 'error' && String(e.msg).includes('session token rejected')),
      output,
    );
    assert.ok(!output.includes(token));
    assert.deepEqual(await budget(), before);
  });

  test.todo('an API key login syncs too (needs an Actual server with API keys; 26.11.0 has none)');

  test('the CLI runs a dry run, logs text and exits 0', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['src/main.ts', '--config', CONFIG, '--dry-run'],
      { cwd: ROOT, env: { ...processEnv, ...env, ACTUAL_DATA_DIR: freshDir(), LOG_FORMAT: '' } },
    );
    const lines = stdout.trim().split('\n');
    assert.equal(
      lines.filter((line) => line.includes(' INFO  dry run: would ')).length,
      ACCOUNTS.length,
    );
  });
});
