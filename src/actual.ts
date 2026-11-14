// The calls to Actual, through @actual-app/api. Its errors are rethrown with
// only their code: their messages can hold what was sent, secrets included.

import { accessSync, constants, mkdirSync } from 'node:fs';

import type { ActualAuth } from './config.ts';
import type { PlanTransaction } from './plan.ts';

/**
 * How many transactions before today are searched for the previous sync note
 * (C17), so a gap of more than a week between runs still finds it.
 */
export const LOOKBACK_TRANSACTIONS = 50;

const PAYEE = 'AutoImporter';
const DOCS = '(docs/authentication.md)';

/** An ActualQL query, as `q(table)` builds it. */
export interface AqlQuery {
  filter(expression: Record<string, unknown>): AqlQuery;
  select(fields: string[]): AqlQuery;
  orderBy(order: (string | Record<string, string>)[]): AqlQuery;
  limit(n: number): AqlQuery;
}

/** The part of `@actual-app/api` used here; the real module satisfies it (main.ts checks). */
export interface ActualApi {
  init(
    config: { serverURL: string; dataDir: string; verbose: boolean } & (
      | { password: string }
      | { sessionToken: string }
    ),
  ): Promise<unknown>;
  downloadBudget(syncId: string, options: { password?: string }): Promise<void>;
  getAccounts(): Promise<{ id: string; name: string; offbudget?: boolean; closed?: boolean }[]>;
  q(table: 'transactions'): AqlQuery;
  aqlQuery(query: AqlQuery): Promise<unknown>;
  getAccountBalance(id: string, cutoff: Date): Promise<number>;
  addTransactions(
    accountId: string,
    transactions: {
      date: string;
      amount: number;
      notes: string;
      payee_name: string;
      imported_payee: string;
      cleared: boolean;
    }[],
    options: { learnCategories: boolean; runTransfers: boolean },
  ): Promise<unknown>;
  updateTransaction(
    id: string,
    fields: { amount?: number; notes?: string; cleared?: boolean },
  ): Promise<unknown>;
  deleteTransaction(id: string): Promise<unknown>;
  sync(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface OpenBudgetOptions {
  serverURL: string;
  auth: ActualAuth;
  syncId: string;
  dataDir: string;
  encryptionPassword?: string;
}

/** An opened budget: what a run reads and writes. */
export interface Actual {
  /** An open, off-budget account by name or id. */
  findAccount(nameOrId: string): Promise<{ id: string; name: string }>;
  /** Every transaction dated `today`, and the last LOOKBACK_TRANSACTIONS before it. */
  transactionsForPlan(accountId: string, today: string): Promise<PlanTransaction[]>;
  /** The balance in cents of every transaction dated `date` (YYYY-MM-DD) or earlier. */
  balanceThrough(accountId: string, date: string): Promise<number>;
  createTransaction(
    accountId: string,
    tx: { date: string; amount: number; notes: string },
  ): Promise<void>;
  updateTransaction(id: string, fields: { amount: number; notes: string }): Promise<void>;
  clearTransaction(id: string): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  /** Syncs the changes to the server (unless `sync` is false), then stops the engine. */
  close(options: { sync: boolean }): Promise<void>;
}

/** An error from Actual, with only its code. */
export class ActualError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ActualError';
    this.code = code;
  }
}

/**
 * Creates the data directory when it's missing and checks it's writable.
 * @actual-app/api does neither: it fails the download with a filesystem error.
 */
export function prepareDataDir(dataDir: string): void {
  try {
    mkdirSync(dataDir, { recursive: true });
    accessSync(dataDir, constants.W_OK);
  } catch (error) {
    const raw = error instanceof Error && 'code' in error ? error.code : undefined;
    const code = typeof raw === 'string' && /^E[A-Z]{1,32}$/.test(raw) ? raw : undefined;
    throw new ActualError(
      `can't use the data directory ${dataDir} (${code ?? 'unknown error'}); set ACTUAL_DATA_DIR to a writable directory`,
      code,
    );
  }
}

/**
 * Logs in and downloads the budget. `init` checks the credentials before
 * anything is downloaded; each way it fails gets its own message, never with
 * the secret.
 */
export async function openBudget(api: ActualApi, options: OpenBudgetOptions): Promise<Actual> {
  const { serverURL, auth, syncId, dataDir, encryptionPassword } = options;
  const credentials =
    auth.kind === 'password' ? { password: auth.password } : { sessionToken: sessionToken(auth) };
  try {
    await api.init({ serverURL, dataDir, ...credentials, verbose: false });
  } catch (error) {
    await api.shutdown().catch(() => {});
    throw loginError(auth, serverURL, error);
  }
  try {
    await api.downloadBudget(syncId, { password: encryptionPassword });
  } catch (error) {
    await api.shutdown().catch(() => {});
    const code = errorCode(error);
    if (code === 'budget-not-found') {
      throw new ActualError(
        `budget ${syncId} not found or not shared with this user ${DOCS}`,
        code,
      );
    }
    throw new ActualError(`can't download budget ${syncId} (${code ?? 'unknown error'})`, code);
  }
  return opened(api);
}

function sessionToken(auth: Exclude<ActualAuth, { kind: 'password' }>): string {
  return auth.kind === 'session' ? auth.token : auth.key;
}

function loginError(auth: ActualAuth, serverURL: string, error: unknown): ActualError {
  const raw = error instanceof Error && 'code' in error ? error.code : undefined;
  // The server's answer when it falls back to the OpenID flow; not a slug.
  if (auth.kind === 'password' && (raw === 'Invalid redirect URL' || raw === 'user-not-found')) {
    return new ActualError(
      `password login isn't available on this server (it may use OpenID only); use auth.session ${DOCS}`,
      'user-not-found',
    );
  }
  const code = errorCode(error);
  if (code === 'network-failure') {
    return new ActualError(`can't reach the Actual server at ${serverURL} ${DOCS}`, code);
  }
  if (code === 'token-expired' && auth.kind === 'session') {
    return new ActualError(
      `session token rejected or expired; log in again and replace it ${DOCS}`,
      code,
    );
  }
  if (code === 'token-expired' && auth.kind === 'apiKey') {
    return new ActualError(
      `API key rejected; it may be revoked, or the server may be older than API keys (26.11.0 has none) ${DOCS}`,
      code,
    );
  }
  if (code === 'invalid-password' && auth.kind === 'password') {
    return new ActualError(`password rejected ${DOCS}`, code);
  }
  return new ActualError(`login failed (${code ?? 'unknown error'}) ${DOCS}`, code);
}

/** The error's code when it's a plain slug ('token-expired'); anything else could carry text. */
function errorCode(error: unknown): string | undefined {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[a-z0-9-]{1,64}$/.test(code) ? code : undefined;
}

/** Runs one call to the API, rethrowing its error with only its code. */
async function call<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const code = errorCode(error);
    throw new ActualError(`Actual: ${name} failed (${code ?? 'unknown error'})`, code);
  }
}

const PLAN_FIELDS = ['id', 'date', 'amount', 'notes', 'cleared', 'reconciled'];
// Newest first, then by id, the order planAccount sorts in too (C16).
const PLAN_ORDER = [{ date: 'desc' }, 'id'];

function opened(api: ActualApi): Actual {
  const query = async (filter: Record<string, unknown>, limit?: number) => {
    let q = api.q('transactions').filter(filter).select(PLAN_FIELDS).orderBy(PLAN_ORDER);
    if (limit !== undefined) {
      q = q.limit(limit);
    }
    return planTransactions(await call('aqlQuery', () => api.aqlQuery(q)));
  };

  return {
    findAccount: async (nameOrId) => {
      const accounts = await call('getAccounts', () => api.getAccounts());
      const account =
        accounts.find((a) => a.id === nameOrId) ?? accounts.find((a) => a.name === nameOrId);
      if (account === undefined) {
        throw new Error(`account "${nameOrId}" not found`);
      }
      if (account.closed) {
        throw new Error(`account "${nameOrId}" is closed`);
      }
      if (!account.offbudget) {
        throw new Error(`account "${nameOrId}" is on budget; only off-budget accounts are synced`);
      }
      return { id: account.id, name: account.name };
    },

    transactionsForPlan: async (accountId, today) => [
      ...(await query({ account: accountId, date: today })),
      ...(await query({ account: accountId, date: { $lt: today } }, LOOKBACK_TRANSACTIONS)),
    ],

    balanceThrough: async (accountId, date) => {
      // Inclusive in 26.11.0: `date <= cutoff`, with the cutoff formatted as a
      // local day (@actual-app/core server/accounts/app.ts, getAccountBalance).
      // Local noon, so a DST change at midnight can't move it to another day.
      const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
      const cutoff = new Date(year, month - 1, day, 12);
      return call('getAccountBalance', () => api.getAccountBalance(accountId, cutoff));
    },

    createTransaction: async (accountId, { date, amount, notes }) => {
      await call('addTransactions', () =>
        api.addTransactions(
          accountId,
          [{ date, amount, notes, payee_name: PAYEE, imported_payee: PAYEE, cleared: false }],
          { learnCategories: false, runTransfers: false },
        ),
      );
    },

    // Uncleared until the day is over; the next day's run clears it.
    updateTransaction: async (id, { amount, notes }) => {
      await call('updateTransaction', () =>
        api.updateTransaction(id, { amount, notes, cleared: false }),
      );
    },

    clearTransaction: async (id) => {
      await call('updateTransaction', () => api.updateTransaction(id, { cleared: true }));
    },

    deleteTransaction: async (id) => {
      await call('deleteTransaction', () => api.deleteTransaction(id));
    },

    close: async ({ sync }) => {
      try {
        if (sync) {
          await call('sync', () => api.sync());
        }
      } finally {
        await call('shutdown', () => api.shutdown());
      }
    },
  };
}

/**
 * The rows of an ActualQL result, checked:
 * `{ data: [{ id, date, amount, notes, cleared, reconciled }] }`.
 */
function planTransactions(result: unknown): PlanTransaction[] {
  const data =
    typeof result === 'object' && result !== null && 'data' in result ? result.data : undefined;
  if (!Array.isArray(data)) {
    throw new Error('Actual returned a query result of an unexpected shape');
  }
  return data.map((row: unknown) => {
    if (
      typeof row !== 'object' ||
      row === null ||
      !('id' in row && typeof row.id === 'string') ||
      !('date' in row && typeof row.date === 'string') ||
      !('amount' in row && Number.isSafeInteger(row.amount)) ||
      !('notes' in row && (row.notes === null || typeof row.notes === 'string')) ||
      !('cleared' in row && typeof row.cleared === 'boolean') ||
      !('reconciled' in row && typeof row.reconciled === 'boolean')
    ) {
      throw new Error('Actual returned a transaction of an unexpected shape');
    }
    return {
      id: row.id,
      date: row.date,
      amount: row.amount as number,
      notes: row.notes,
      cleared: row.cleared,
      reconciled: row.reconciled,
    };
  });
}
