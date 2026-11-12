import type { Config } from './config.ts';
import { walletPrefix } from './format.ts';
import type { ChainId, Token, Wallet } from './types.ts';

export type BalanceResult = { raw: bigint; explorer: string } | { error: Error };

interface WalletBalance {
  raws: Map<string, bigint>;
  explorer: string;
}

/**
 * Every account's raw balance, keyed by account name. Each distinct wallet is
 * read once, with all the tokens its accounts hold, by the first of its chain's
 * explorers that answers for all of them. A wallet whose explorers all fail
 * fails only the accounts on it.
 */
export async function collectBalances({
  config,
  fetch,
  warn = () => {},
}: {
  config: Config;
  fetch: typeof globalThis.fetch;
  warn?: (message: string) => void;
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

  const read = new Map<string, WalletBalance | Error>();
  await Promise.all(
    [...wallets].map(async ([key, { chain, wallet, tokens }]) => {
      read.set(key, await readWallet(config, chain, wallet, tokens, fetch, warn));
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

async function readWallet(
  config: Config,
  chain: ChainId,
  wallet: Wallet,
  tokens: Token[],
  fetch: typeof globalThis.fetch,
  warn: (message: string) => void,
): Promise<WalletBalance | Error> {
  const prefix = walletPrefix(wallet.address);
  const failures: string[] = [];
  const needsContracts = tokens.some((token) => token.kind === 'contract');

  for (const { label, explorer, settings } of config.chains[chain]?.explorers ?? []) {
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
    }
  }
  return new Error(
    `${prefix}: every explorer failed (${failures.join('; ') || `no explorers for ${chain}`})`,
  );
}

function walletKey(chain: ChainId, wallet: Wallet): string {
  return `${chain}:${wallet.address}`;
}
