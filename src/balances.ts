import type { Config } from './config.ts';
import { walletPrefix } from './format.ts';
import { entryFetch, type Sleep } from './http.ts';
import type { ChainId, Token, Wallet } from './types.ts';

type ExplorerEntry = Config['chains'][ChainId]['explorers'][number];

export type BalanceResult = { raw: bigint; explorer: string } | { error: Error };

interface WalletBalance {
  raws: Map<string, bigint>;
  explorer: string;
}

/**
 * Every account's raw balance, keyed by account name. Each distinct wallet is
 * read once, with all the tokens its accounts hold, by the first of its chain's
 * explorers that answers for all of them. A wallet whose explorers all fail
 * fails only the accounts on it. An entry in serial mode sends its requests one
 * at a time; a rate limit is warned about once per entry, with its advice.
 */
export async function collectBalances({
  config,
  fetch,
  warn = () => {},
  sleep,
}: {
  config: Config;
  fetch: typeof globalThis.fetch;
  warn?: (message: string) => void;
  sleep?: Sleep;
}): Promise<Map<string, BalanceResult>> {
  // One entry per chain and address, with the tokens of every account on it.
  const wallets = new Map<string, { chain: ChainId; wallet: Wallet; tokens: Token[] }>();
  for (const account of config.accounts) {
    for (const wallet of account.wallets) {
      const key = walletKey(account.chain, wallet);
      const entry = wallets.get(key) ?? { chain: account.chain, wallet, tokens: [] };
      if (!entry.tokens.some((token) => token.symbol === account.token.symbol)) {
        entry.tokens.push(account.token);
      }
      wallets.set(key, entry);
    }
  }

  // Each entry shares one fetch across the run, so serial mode spans its wallets.
  const fetches = new Map<ExplorerEntry, typeof globalThis.fetch>();
  for (const { explorers } of Object.values(config.chains)) {
    for (const entry of explorers) {
      fetches.set(
        entry,
        entryFetch(fetch, {
          serial: entry.serial,
          intervalMs: entry.explorer.serialIntervalMs,
          sleep,
        }),
      );
    }
  }
  const rateLimited = new Set<string>();
  const context: ReadContext = { config, fetches, rateLimited, warn };

  const read = new Map<string, WalletBalance | Error>();
  await Promise.all(
    [...wallets].map(async ([key, { chain, wallet, tokens }]) => {
      read.set(key, await readWallet(context, chain, wallet, tokens));
    }),
  );

  const result = new Map<string, BalanceResult>();
  for (const account of config.accounts) {
    let raw = 0n;
    const explorers = new Set<string>();
    let error: Error | undefined;
    for (const wallet of account.wallets) {
      const balance = read.get(walletKey(account.chain, wallet));
      if (balance === undefined || balance instanceof Error) {
        error = balance ?? new Error(`${walletPrefix(wallet.address)}: not read`);
        break;
      }
      raw += balance.raws.get(account.token.symbol) ?? 0n;
      explorers.add(balance.explorer);
    }
    result.set(account.name, error ? { error } : { raw, explorer: [...explorers].join(', ') });
  }
  return result;
}

interface ReadContext {
  config: Config;
  fetches: Map<ExplorerEntry, typeof globalThis.fetch>;
  rateLimited: Set<string>; // labels already warned about
  warn: (message: string) => void;
}

async function readWallet(
  { config, fetches, rateLimited, warn }: ReadContext,
  chain: ChainId,
  wallet: Wallet,
  tokens: Token[],
): Promise<WalletBalance | Error> {
  const prefix = walletPrefix(wallet.address);
  const failures: string[] = [];
  const needsContracts = tokens.some((token) => token.kind === 'contract');

  for (const entry of config.chains[chain]?.explorers ?? []) {
    const { label, explorer, settings, serial } = entry;
    const fetch = fetches.get(entry) as typeof globalThis.fetch;
    if (needsContracts && !explorer.supportsContracts) {
      failures.push(`${label}: doesn't read contract tokens`);
      continue;
    }
    try {
      const raws = await explorer.getBalances({ wallet, tokens, settings, fetch });
      // One explorer answers for all of a wallet's tokens, or the next one is asked.
      const missing = tokens.filter((token) => !raws.has(token.symbol));
      if (missing.length > 0) {
        throw new Error(`no balance for ${missing.map((token) => token.symbol).join(', ')}`);
      }
      return { raws, explorer: label };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${label}: ${message}`);
      warn(`${prefix}: ${label} failed: ${message}`);
      const advice = explorer.rateLimitAdvice(error, { settings, serial });
      if (advice !== null && !rateLimited.has(label)) {
        rateLimited.add(label);
        warn(`${label} is rate limiting requests: ${advice}`);
      }
    }
  }
  return new Error(
    `${prefix}: every explorer failed (${failures.join('; ') || `no explorers for ${chain}`})`,
  );
}

function walletKey(chain: ChainId, wallet: Wallet): string {
  return `${chain}:${wallet.address}`;
}
