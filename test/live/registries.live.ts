// Live checks: the built-in tokens, every explorer and every price provider,
// against the real services. Run them with `npm run test:live`; they never run
// with `npm test` or in the image build. A weekly workflow (live.yml) runs
// them, so a changed contract, API or price id shows up before a user's sync
// fails.
//
// Everything comes from the registries and src/tokens.yml, so a new chain,
// explorer, provider or token is checked without a change here. Only the public
// exchange wallets of the unit tests are read, and test names show them as
// short addresses. A balance of 0 passes: any wallet can be emptied.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { CHAINS } from '../../src/chains/index.ts';
import { walletPrefix } from '../../src/format.ts';
import { entryFetch, getJson, isRecord } from '../../src/http.ts';
import { PRICE_PROVIDERS } from '../../src/prices/index.ts';
import { BUILTIN_TOKENS, tokenKey } from '../../src/tokens.ts';
import type { ChainId } from '../../src/types.ts';
import {
  BTC_P2PKH_WALLET,
  BTC_P2SH_WALLET,
  BTC_WALLET,
  TRON_WALLET,
  TRON_WALLET_2,
} from '../fakes.ts';

/** The wallets each chain's explorers read: the public exchange wallets of the tests. */
const WALLETS: Record<ChainId, string[]> = {
  tron: [TRON_WALLET, TRON_WALLET_2],
  bitcoin: [BTC_WALLET, BTC_P2PKH_WALLET, BTC_P2SH_WALLET],
};

// The defaults of the trongrid explorer and the coingecko provider.
const TRONGRID_URL = 'https://api.trongrid.io';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

/** CoinGecko's asset platform id of each chain with tokens. */
const COINGECKO_PLATFORMS: Record<ChainId, string> = { tron: 'tron' };

const RATE_LIMIT_RETRY_MS = 60_000;

// One fetch per service, shared by every test, so the service's pacing holds
// across tests: one request at a time, its serial interval apart.
const fetches = new Map<string, typeof fetch>();

function serviceFetch(service: string, intervalMs: number): typeof fetch {
  let serviceFetch = fetches.get(service);
  if (!serviceFetch) {
    serviceFetch = retryOnRateLimit(entryFetch(globalThis.fetch, { serial: true, intervalMs }));
    fetches.set(service, serviceFetch);
  }
  return serviceFetch;
}

/** One retry, a minute later, on an HTTP 429: a weekly run shouldn't fail on one busy minute. */
function retryOnRateLimit(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return (async (input, init) => {
    const response = await fetch(input, init);
    if (response.status !== 429) {
      return response;
    }
    await delay(RATE_LIMIT_RETRY_MS);
    return fetch(input, init);
  }) as typeof globalThis.fetch;
}

/** Reads a contract's decimals() on chain, for each chain with tokens. */
const CONTRACT_DECIMALS: Record<ChainId, (contract: string) => Promise<number>> = {
  async tron(contract) {
    const trongrid = CHAINS.tron?.explorers.trongrid;
    const fetch = serviceFetch('trongrid', trongrid?.serialIntervalMs ?? 1000);
    const response = await fetch(`${TRONGRID_URL}/wallet/triggerconstantcontract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        owner_address: contract,
        contract_address: contract,
        function_selector: 'decimals()',
        parameter: '',
        visible: true,
      }),
    });
    assert.ok(response.ok, `trongrid: HTTP ${response.status}`);
    const body: unknown = await response.json();
    const succeeded = isRecord(body) && isRecord(body.result) && body.result.result === true;
    const hex =
      isRecord(body) && Array.isArray(body.constant_result) ? body.constant_result[0] : undefined;
    assert.ok(
      succeeded && typeof hex === 'string' && /^[0-9a-f]+$/i.test(hex),
      'trongrid: decimals() gave no number',
    );
    return Number(BigInt(`0x${hex}`));
  },
};

const contractTokens = BUILTIN_TOKENS.filter((token) => token.kind === 'contract');

describe('built-in tokens', () => {
  test('every chain with contract tokens can read decimals on chain', () => {
    const chains = new Set(contractTokens.map((token) => token.chain));
    assert.deepEqual(
      [...chains].filter((chain) => !Object.hasOwn(CONTRACT_DECIMALS, chain)),
      [],
    );
  });

  for (const token of contractTokens) {
    test(`${tokenKey(token)} has ${token.decimals} decimals on chain`, async () => {
      const read = CONTRACT_DECIMALS[token.chain];
      assert.ok(read, `no decimals reader for ${token.chain}`);
      assert.equal(await read(token.contract ?? ''), token.decimals);
    });
  }
});

describe('explorers', () => {
  test('every chain has wallets to read', () => {
    assert.deepEqual(
      Object.keys(CHAINS).filter((chain) => !WALLETS[chain]?.length),
      [],
    );
  });

  for (const chain of Object.values(CHAINS)) {
    for (const explorer of Object.values(chain.explorers)) {
      // A native-only explorer is asked only for the chain's coin, as in a run.
      const tokens = BUILTIN_TOKENS.filter(
        (token) =>
          token.chain === chain.id && (explorer.supportsContracts || token.kind === 'native'),
      );
      for (const address of WALLETS[chain.id] ?? []) {
        test(`${explorer.id} reads ${walletPrefix(address)} on ${chain.id}`, async () => {
          const balances = await explorer.getBalances({
            wallet: { address },
            tokens,
            settings: {},
            fetch: serviceFetch(explorer.id, explorer.serialIntervalMs),
          });
          for (const token of tokens) {
            const balance = balances.get(token.symbol);
            assert.equal(typeof balance, 'bigint', token.symbol);
            assert.ok((balance ?? -1n) >= 0n, token.symbol);
          }
        });
      }
    }
  }
});

describe('price providers', () => {
  // Every provider is asked for every token it has an id for: a run stops at
  // the first that answers, this check doesn't.
  for (const provider of Object.values(PRICE_PROVIDERS)) {
    const tokens = BUILTIN_TOKENS.filter((token) => token.priceIds[provider.id] !== undefined);
    const currency = provider.supportsCurrency('eur') ? 'eur' : 'usd';

    test(`${provider.id} prices every token with an id`, async () => {
      assert.ok(tokens.length > 0, 'no token has an id for it');
      const quotes = await provider.getQuotes({
        tokens,
        currency,
        settings: {},
        fetch: serviceFetch(provider.id, provider.serialIntervalMs),
      });
      const unpriced = tokens.map(tokenKey).filter((key) => !((quotes.get(key)?.price ?? 0) > 0));
      assert.deepEqual(unpriced, []);
    });
  }

  test("every CoinGecko id is the token's contract on CoinGecko", async () => {
    const coingecko = PRICE_PROVIDERS.coingecko;
    assert.ok(coingecko);
    // One request for every coin's contracts, not one per token: the public
    // API allows only a few requests a minute.
    const list = await getJson(
      'coingecko',
      `${COINGECKO_URL}/coins/list?include_platform=true`,
      serviceFetch(coingecko.id, coingecko.serialIntervalMs),
    );
    assert.ok(Array.isArray(list), 'coingecko: expected a list of coins');
    const platforms = new Map<string, unknown>();
    for (const coin of list) {
      if (isRecord(coin) && typeof coin.id === 'string') {
        platforms.set(coin.id, coin.platforms);
      }
    }

    const wrong: string[] = [];
    for (const token of contractTokens) {
      const id = token.priceIds.coingecko;
      if (id === undefined) {
        continue;
      }
      const platform = COINGECKO_PLATFORMS[token.chain];
      const contracts = platforms.get(id);
      const contract =
        platform !== undefined && isRecord(contracts) ? contracts[platform] : undefined;
      if (contract !== token.contract) {
        wrong.push(
          `${tokenKey(token)}: CoinGecko's ${id} is ${String(contract)} on ${platform}, not ${token.contract}`,
        );
      }
    }
    assert.deepEqual(wrong, []);
  });
});
