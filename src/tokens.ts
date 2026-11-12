import type { ChainId, Token } from './types.ts';

/** Notes show at most 8 decimals; tokens with fewer show them all. */
export const MAX_DISPLAY_DECIMALS = 8;

export function defaultDisplayDecimals(decimals: number): number {
  return Math.min(decimals, MAX_DISPLAY_DECIMALS);
}

/**
 * Popular tokens, picked in the config by symbol. Adding one is an entry here
 * and a test; a new price provider adds its id to each token it can price.
 */
export const BUILTIN_TOKENS: readonly Token[] = [
  {
    chain: 'tron',
    symbol: 'TRX',
    kind: 'native',
    decimals: 6,
    displayDecimals: defaultDisplayDecimals(6),
    priceIds: { coingecko: 'tron' },
  },
  {
    chain: 'tron',
    symbol: 'USDT',
    kind: 'contract',
    contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
    displayDecimals: defaultDisplayDecimals(6),
    priceIds: { coingecko: 'tether' },
  },
  {
    chain: 'bitcoin',
    symbol: 'BTC',
    kind: 'native',
    decimals: 8,
    displayDecimals: defaultDisplayDecimals(8),
    priceIds: { coingecko: 'bitcoin' },
  },
];

export function findBuiltinToken(chain: ChainId, symbol: string): Token | undefined {
  return BUILTIN_TOKENS.find((token) => token.chain === chain && token.symbol === symbol);
}

/** A built-in token, or one defined in the config's `tokens:`, on that chain. */
export function resolveToken(
  chain: ChainId,
  symbol: string,
  customTokens: readonly Token[],
): Token {
  const token =
    findBuiltinToken(chain, symbol) ??
    customTokens.find((custom) => custom.chain === chain && custom.symbol === symbol);
  if (!token) {
    throw new Error(`"${symbol}" isn't built in on ${chain}; define it in tokens:`);
  }
  return token;
}
