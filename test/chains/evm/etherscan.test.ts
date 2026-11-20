import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { etherscanExplorer } from '../../../src/chains/evm/etherscan.ts';
import { ApiError } from '../../../src/http.ts';
import type { Token } from '../../../src/types.ts';
import { ETH_WALLET, fakeFetch, fixture, jsonResponse } from '../../fakes.ts';

const explorer = etherscanExplorer({ chainId: 1 });
const KEY = 'test-key';

const ETH: Token = {
  chain: 'ethereum',
  symbol: 'ETH',
  kind: 'native',
  decimals: 18,
  displayDecimals: 8,
  priceIds: {},
};
const USDT: Token = {
  chain: 'ethereum',
  symbol: 'USDT',
  kind: 'contract',
  contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  decimals: 6,
  displayDecimals: 6,
  priceIds: {},
};

const ok = (result: string) => jsonResponse({ status: '1', message: 'OK', result });
// test/fixtures/etherscan/: ETH_WALLET's ETH (balance.json) and USDT (tokenbalance.json),
// and the answer to an invalid key (error.json). The rate limit is from Etherscan's docs.
const INVALID_KEY = fixture('etherscan/error.json');
const RATE_LIMITED = {
  status: '0',
  message: 'NOTOK',
  result: 'Max rate limit reached, please use API Key for higher rate limit',
};

function balances(tokens: Token[], answer: (url: string) => Response, settings = { api_key: KEY }) {
  const { fetch, calls } = fakeFetch(answer);
  const result = explorer.getBalances({ wallet: { address: ETH_WALLET }, tokens, settings, fetch });
  return { result, calls };
}

async function failure(response: Response): Promise<unknown> {
  try {
    await balances([ETH], () => response).result;
  } catch (error) {
    return error;
  }
  assert.fail('expected getBalances to throw');
}

describe('etherscanExplorer', () => {
  test('reads contract tokens, with api_url and api_key', () => {
    assert.equal(explorer.id, 'etherscan');
    assert.equal(explorer.supportsContracts, true);
    assert.deepEqual(explorer.settingKeys, ['api_url', 'api_key']);
  });

  test('the API key is required', () => {
    assert.equal(
      explorer.checkSettings?.({}),
      'add an API key (api_key: ${ETHERSCAN_API_KEY}): Etherscan answers no request without one',
    );
    assert.equal(explorer.checkSettings?.({ api_key: KEY }), null);
  });

  test('ETH and USDT, one request each, with the chain id and the key', async () => {
    const { result, calls } = balances([ETH, USDT], (url) =>
      jsonResponse(
        fixture(
          new URL(url).searchParams.get('action') === 'balance'
            ? 'etherscan/balance.json'
            : 'etherscan/tokenbalance.json',
        ),
      ),
    );
    assert.deepEqual(
      await result,
      new Map([
        ['ETH', 76_771_078_045_186_866_036_890n],
        ['USDT', 14_000_000_000_000_668n],
      ]),
    );
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        `https://api.etherscan.io/v2/api?chainid=1&apikey=${KEY}&module=account&action=balance&address=${ETH_WALLET}&tag=latest`,
        `https://api.etherscan.io/v2/api?chainid=1&apikey=${KEY}&module=account&action=tokenbalance&contractaddress=${USDT.contract}&address=${ETH_WALLET}&tag=latest`,
      ],
    );
  });

  test('the chain id comes from the chain', async () => {
    const { fetch, calls } = fakeFetch(() => ok('0'));
    await etherscanExplorer({ chainId: 56 }).getBalances({
      wallet: { address: ETH_WALLET },
      tokens: [ETH],
      settings: { api_key: KEY },
      fetch,
    });
    assert.equal(new URL(calls[0]?.url ?? '').searchParams.get('chainid'), '56');
  });

  test("an error answer's message has neither the body, the key nor the address", async () => {
    const error = await failure(jsonResponse(INVALID_KEY));
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, 'etherscan: the API answered an error');
    assert.deepEqual(error.body, INVALID_KEY);
  });

  describe('rate limits', () => {
    test('three requests a second in serial mode, as the free tier allows', () => {
      assert.equal(explorer.serialIntervalMs, 350);
    });

    test('"Max rate limit reached" is a rate limit: set serial', async () => {
      const error = await failure(jsonResponse(RATE_LIMITED));
      assert.equal(
        explorer.rateLimitAdvice(error, { settings: { api_key: KEY }, serial: false }),
        'set serial: true to send one request at a time',
      );
      assert.match(
        explorer.rateLimitAdvice(error, { settings: { api_key: KEY }, serial: true }) ?? '',
        /^run less often, or use a paid Etherscan plan/,
      );
    });

    test('a 429 is one too', async () => {
      const error = await failure(jsonResponse({}, 429));
      assert.ok(explorer.rateLimitAdvice(error, { settings: { api_key: KEY }, serial: false }));
    });

    test('other errors get no advice', async () => {
      const error = await failure(jsonResponse(INVALID_KEY));
      assert.equal(
        explorer.rateLimitAdvice(error, { settings: { api_key: KEY }, serial: false }),
        null,
      );
    });
  });
});
