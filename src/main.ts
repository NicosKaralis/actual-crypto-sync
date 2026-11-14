import { readFileSync } from 'node:fs';
import { argv, exit, env as processEnv, stderr, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

import { type Span, SpanStatusCode } from '@opentelemetry/api';

import {
  type Actual,
  type ActualApi,
  type OpenBudgetOptions,
  openBudget,
  prepareDataDir,
} from './actual.ts';
import { collectBalances } from './balances.ts';
import { type Config, ConfigError, loadConfig } from './config.ts';
import { redactUrl, toUnits } from './format.ts';
import type { Sleep } from './http.ts';
import { createLog, errorMessage, type Log, type LogFormat, parseLogFormat } from './log.ts';
import { OtelEnvError, parseTelemetryEnv, TELEMETRY_OFF, type TelemetryEnv } from './otel-env.ts';
import { planAccount } from './plan.ts';
import { collectQuotes } from './quotes.ts';
import { startTelemetry, type Telemetry } from './telemetry.ts';
import { tokenKey } from './tokens.ts';

export const USAGE = `Usage: actual-crypto-sync [--config <path>] [--dry-run] [--debug]

Keeps off-budget Actual Budget accounts in line with your crypto wallets.

Options:
  --config <path>  Config file (default: $CONFIG_FILE or /config/config.yml)
  --dry-run        Read everything and log the plan, write nothing to Actual
  --debug          Log every request's URL and status
  -h, --help       Show this help
`;

const DEFAULT_CONFIG_FILE = '/config/config.yml';
const DEFAULT_DATA_DIR = '/cache';

const STAGES = ['config', 'wallet', 'quotes', 'actual', 'account'] as const;
type Stage = (typeof STAGES)[number];
// skipped: an account left as it is, because today's transaction is reconciled.
const ACTIONS = ['created', 'updated', 'cleared', 'deleted', 'skipped'] as const;
type Action = (typeof ACTIONS)[number];

export interface RunOptions {
  /** Reads and checks the config; throws a ConfigError. */
  readConfig: () => Config;
  /** Logs in to Actual and downloads the budget. */
  openActual: (options: OpenBudgetOptions) => Promise<Actual>;
  fetch: typeof globalThis.fetch;
  telemetry: Telemetry;
  log: Log;
  now: () => Date;
  /** Reads everything and logs the plan, but writes nothing to Actual. */
  dryRun: boolean;
  /** Where @actual-app/api keeps its copy of the budget. */
  dataDir: string;
  sleep?: Sleep;
}

/** What a run did, for the metrics. */
interface Tally {
  errors: Record<Stage, number>;
  transactions: Record<Action, number>;
  providerErrors: Map<string, { kind: 'explorer' | 'price'; id: string; count: number }>;
}

/**
 * One sync: reads the config, logs in, reads every wallet and price, and
 * writes each account's transaction for today. Returns the exit code: 0 when
 * every account succeeded, 1 otherwise. The caller flushes telemetry.
 */
export async function run(options: RunOptions): Promise<number> {
  const { telemetry, now } = options;
  const started = now();
  const tally: Tally = {
    errors: { config: 0, wallet: 0, quotes: 0, actual: 0, account: 0 },
    transactions: { created: 0, updated: 0, cleared: 0, deleted: 0, skipped: 0 },
    providerErrors: new Map(),
  };

  const succeeded = await telemetry.tracer.startActiveSpan(
    'actual-crypto-sync.run',
    async (span) => {
      try {
        const ok = await sync(options, started, tally);
        if (!ok) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
        return ok;
      } finally {
        span.end();
      }
    },
  );

  const { gauges } = telemetry;
  const startedSeconds = started.getTime() / 1000;
  gauges.lastRun.record(startedSeconds);
  if (succeeded) {
    gauges.lastSuccess.record(startedSeconds);
  }
  gauges.runDuration.record((now().getTime() - started.getTime()) / 1000);
  for (const action of ACTIONS) {
    gauges.transactions.record(tally.transactions[action], { action });
  }
  for (const stage of STAGES) {
    gauges.errors.record(tally.errors[stage], { stage });
  }
  for (const { kind, id, count } of tally.providerErrors.values()) {
    gauges.providerErrors.record(count, { kind, id });
  }
  return succeeded ? 0 : 1;
}

async function sync(options: RunOptions, started: Date, tally: Tally): Promise<boolean> {
  const { telemetry, log, dryRun } = options;
  const { tracer } = telemetry;

  let config: Config;
  try {
    config = options.readConfig();
  } catch (error) {
    tally.errors.config = 1;
    log('error', errorMessage(error), { stage: 'config' });
    return false;
  }

  const actual = await tracer.startActiveSpan('actual.download', async (span) => {
    try {
      return await options.openActual({
        serverURL: config.actual.serverURL,
        auth: config.actual.auth,
        syncId: config.actual.syncId,
        dataDir: options.dataDir,
        encryptionPassword: config.actual.encryptionPassword,
      });
    } catch (error) {
      tally.errors.actual = 1;
      failSpan(span, error);
      log('error', errorMessage(error), { stage: 'actual' });
      return undefined;
    } finally {
      span.end();
    }
  });
  if (actual === undefined) {
    return false;
  }

  let ok = true;
  try {
    ok = await syncAccounts(options, config, actual, started, tally);
  } finally {
    try {
      await actual.close({ sync: !dryRun });
    } catch (error) {
      tally.errors.actual += 1;
      log('error', errorMessage(error), { stage: 'actual' });
      ok = false;
    }
  }
  return ok;
}

async function syncAccounts(
  options: RunOptions,
  config: Config,
  actual: Actual,
  started: Date,
  tally: Tally,
): Promise<boolean> {
  const { telemetry, log, dryRun, sleep } = options;
  const { tracer, gauges } = telemetry;
  const fetch = loggingFetch(options.fetch, log);
  const warn = (message: string) => log('warn', message);
  const failed = (kind: 'explorer' | 'price') => (id: string) => {
    const key = `${kind}:${id}`;
    const entry = tally.providerErrors.get(key) ?? { kind, id, count: 0 };
    entry.count += 1;
    tally.providerErrors.set(key, entry);
  };

  const [balances, quotes] = await Promise.all([
    collectBalances({ config, fetch, warn, failed: failed('explorer'), tracer, sleep }),
    collectQuotes({ config, fetch, warn, failed: failed('price'), tracer, sleep }),
  ]);

  // A wallet that failed is one error, however many accounts it funds.
  const walletErrors = new Set<Error>();
  for (const result of balances.values()) {
    if ('error' in result && !walletErrors.has(result.error)) {
      walletErrors.add(result.error);
      log('error', result.error.message, { stage: 'wallet' });
    }
  }
  tally.errors.wallet = walletErrors.size;

  const { currency } = config.prices;
  const tokens = new Map(config.accounts.map(({ token }) => [tokenKey(token), token]));
  for (const [key, token] of tokens) {
    const result = quotes.get(key);
    if (result === undefined) {
      tally.errors.quotes += 1;
      log('error', `${key}: no price from any provider; its accounts are skipped`, {
        stage: 'quotes',
      });
      continue;
    }
    gauges.price.record(result.quote.price, {
      symbol: token.symbol,
      currency,
      source: result.source,
    });
  }

  const today = localDate(started);
  const yesterday = localDate(
    new Date(started.getFullYear(), started.getMonth(), started.getDate() - 1, 12),
  );

  let ok = walletErrors.size === 0 && tally.errors.quotes === 0;
  for (const account of config.accounts) {
    const { name, chain, token } = account;
    const balance = balances.get(name);
    const quote = quotes.get(tokenKey(token));
    if (balance === undefined || 'error' in balance || quote === undefined) {
      // Already counted and logged as a wallet or quotes error.
      continue;
    }

    const synced = await tracer.startActiveSpan(`account ${name}`, async (span) => {
      try {
        const amount = toUnits(balance.raw, token.decimals);
        gauges.balance.record(amount, {
          chain,
          symbol: token.symbol,
          account: name,
          explorer: balance.explorer,
        });

        const { id } = await actual.findAccount(name);
        const txs = await actual.transactionsForPlan(id, today);
        const balanceCents = await actual.balanceThrough(id, yesterday);
        const plan = planAccount({
          txs,
          balanceCents,
          balance: amount,
          price: quote.quote.price,
          symbol: token.symbol,
          displayDecimals: token.displayDecimals,
          currency,
          today,
        });
        gauges.value.record(plan.valueCents / 100, {
          chain,
          symbol: token.symbol,
          account: name,
          currency,
        });
        const fields = {
          account: name,
          amount_cents: plan.amountCents,
          value_cents: plan.valueCents,
          note: plan.note,
          explorer: balance.explorer,
          source: quote.source,
        };

        // A reconciled transaction is locked in Actual, so the account waits for
        // tomorrow's transaction. Not an error: the user did it on purpose.
        if (plan.reconciled === 'skip') {
          const msg = "today's sync transaction is reconciled";
          if (dryRun) {
            log('warn', `dry run: would skip, ${msg}`, fields);
          } else {
            tally.transactions.skipped += 1;
            log('warn', `${msg}; skipped until tomorrow`, fields);
          }
          return true;
        }

        if (dryRun) {
          log(
            'info',
            plan.reconciled === 'kept'
              ? "dry run: would keep today's reconciled transaction"
              : plan.existingId === null
                ? 'dry run: would create a transaction'
                : 'dry run: would update a transaction',
            { ...fields, delete: plan.toDelete.length, clear: plan.toClear.length },
          );
          return true;
        }

        const tx = { amount: plan.amountCents, notes: plan.note };
        if (plan.reconciled === 'kept') {
          log('info', "kept today's reconciled transaction", fields);
        } else if (plan.existingId === null) {
          await actual.createTransaction(id, { date: today, ...tx });
          tally.transactions.created += 1;
          log('info', 'created a transaction', fields);
        } else {
          await actual.updateTransaction(plan.existingId, tx);
          tally.transactions.updated += 1;
          log('info', 'updated a transaction', fields);
        }
        for (const duplicate of plan.toDelete) {
          await actual.deleteTransaction(duplicate);
          tally.transactions.deleted += 1;
          log('info', "deleted a duplicate of today's transaction", { account: name });
        }
        for (const previous of plan.toClear) {
          await actual.clearTransaction(previous);
          tally.transactions.cleared += 1;
        }
        return true;
      } catch (error) {
        tally.errors.account += 1;
        failSpan(span, error);
        log('error', `${name}: ${errorMessage(error)}`, { stage: 'account', account: name });
        return false;
      } finally {
        span.end();
      }
    });
    ok &&= synced;
  }
  return ok;
}

/** Marks the span failed. Only the message: errors reaching here are already free of secrets. */
function failSpan(span: Span, error: unknown) {
  span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(error) });
}

/** YYYY-MM-DD in local time (TZ). */
function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Logs each request at debug level: method, redacted URL, status and time. Never headers or bodies. */
function loggingFetch(fetch: typeof globalThis.fetch, log: Log): typeof globalThis.fetch {
  return (async (input, init) => {
    const url = redactUrl(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const started = performance.now();
    const duration = () => Math.round(performance.now() - started);
    try {
      const response = await fetch(input, init);
      log('debug', `${method} ${url}`, { status: response.status, duration_ms: duration() });
      return response;
    } catch (error) {
      log('debug', `${method} ${url} failed`, { duration_ms: duration() });
      throw error;
    }
  }) as typeof globalThis.fetch;
}

function readConfigFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    throw new ConfigError(
      'config',
      `can't read ${path}${typeof code === 'string' ? ` (${code})` : ''}`,
    );
  }
}

/** @actual-app/api, loaded only when a run gets that far: it loads a native SQLite module. */
async function actualApi(): Promise<ActualApi> {
  const api: ActualApi = await import('@actual-app/api');
  return api;
}

export async function main(
  args: readonly string[],
  env: Record<string, string | undefined> = processEnv,
): Promise<number> {
  let configFile = env.CONFIG_FILE || DEFAULT_CONFIG_FILE;
  let dryRun = false;
  let debug = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      stdout.write(USAGE);
      return 0;
    } else if (arg === '--config' && args[i + 1] !== undefined) {
      configFile = args[++i] as string;
    } else if (arg?.startsWith('--config=')) {
      configFile = arg.slice('--config='.length);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--debug') {
      debug = true;
    } else {
      stderr.write(`unknown argument: ${arg}\n\n${USAGE}`);
      return 1;
    }
  }

  // Before anything else is logged: a typo must not change the format silently.
  let format: LogFormat;
  try {
    format = parseLogFormat(env.LOG_FORMAT);
  } catch (error) {
    createLog()('error', errorMessage(error), { stage: 'config' });
    return 1;
  }

  const log = createLog({ debug, format });
  const telemetryEnv = readTelemetryEnv(env, log);
  if (telemetryEnv === undefined) {
    return 1;
  }
  const telemetry = startTelemetry({ settings: telemetryEnv.settings, log });
  try {
    return await run({
      readConfig: () => loadConfig(readConfigFile(configFile), env),
      openActual: async (options) => {
        prepareDataDir(options.dataDir);
        telemetry.propagateTo(options.serverURL);
        return openBudget(await actualApi(), options);
      },
      fetch: globalThis.fetch,
      telemetry,
      log,
      now: () => new Date(),
      dryRun,
      dataDir: env.ACTUAL_DATA_DIR || DEFAULT_DATA_DIR,
    });
  } finally {
    await telemetry.shutdown();
  }
}

/**
 * The telemetry settings, with the unused-variables warning logged. An invalid
 * value stops the run (undefined), unless TELEMETRY_DISABLED_ON_ERROR turns
 * telemetry off for this run instead.
 */
function readTelemetryEnv(
  env: Record<string, string | undefined>,
  log: Log,
): TelemetryEnv | undefined {
  let telemetryEnv: TelemetryEnv;
  try {
    telemetryEnv = parseTelemetryEnv(env);
  } catch (error) {
    if (!(error instanceof OtelEnvError) || !disabledOnError(env)) {
      log('error', errorMessage(error), { stage: 'config' });
      return undefined;
    }
    log('error', `${errorMessage(error)}; telemetry is off for this run`, { stage: 'config' });
    return { settings: TELEMETRY_OFF, unused: [], ignoreUnused: true, disabledOnError: true };
  }
  const { unused, ignoreUnused } = telemetryEnv;
  if (unused.length > 0 && !ignoreUnused) {
    log('warn', 'OTEL variables set but not used (TELEMETRY_IGNORE_UNUSED_ENV=true hides this)', {
      stage: 'config',
      unused: unused.map(({ name, reason }) => `${name} (${reason})`).join(', '),
    });
  }
  return telemetryEnv;
}

/** TELEMETRY_DISABLED_ON_ERROR, read on its own when the rest failed. */
function disabledOnError(env: Record<string, string | undefined>): boolean {
  return env.TELEMETRY_DISABLED_ON_ERROR?.trim().toLowerCase() === 'true';
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  main(argv.slice(2)).then(exit, (error: unknown) => {
    stderr.write(`actual-crypto-sync: ${errorMessage(error)}\n`);
    exit(1);
  });
}
