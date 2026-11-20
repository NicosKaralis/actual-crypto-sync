// A stand-in for TronGrid, mempool.space, Ethereum and BNB Smart Chain JSON-RPC nodes, CoinGecko, CoinPaprika and CoinMarketCap, run inside the e2e
// test process. It answers from the recorded responses in test/fixtures/, and
// the tests change its state between runs. The e2e config points each
// explorer and provider at it through api_url: <url>/trongrid, and so on.

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fixture, TRON_WALLET_2 } from '../fakes.ts';

export interface MockState {
  /** Added to the recorded TRX balance, in sun. */
  extraSun: number;
  /** When set, CoinGecko answers with this HTTP status and its rate-limit body. */
  coingeckoStatus: number | null;
  /** When set, CoinPaprika answers with this HTTP status and its error body. */
  coinpaprikaStatus: number | null;
  /** When set, CoinMarketCap answers with this HTTP status and its error body. */
  coinmarketcapStatus: number | null;
  /** Addresses that TronGrid answers with HTTP 500. */
  failingWallets: Set<string>;
}

/**
 * TronGrid's TRX balance of TRON_WALLET_2, in sun, with nothing frozen and no
 * tokens. Other addresses get the recorded account; this one differs, so a sum
 * of two wallets is not twice one.
 */
export const TRON_WALLET_2_SUN = 5_000_000;

/** CoinPaprika's EUR price of each id it knows; other ids answer 404. */
export const COINPAPRIKA_PRICES: Record<string, number> = {
  'trx-tron': 0.2836451012079849,
  'usdt-tether': 0.9042,
  'btc-bitcoin': 62519,
  'eth-ethereum': 2290.17,
  'usdc-usd-coin': 0.9043,
  'bnb-binance-coin': 517.88,
};

/** CoinMarketCap's EUR price of each slug it knows; other slugs are left out. */
export const COINMARKETCAP_PRICES: Record<string, number> = {
  tron: 0.28044356337231524,
  tether: 0.9117,
  bitcoin: 56360.09528772283,
  ethereum: 1596.91,
  'usd-coin': 0.9123,
  bnb: 521.39,
};

export interface Mock {
  /** The base URL, reachable from the test process and the processes it starts. */
  url: string;
  state: MockState;
  /** Each request's method and path, without the query string. */
  requests: string[];
  close(): Promise<void>;
}

export async function startMock(): Promise<Mock> {
  const state: MockState = {
    extraSun: 0,
    coingeckoStatus: null,
    coinpaprikaStatus: null,
    coinmarketcapStatus: null,
    failingWallets: new Set(),
  };
  const requests: string[] = [];

  const server = createServer(async (request, response) => {
    const { pathname: path, searchParams } = new URL(request.url ?? '/', 'http://mock');
    requests.push(`${request.method} ${path}`);
    let text = '';
    for await (const chunk of request) {
      text += chunk;
    }
    const node = JSON_RPC_NODES[path];
    const [status, body] = node ? jsonRpc(text, node) : answer(path, searchParams, state);
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    state,
    requests,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

/**
 * The JSON-RPC nodes, by path: each answers from its recorded batch, with the
 * coin's balance first and then these contracts' balances, in this order.
 */
const JSON_RPC_NODES: Record<string, { fixture: string; contracts: string[] }> = {
  // ETH_WALLET's ETH, USDT, USDC and DAI.
  '/ethereum/json-rpc': {
    fixture: 'json-rpc/balances.json',
    contracts: [
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      '0x6b175474e89094c44da98b954eedeac495271d0f',
    ],
  },
  // ETH_WALLET's BNB and USDT on BNB Smart Chain.
  '/bsc/json-rpc': {
    fixture: 'json-rpc/bsc-balances.json',
    contracts: ['0x55d398326f99059ff775485246999027b3197955'],
  },
};

/**
 * A JSON-RPC batch, answered from the node's recorded batch: the coin for
 * eth_getBalance, and a contract's balance for an eth_call to that contract,
 * whatever the address asked for.
 */
function jsonRpc(
  text: string,
  { fixture: path, contracts }: { fixture: string; contracts: string[] },
): [number, unknown] {
  const recorded = fixture(path) as { result: string }[];
  const calls = JSON.parse(text) as {
    id: number;
    method: string;
    params: [{ to?: string } | string, string];
  }[];
  return [
    200,
    calls.map(({ id, method, params }) => {
      const to = typeof params[0] === 'object' ? (params[0].to ?? '').toLowerCase() : '';
      const contract = contracts.indexOf(to);
      const result =
        method === 'eth_getBalance'
          ? recorded[0]?.result
          : contract >= 0
            ? recorded[contract + 1]?.result
            : undefined;
      return result === undefined
        ? { jsonrpc: '2.0', id, error: { code: -32000, message: 'no mock for this call' } }
        : { jsonrpc: '2.0', id, result };
    }),
  ];
}

function answer(path: string, query: URLSearchParams, state: MockState): [number, unknown] {
  if (path.startsWith('/trongrid/v1/accounts/')) {
    const address = decodeURIComponent(path.slice('/trongrid/v1/accounts/'.length));
    if (state.failingWallets.has(address)) {
      return [500, { error: 'internal error' }];
    }
    const body = structuredClone(fixture('trongrid/account.json')) as {
      data: { balance: number; frozenV2: unknown[]; trc20: unknown[] }[];
    };
    const account = body.data[0];
    if (account && address === TRON_WALLET_2) {
      account.balance = TRON_WALLET_2_SUN;
      account.frozenV2 = [];
      account.trc20 = [];
    }
    if (account) {
      account.balance += state.extraSun;
    }
    return [200, body];
  }
  if (path.startsWith('/mempool-space/address/')) {
    return [200, fixture('mempool-space/address.json')];
  }
  if (path === '/coingecko/simple/price') {
    return state.coingeckoStatus === null
      ? [200, fixture('coingecko/simple-price.json')]
      : [state.coingeckoStatus, { status: { error_code: state.coingeckoStatus } }];
  }
  if (path.startsWith('/coinpaprika/tickers/')) {
    if (state.coinpaprikaStatus !== null) {
      return [state.coinpaprikaStatus, { error: 'you have reached maximum request limit' }];
    }
    const id = decodeURIComponent(path.slice('/coinpaprika/tickers/'.length));
    const price = COINPAPRIKA_PRICES[id];
    if (price === undefined) {
      return [404, { error: 'id not found' }];
    }
    // The recorded ticker, with this id's price.
    const body = structuredClone(fixture('coinpaprika/ticker.json')) as {
      id: string;
      quotes: { EUR: { price: number } };
    };
    body.id = id;
    body.quotes.EUR.price = price;
    return [200, body];
  }
  if (path === '/coinmarketcap/simple/price') {
    if (state.coinmarketcapStatus !== null) {
      return [
        state.coinmarketcapStatus,
        { status: { error_code: '1011', error_message: "You've hit an IP rate limit." } },
      ];
    }
    // The recorded answer's shape, with an entry for each slug it knows.
    const body = structuredClone(fixture('coinmarketcap/simple-price.json')) as {
      data: { slug: string; quotes: { symbol: string; price: number }[] }[];
    };
    const recorded = body.data[0];
    body.data = (query.get('slug') ?? '')
      .split(',')
      .filter((slug) => COINMARKETCAP_PRICES[slug] !== undefined)
      .map((slug) => ({
        ...recorded,
        slug,
        quotes: [{ symbol: 'EUR', price: COINMARKETCAP_PRICES[slug] as number }],
      }));
    return [200, body];
  }
  return [404, { error: `no mock for ${path}` }];
}
