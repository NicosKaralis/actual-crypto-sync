// A stand-in for TronGrid, mempool.space, CoinGecko and CoinPaprika, run inside the e2e
// test process. It answers from the recorded responses in test/fixtures/, and
// the tests change its state between runs. The e2e config points each
// explorer and provider at it through api_url: <url>/trongrid, and so on.

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fixture } from '../fakes.ts';

export interface MockState {
  /** Added to the recorded TRX balance, in sun. */
  extraSun: number;
  /** When set, CoinGecko answers with this HTTP status and its rate-limit body. */
  coingeckoStatus: number | null;
  /** When set, CoinPaprika answers with this HTTP status and its error body. */
  coinpaprikaStatus: number | null;
}

/** CoinPaprika's EUR price of each id it knows; other ids answer 404. */
export const COINPAPRIKA_PRICES: Record<string, number> = {
  'trx-tron': 0.2836451012079849,
  'usdt-tether': 0.9042,
  'btc-bitcoin': 62519,
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
  const state: MockState = { extraSun: 0, coingeckoStatus: null, coinpaprikaStatus: null };
  const requests: string[] = [];

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://mock').pathname;
    requests.push(`${request.method} ${path}`);
    const [status, body] = answer(path, state);
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

function answer(path: string, state: MockState): [number, unknown] {
  if (path.startsWith('/trongrid/v1/accounts/')) {
    const body = structuredClone(fixture('trongrid/account.json')) as {
      data: { balance: number }[];
    };
    const account = body.data[0];
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
  return [404, { error: `no mock for ${path}` }];
}
