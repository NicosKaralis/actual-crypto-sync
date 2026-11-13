// What chains, explorers and price providers implement. Not a public API: these
// can change in any version.

export type ChainId = string; // 'tron', 'bitcoin'

/** Lowercase ISO 4217 code, normalized by the config loader: 'eur', 'usd'. */
export type Currency = string;

export interface Token {
  chain: ChainId;
  symbol: string; // 'USDT'
  kind: 'native' | 'contract';
  contract?: string; // set when kind is 'contract'
  decimals: number; // on-chain decimals of the raw balance
  displayDecimals: number; // decimals shown in notes: min(decimals, 8), so TRX 6, USDT 6, BTC 8
  priceIds: Record<string, string>; // provider id -> that provider's id: { coingecko: 'tether' }
}

export interface Wallet {
  address: string;
}

export interface Chain {
  id: ChainId;
  nativeSymbol: string;
  supportsTokens: boolean;
  isValidAddress(address: string): boolean;
  explorers: Record<string, Explorer>;
  defaultExplorers: string[]; // used when the config doesn't list any
}

/** An explorer or provider entry's settings, and whether it's in serial mode. */
export interface EntrySettings {
  settings: Record<string, string>;
  serial: boolean;
}

export interface Explorer {
  id: string; // 'trongrid', 'mempool-space'
  supportsContracts: boolean; // a native-only explorer is skipped for contract tokens
  serialIntervalMs: number; // in serial mode, the wait after each request before the next
  /** When `error` is this API's rate limit, what the user can do about it; null for any other error. */
  rateLimitAdvice(error: unknown, entry: EntrySettings): string | null;
  /** Optional: a problem with the entry's settings, as a config error; null when they're fine. */
  checkSettings?(settings: Record<string, string>): string | null;
  /** One wallet, one request where the API allows it; raw integer balances keyed by token symbol. */
  getBalances(req: {
    wallet: Wallet;
    tokens: Token[];
    settings: Record<string, string>; // from the config, e.g. api_url, api_key
    fetch: typeof fetch;
  }): Promise<Map<string, bigint>>;
}

export interface Quote {
  price: number;
  currency: Currency;
}

export interface PriceProvider {
  id: string; // 'coingecko'
  supportsCurrency(currency: Currency): boolean;
  serialIntervalMs: number; // in serial mode, the wait after each request before the next
  /** When `error` is this API's rate limit, what the user can do about it; null for any other error. */
  rateLimitAdvice(error: unknown, entry: EntrySettings): string | null;
  /** Optional: a problem with the entry's settings, as a config error; null when they're fine. */
  checkSettings?(settings: Record<string, string>): string | null;
  /** Every token in one call where the API allows it; tokens it can't price are left out. */
  getQuotes(req: {
    tokens: Token[]; // only tokens with a priceIds entry for this provider
    currency: Currency;
    settings: Record<string, string>;
    fetch: typeof fetch;
  }): Promise<Map<string, Quote>>; // keyed by `${chain}:${symbol}`
}
