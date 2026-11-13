// Seeds the dev Actual server (dev/compose.yml): sets its password, creates a
// `Dev` budget with the off-budget accounts dev/config.yml names, and prints
// the sync id and a session token to put in dev/.env.
//
// `--cutoff-check` instead checks, against the real server, what src/actual.ts
// assumes about Actual (C18): which transactions balanceThrough counts, and
// which transactionsForPlan returns, in what order.
//
// The e2e tests (test/e2e/) seed their own server with seedBudget.
//
// npm run dev:seed [-- --cutoff-check]
import { mkdirSync } from 'node:fs';
import { argv, env, exit, stderr, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

import * as api from '@actual-app/api';

import { LOOKBACK_TRANSACTIONS, openBudget } from '../src/actual.ts';

const SERVER_URL = env.ACTUAL_SERVER_URL || 'http://localhost:5006';
const BUDGET = 'Dev';
// The names dev/config.yml, dev/config.password.yml and test/e2e/config.yml use.
export const ACCOUNTS = ['TRON: TRX', 'TRON: USDT', 'Bitcoin'];
const SCRATCH_ACCOUNT = 'Cutoff check';

class SeedError extends Error {}

function required(name: string): string {
  const value = env[name];
  if (!value) {
    throw new SeedError(`${name} is not set; copy dev/.env.example to dev/.env and fill it in`);
  }
  return value;
}

async function post(serverURL: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${serverURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: unknown = await response.json();
  if (!response.ok || !isObject(json) || json.status !== 'ok') {
    const reason =
      isObject(json) && typeof json.reason === 'string' ? json.reason : response.status;
    throw new SeedError(`POST ${path} failed (${reason})`);
  }
  return json.data;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Sets the server password on a new server; on one already set up, does nothing. */
async function bootstrap(serverURL: string, password: string): Promise<void> {
  const response = await fetch(`${serverURL}/account/needs-bootstrap`);
  const json: unknown = await response.json();
  const data = isObject(json) ? json.data : undefined;
  if (isObject(data) && data.bootstrapped === false) {
    await post(serverURL, '/account/bootstrap', { password });
  }
}

/** A session token, the same as a login from the web client gives. */
async function login(serverURL: string, password: string): Promise<string> {
  const data = await post(serverURL, '/account/login', { loginMethod: 'password', password });
  if (!isObject(data) || typeof data.token !== 'string') {
    throw new SeedError('POST /account/login returned no token');
  }
  return data.token;
}

/** The `Dev` budget's sync id, creating and uploading the budget when the server has none. */
async function devBudget(): Promise<string> {
  const existing = (await api.getBudgets()).find((b) => b.name === BUDGET && b.groupId);
  if (existing?.groupId) {
    return existing.groupId;
  }
  // runImport creates a local budget, runs this, then uploads it. It also
  // removes the default categories, which off-budget accounts don't need.
  await api.runImport(BUDGET, async () => {
    for (const name of ACCOUNTS) {
      await api.createAccount({ name, offbudget: true }, 0);
    }
  });
  // runImport only logs a failed upload, so check the server has it.
  const created = (await api.getBudgets()).find((b) => b.name === BUDGET && b.state === 'remote');
  if (!created?.groupId) {
    throw new SeedError(`budget "${BUDGET}" was created but not uploaded`);
  }
  return created.groupId;
}

/**
 * Sets the server password on a new server, makes sure it has the `Dev` budget
 * with the off-budget ACCOUNTS, and returns its sync id and a session token.
 */
export async function seedBudget({
  serverURL,
  password,
  dataDir,
}: {
  serverURL: string;
  password: string;
  dataDir: string;
}): Promise<{ syncId: string; token: string }> {
  await bootstrap(serverURL, password);
  const token = await login(serverURL, password);
  await api.init({ serverURL, dataDir, password, verbose: false });
  try {
    return { syncId: await devBudget(), token };
  } finally {
    await api.shutdown();
  }
}

async function seed(password: string, dataDir: string): Promise<void> {
  const { syncId, token } = await seedBudget({ serverURL: SERVER_URL, password, dataDir });
  stdout.write(`Budget "${BUDGET}" is ready, with the accounts ${ACCOUNTS.join(', ')}.\n`);
  stdout.write(
    `\nPut these in dev/.env:\nACTUAL_BUDGET_SYNC_ID=${syncId}\nACTUAL_SESSION_TOKEN=${token}\n`,
  );
}

/** YYYY-MM-DD in local time (TZ), `offset` days from today, as main.ts dates a run. */
function day(offset: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Fills a fresh scratch account and checks balanceThrough and
 * transactionsForPlan against what the plan expects. Returns whether both match.
 */
async function cutoffCheck(password: string, dataDir: string, syncId: string): Promise<boolean> {
  const actual = await openBudget(api, {
    serverURL: SERVER_URL,
    auth: { kind: 'password', password },
    syncId,
    dataDir,
  });
  let ok = false;
  try {
    for (const account of await api.getAccounts()) {
      if (account.name === SCRATCH_ACCOUNT) {
        await api.deleteAccount(account.id);
      }
    }
    const accountId = await api.createAccount({ name: SCRATCH_ACCOUNT, offbudget: true }, 0);

    // Two on each of the four days, so the order within a day is checked too,
    // and enough older ones that the lookback limit cuts some off.
    const amounts: [string, number][] = [
      [day(-2), 1_000],
      [day(-2), 2_000],
      [day(-1), 10_000],
      [day(-1), 20_000],
      [day(0), 100_000],
      [day(0), 200_000],
      [day(1), 1_000_000],
      [day(1), 2_000_000],
    ];
    for (let i = 3; i < 3 + LOOKBACK_TRANSACTIONS; i++) {
      amounts.push([day(-i), 1]);
    }
    await api.addTransactions(
      accountId,
      amounts.map(([date, amount]) => ({
        date,
        amount,
        payee_name: SCRATCH_ACCOUNT,
        notes: `${SCRATCH_ACCOUNT} ${date}`,
      })),
      { learnCategories: false, runTransfers: false },
    );

    const yesterday = day(-1);
    const today = day(0);
    const expectedBalance = amounts
      .filter(([date]) => date <= yesterday)
      .reduce((sum, [, amount]) => sum + amount, 0);
    const balance = await actual.balanceThrough(accountId, yesterday);
    const balanceOk = balance === expectedBalance;
    stdout.write(
      `balanceThrough(${yesterday}): ${balance}, expected ${expectedBalance} ${balanceOk ? 'OK' : 'MISMATCH'}\n`,
    );

    // Every row, ordered here rather than by Actual: date descending, then id ascending.
    const result = await api.aqlQuery(
      api.q('transactions').filter({ account: accountId }).select(['id', 'date']),
    );
    const rows = (isObject(result) && Array.isArray(result.data) ? result.data : []) as {
      id: string;
      date: string;
    }[];
    rows.sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? 1 : -1));
    const expected = [
      ...rows.filter((r) => r.date === today),
      ...rows.filter((r) => r.date < today).slice(0, LOOKBACK_TRANSACTIONS),
    ].map((r) => `${r.date} ${r.id}`);
    const got = (await actual.transactionsForPlan(accountId, today)).map(
      (t) => `${t.date} ${t.id}`,
    );
    const planOk = JSON.stringify(got) === JSON.stringify(expected);
    stdout.write(
      `transactionsForPlan(${today}): ${got.length} transactions, expected ${expected.length} ${planOk ? 'OK' : 'MISMATCH'}\n`,
    );
    if (!planOk) {
      stdout.write(`  got:      ${got.join(', ')}\n  expected: ${expected.join(', ')}\n`);
    }
    ok = balanceOk && planOk;
  } finally {
    await actual.close({ sync: true });
  }
  return ok;
}

async function main(args: readonly string[]): Promise<number> {
  const password = required('ACTUAL_PASSWORD');
  const dataDir = required('ACTUAL_DATA_DIR');
  mkdirSync(dataDir, { recursive: true });
  if (args.includes('--cutoff-check')) {
    return (await cutoffCheck(password, dataDir, required('ACTUAL_BUDGET_SYNC_ID'))) ? 0 : 1;
  }
  await seed(password, dataDir);
  return 0;
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  main(argv.slice(2)).then(exit, (error: unknown) => {
    stderr.write(`dev:seed: ${error instanceof Error ? error.message : String(error)}\n`);
    exit(1);
  });
}
