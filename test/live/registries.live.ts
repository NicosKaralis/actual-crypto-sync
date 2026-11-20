// Live checks: the built-in tokens, every explorer and every price provider,
// against the real services. Run them with `npm run test:live`; they never run
// with `npm test` or in the image build. A weekly workflow (live.yml) runs
// them, so a changed contract, API or price id shows up before a user's sync
// fails.
//
// Everything comes from the registries and tokens.yml, so a new chain,
// explorer, provider or token is checked without a change here; only a new
// key goes in KEYS. Only the public exchange wallets of the unit tests are
// read, and test names show them as short addresses. A balance of 0 passes:
// any wallet can be emptied.
//
// Each explorer and provider is checked without a key when it allows that,
// and with its key from the environment (KEYS) when it has one; the keyed
// check is skipped when the variable isn't set. A keyless check of an entry
// that also has a key reads one wallet and two tokens only: public endpoints
// without a key allow few requests, and the keyed check reads everything.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { CHAINS } from '../../src/chains/index.ts';
import { walletPrefix } from '../../src/format.ts';
import { entryFetch, getJson, isRecord, postJson } from '../../src/http.ts';
import { PRICE_PROVIDERS } from '../../src/prices/index.ts';
import { BUILTIN_TOKENS, tokenKey } from '../../src/tokens.ts';
import type { ChainId, Token } from '../../src/types.ts';
import {
  BTC_P2PKH_WALLET,
  BTC_P2SH_WALLET,
  BTC_WALLET,
  ETH_WALLET,
  ETH_WALLET_2,
  ETH_WALLET_3,
  TRON_WALLET,
  TRON_WALLET_2,
} from '../fakes.ts';

/** The wallets each chain's explorers read: the public exchange wallets of the tests. */
const WALLETS: Record<ChainId, string[]> = {
  tron: [TRON_WALLET, TRON_WALLET_2],
  bitcoin: [BTC_WALLET, BTC_P2PKH_WALLET, BTC_P2SH_WALLET],
  ethereum: [ETH_WALLET, ETH_WALLET_2, ETH_WALLET_3],
  // Binance 8 and Bitfinex 2 hold BNB and tokens on BNB Smart Chain too.
  bsc: [ETH_WALLET, ETH_WALLET_2],
};

/**
 * The key of each explorer (`<chain>/<id>`) and provider (`<id>`) that has
 * one: the environment variable that holds it, and the setting it goes in.
 * The workflow sets them from repository secrets of the same names. A node
 * provider's key is part of its URL, so json-rpc gets a whole api_url.
 */
const KEYS: Record<string, { env: string; setting: string }> = {
  'tron/trongrid': { env: 'TRONGRID_API_KEY', setting: 'api_key' },
  'ethereum/json-rpc': { env: 'ETHEREUM_RPC_URL', setting: 'api_url' },
  'ethereum/blockscout': { env: 'BLOCKSCOUT_API_KEY', setting: 'api_key' },
  'ethereum/etherscan': { env: 'ETHERSCAN_API_KEY', setting: 'api_key' },
  'bsc/json-rpc': { env: 'BSC_RPC_URL', setting: 'api_url' },
  // Etherscan's free tier doesn't cover BNB Smart Chain: a paid key, kept apart.
  'bsc/etherscan': { env: 'ETHERSCAN_BSC_API_KEY', setting: 'api_key' },
  coingecko: { env: 'COINGECKO_API_KEY', setting: 'demo_api_key' },
  coinpaprika: { env: 'COINPAPRIKA_API_KEY', setting: 'api_key' },
};

// The defaults of the trongrid and the EVM json-rpc explorers and the coingecko
// and coinpaprika providers.
const TRONGRID_URL = 'https://api.trongrid.io';
const ETHEREUM_RPC_URL = 'https://ethereum-rpc.publicnode.com';
const BSC_RPC_URL = 'https://bsc-rpc.publicnode.com';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';
const COINPAPRIKA_URL = 'https://api.coinpaprika.com/v1';
const COINPAPRIKA_PRO_URL = 'https://api-pro.coinpaprika.com/v1';

/** CoinGecko's and CoinPaprika's platform id of each chain with tokens. */
const COINGECKO_PLATFORMS: Record<ChainId, string> = {
  tron: 'tron',
  ethereum: 'ethereum',
  bsc: 'binance-smart-chain',
};
const COINPAPRIKA_PLATFORMS: Record<ChainId, string> = {
  tron: 'trx-tron',
  ethereum: 'eth-ethereum',
  bsc: 'bnb-binance-coin',
};

/**
 * Tokens whose CoinPaprika id is that coin on another chain, because
 * CoinPaprika has no entry for this contract (the token files say so too).
 * The check expects them missing, so it fails once CoinPaprika adds them.
 */
const COINPAPRIKA_WITHOUT_CONTRACT = new Set(['tron:WETH', 'ethereum:USDD', 'bsc:TRX', 'bsc:WBTC']);

/** Contracts whose symbol() isn't the built-in symbol: TRON's wrapped coins. */
const ONCHAIN_SYMBOLS: Record<string, string> = { 'tron:WBTC': 'BTC', 'tron:WETH': 'ETH' };

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

/**
 * The ways to check an entry: without a key when it allows that, and with its
 * key. `skip` says which variable to set when the key isn't there.
 */
interface Mode {
  name: string;
  settings: Record<string, string>;
  sample: boolean; // one wallet and two tokens only
  skip: string | false;
}

function modes(
  keyId: string,
  entry: { checkSettings?(settings: Record<string, string>): string | null },
): Mode[] {
  const result: Mode[] = [];
  const key = KEYS[keyId];
  if (!entry.checkSettings?.({})) {
    result.push({ name: 'without a key', settings: {}, sample: key !== undefined, skip: false });
  }
  if (key) {
    const value = process.env[key.env];
    result.push({
      name: 'with a key',
      settings: value ? { [key.setting]: value } : {},
      sample: false,
      skip: value ? false : `set ${key.env} to check it`,
    });
  }
  return result;
}

/** A Solidity string (or a bytes32, as old tokens return) from an ABI-encoded hex result. */
function abiString(hex: string): string {
  const data = hex.replace(/^0x/, '');
  if (data.length === 64) {
    return Buffer.from(data, 'hex').toString('utf8').replace(/\0+$/, '');
  }
  const length = Number.parseInt(data.slice(64, 128), 16);
  return Buffer.from(data.slice(128, 128 + length * 2), 'hex').toString('utf8');
}

/** Calls a contract's view function with no arguments on chain; the ABI-encoded result as hex. */
const CONTRACT_CALLS: Record<
  ChainId,
  (contract: string, fn: 'decimals' | 'symbol') => Promise<string>
> = {
  async tron(contract, fn) {
    const trongrid = CHAINS.tron?.explorers.trongrid;
    const fetch = serviceFetch('tron/trongrid', trongrid?.serialIntervalMs ?? 1000);
    const body = await postJson(
      'trongrid',
      `${TRONGRID_URL}/wallet/triggerconstantcontract`,
      fetch,
      {
        owner_address: contract,
        contract_address: contract,
        function_selector: `${fn}()`,
        parameter: '',
        visible: true,
      },
    );
    const succeeded = isRecord(body) && isRecord(body.result) && body.result.result === true;
    const hex =
      isRecord(body) && Array.isArray(body.constant_result) ? body.constant_result[0] : undefined;
    assert.ok(
      succeeded && typeof hex === 'string' && /^[0-9a-f]+$/i.test(hex),
      `trongrid: ${fn}() gave no result`,
    );
    return hex;
  },
  ethereum: evmContractCall('ethereum', ETHEREUM_RPC_URL),
  bsc: evmContractCall('bsc', BSC_RPC_URL),
};

/** An EVM chain's contract call: eth_call on its public json-rpc node. */
function evmContractCall(
  chain: ChainId,
  url: string,
): (contract: string, fn: 'decimals' | 'symbol') => Promise<string> {
  return async (contract, fn) => {
    const rpc = CHAINS[chain]?.explorers['json-rpc'];
    const fetch = serviceFetch(`${chain}/json-rpc`, rpc?.serialIntervalMs ?? 1000);
    const body = await postJson('json-rpc', url, fetch, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      // The function selectors: the first 4 bytes of keccak256("decimals()") and of "symbol()".
      params: [{ to: contract, data: fn === 'decimals' ? '0x313ce567' : '0x95d89b41' }, 'latest'],
    });
    const hex = isRecord(body) ? body.result : undefined;
    assert.ok(
      typeof hex === 'string' && /^0x[0-9a-f]+$/i.test(hex),
      `json-rpc: ${fn}() gave no result`,
    );
    return hex;
  };
}

const contractTokens = BUILTIN_TOKENS.filter((token) => token.kind === 'contract');

describe('built-in tokens', () => {
  test('every chain with contract tokens can call contracts and has its platform ids', () => {
    const chains = [...new Set(contractTokens.map((token) => token.chain))];
    for (const table of [CONTRACT_CALLS, COINGECKO_PLATFORMS, COINPAPRIKA_PLATFORMS]) {
      assert.deepEqual(
        chains.filter((chain) => !Object.hasOwn(table, chain)),
        [],
      );
    }
  });

  for (const token of contractTokens) {
    const symbol = ONCHAIN_SYMBOLS[tokenKey(token)] ?? token.symbol;
    test(`${tokenKey(token)} has ${token.decimals} decimals and the symbol ${symbol} on chain`, async () => {
      const call = CONTRACT_CALLS[token.chain];
      assert.ok(call, `no contract calls for ${token.chain}`);
      const contract = token.contract ?? '';
      assert.equal(
        Number(BigInt(`0x${(await call(contract, 'decimals')).replace(/^0x/, '')}`)),
        token.decimals,
      );
      // Case aside: Lido's stETH is STETH here, and PancakeSwap's Cake is CAKE,
      // as symbols are upper case.
      assert.equal(abiString(await call(contract, 'symbol')).toUpperCase(), symbol);
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

  test('every explorer with a key setting is in KEYS', () => {
    const missing = Object.values(CHAINS).flatMap((chain) =>
      Object.values(chain.explorers)
        .filter((explorer) => explorer.settingKeys.some((key) => key.includes('key')))
        .map((explorer) => `${chain.id}/${explorer.id}`)
        .filter((id) => !Object.hasOwn(KEYS, id)),
    );
    assert.deepEqual(missing, []);
  });

  for (const chain of Object.values(CHAINS)) {
    for (const explorer of Object.values(chain.explorers)) {
      // A native-only explorer is asked only for the chain's coin, as in a run.
      const tokens = BUILTIN_TOKENS.filter(
        (token) =>
          token.chain === chain.id && (explorer.supportsContracts || token.kind === 'native'),
      );
      const keyId = `${chain.id}/${explorer.id}`;
      for (const mode of modes(keyId, explorer)) {
        // The sample: the first wallet, the coin and the first contract token.
        const wallets = (WALLETS[chain.id] ?? []).slice(0, mode.sample ? 1 : undefined);
        const read: Token[] = mode.sample
          ? [
              ...tokens.filter((token) => token.kind === 'native'),
              ...tokens.filter((token) => token.kind === 'contract').slice(0, 1),
            ]
          : tokens;
        for (const address of wallets) {
          const name = `${explorer.id} reads ${walletPrefix(address)} on ${chain.id} ${mode.name}`;
          test(name, { skip: mode.skip }, async () => {
            const balances = await explorer.getBalances({
              wallet: { address },
              tokens: read,
              settings: mode.settings,
              fetch: serviceFetch(`${keyId} ${mode.name}`, explorer.serialIntervalMs),
            });
            for (const token of read) {
              const balance = balances.get(token.symbol);
              assert.equal(typeof balance, 'bigint', token.symbol);
              assert.ok((balance ?? -1n) >= 0n, token.symbol);
            }
          });
        }
      }
    }
  }
});

describe('price providers', () => {
  test('every provider with a key setting is in KEYS', () => {
    const missing = Object.values(PRICE_PROVIDERS)
      .filter((provider) => provider.settingKeys.some((key) => key.includes('key')))
      .map((provider) => provider.id)
      .filter((id) => !Object.hasOwn(KEYS, id));
    assert.deepEqual(missing, []);
  });

  // Every provider is asked for every token it has an id for: a run stops at
  // the first that answers, this check doesn't. A price is one request for all
  // tokens, so the keyless check asks for all of them too.
  for (const provider of Object.values(PRICE_PROVIDERS)) {
    const tokens = BUILTIN_TOKENS.filter((token) => token.priceIds[provider.id] !== undefined);
    const currency = provider.supportsCurrency('eur') ? 'eur' : 'usd';

    for (const mode of modes(provider.id, provider)) {
      test(`${provider.id} prices every token with an id ${mode.name}`, {
        skip: mode.skip,
      }, async () => {
        assert.ok(tokens.length > 0, 'no token has an id for it');
        const quotes = await provider.getQuotes({
          tokens,
          currency,
          settings: mode.settings,
          fetch: serviceFetch(`${provider.id} ${mode.name}`, provider.serialIntervalMs),
        });
        const unpriced = tokens.map(tokenKey).filter((key) => !((quotes.get(key)?.price ?? 0) > 0));
        assert.deepEqual(unpriced, []);
      });
    }
  }

  test("every CoinGecko id is the token's contract on CoinGecko", async () => {
    const coingecko = PRICE_PROVIDERS.coingecko;
    assert.ok(coingecko);
    // One request for every coin's contracts, not one per token: the public
    // API allows only a few requests a minute.
    const list = await getJson(
      'coingecko',
      `${COINGECKO_URL}/coins/list?include_platform=true`,
      serviceFetch('coingecko without a key', coingecko.serialIntervalMs),
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
      // CoinGecko writes EVM contracts in lower case: compare each chain's one spelling.
      const normalize = CHAINS[token.chain]?.normalizeAddress ?? ((address: string) => address);
      if (typeof contract !== 'string' || normalize(contract) !== normalize(token.contract ?? '')) {
        wrong.push(
          `${tokenKey(token)}: CoinGecko's ${id} is ${String(contract)} on ${platform}, not ${token.contract}`,
        );
      }
    }
    assert.deepEqual(wrong, []);
  });

  // One request per chain: CoinPaprika's list of every contract on that
  // platform. With COINPAPRIKA_API_KEY it asks the paid API, which takes only
  // a paid plan's key; without, the free API, which allows 60 requests an
  // hour. (The paid API's Cloudflare cache can answer a list that someone
  // else fetched, so a wrong key can still pass for one chain.)
  for (const chain of [...new Set(contractTokens.map((token) => token.chain))]) {
    test(`every CoinPaprika id on ${chain} is the token's contract on CoinPaprika`, async () => {
      const coinpaprika = PRICE_PROVIDERS.coinpaprika;
      assert.ok(coinpaprika);
      const key = process.env.COINPAPRIKA_API_KEY;
      const list = await getJson(
        'coinpaprika',
        `${key ? COINPAPRIKA_PRO_URL : COINPAPRIKA_URL}/contracts/${COINPAPRIKA_PLATFORMS[chain]}`,
        serviceFetch(`coinpaprika ${key ? 'with' : 'without'} a key`, coinpaprika.serialIntervalMs),
        key ? { authorization: key } : {},
      );
      assert.ok(Array.isArray(list), 'coinpaprika: expected a list of contracts');
      // The list has every address in lower case, even TRON's case-sensitive
      // base58, so both sides are compared in lower case.
      const ids = new Map<string, unknown>();
      for (const entry of list) {
        if (isRecord(entry) && typeof entry.address === 'string') {
          ids.set(entry.address.toLowerCase(), entry.id);
        }
      }

      const wrong: string[] = [];
      for (const token of contractTokens.filter((t) => t.chain === chain)) {
        const id = token.priceIds.coinpaprika;
        if (id === undefined) {
          continue;
        }
        const listed = ids.get((token.contract ?? '').toLowerCase());
        if (COINPAPRIKA_WITHOUT_CONTRACT.has(tokenKey(token))) {
          if (listed !== undefined) {
            wrong.push(
              `${tokenKey(token)}: CoinPaprika now lists its contract, as ${String(listed)}`,
            );
          }
        } else if (listed !== id) {
          wrong.push(
            `${tokenKey(token)}: CoinPaprika's ${token.contract} is ${String(listed)}, not ${id}`,
          );
        }
      }
      assert.deepEqual(wrong, []);
    });
  }
});
