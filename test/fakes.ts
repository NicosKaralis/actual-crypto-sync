// Fake chains, explorers and price providers, registered under the real ids,
// for tests that only need their metadata, and the test token database.
// Nothing here makes a request.
import { readFileSync } from 'node:fs';

import { parseTokens } from '../src/tokens.ts';
import type { Chain, Explorer, PriceProvider } from '../src/types.ts';

function explorer(id: string, supportsContracts: boolean): Explorer {
  return {
    id,
    supportsContracts,
    getBalances: () => Promise.reject(new Error(`fake explorer ${id} has no balances`)),
  };
}

function provider(id: string, currencies: string[]): PriceProvider {
  return {
    id,
    supportsCurrency: (currency) => currencies.includes(currency),
    getQuotes: () => Promise.reject(new Error(`fake provider ${id} has no quotes`)),
  };
}

const BASE58 = '[1-9A-HJ-NP-Za-km-z]';

export const fakeChains: Record<string, Chain> = {
  tron: {
    id: 'tron',
    nativeSymbol: 'TRX',
    supportsTokens: true,
    isValidAddress: (address) => new RegExp(`^T${BASE58}{33}$`).test(address),
    explorers: {
      trongrid: explorer('trongrid', true),
      'tron-native-only': explorer('tron-native-only', false),
    },
    defaultExplorers: ['trongrid'],
  },
  bitcoin: {
    id: 'bitcoin',
    nativeSymbol: 'BTC',
    supportsTokens: false,
    isValidAddress: (address) =>
      new RegExp(`^[13]${BASE58}{25,34}$`).test(address) || /^bc1[a-z0-9]{11,71}$/.test(address),
    explorers: { 'mempool-space': explorer('mempool-space', false) },
    defaultExplorers: ['mempool-space'],
  },
};

export const fakePriceProviders: Record<string, PriceProvider> = {
  // Supports sats, as CoinGecko does, to check the config still rejects it.
  coingecko: provider('coingecko', ['eur', 'usd', 'jpy', 'sats']),
  other: provider('other', ['chf']),
};

/** test/fixtures/tokens.yml: TRX and USDT on TRON, BTC. */
export const fakeTokens = parseTokens(
  readFileSync(new URL('./fixtures/tokens.yml', import.meta.url), 'utf8'),
  'test/fixtures/tokens.yml',
);

export const fakeRegistries = {
  chains: fakeChains,
  priceProviders: fakePriceProviders,
  tokens: fakeTokens,
};

// Public exchange wallets; never anyone's own.
export const TRON_WALLET = 'TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ';
export const TRON_WALLET_2 = 'TF4EdKvoRoQz3DJA6osYj2z33ip2AqJKv2';
export const BTC_WALLET = 'bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v';
