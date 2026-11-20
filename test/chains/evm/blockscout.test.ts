import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { blockscoutExplorer } from '../../../src/chains/evm/blockscout.ts';
import { ApiError } from '../../../src/http.ts';
import type { Token } from '../../../src/types.ts';
import { ETH_WALLET, fakeFetch, fixture, jsonResponse } from '../../fakes.ts';

const DEFAULT_URL = 'https://blockscout.example/api';
const explorer = blockscoutExplorer({ defaultUrl: DEFAULT_URL, chainId: 1 });

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

// test/fixtures/blockscout/: ETH_WALLET's ETH (balance.json) and USDT (tokenbalance.json);
// error.json is the answer to a malformed address.
function respond(url: string): Response {
  const action = new URL(url).searchParams.get('action');
  return jsonResponse(
    fixture(action === 'balance' ? 'blockscout/balance.json' : 'blockscout/tokenbalance.json'),
  );
}

function balances(
  tokens: Token[],
  settings: Record<string, string> = {},
  answer: (url: string) => Response = respond,
) {
  const { fetch, calls } = fakeFetch(answer);
  const result = explorer.getBalances({ wallet: { address: ETH_WALLET }, tokens, settings, fetch });
  return { result, calls };
}

describe('blockscoutExplorer', () => {
  test('reads contract tokens, with api_url and an optional api_key', () => {
    assert.equal(explorer.id, 'blockscout');
    assert.equal(explorer.supportsContracts, true);
    assert.deepEqual(explorer.settingKeys, ['api_url', 'api_key']);
    assert.equal(explorer.checkSettings, undefined);
  });

  test('ETH and USDT, one request each, keyed by symbol', async () => {
    const { result, calls } = balances([ETH, USDT]);
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
        `${DEFAULT_URL}?module=account&action=balance&address=${ETH_WALLET}&tag=latest`,
        `${DEFAULT_URL}?module=account&action=tokenbalance&contractaddress=${USDT.contract}&address=${ETH_WALLET}&tag=latest`,
      ],
    );
  });

  test('with a key, it asks the keyed API, with the chain id', async () => {
    const { result, calls } = balances([ETH], { api_key: 'test-key' });
    await result;
    assert.equal(
      calls[0]?.url,
      `https://api.blockscout.com/v2/api?chain_id=1&apikey=test-key&module=account&action=balance&address=${ETH_WALLET}&tag=latest`,
    );
  });

  test('api_url replaces the default instance', async () => {
    const { result, calls } = balances([ETH], { api_url: 'https://scout.lan/api/' });
    await result;
    assert.ok(calls[0]?.url.startsWith('https://scout.lan/api?module=account'));
  });

  test('an error answer is an ApiError whose message has neither the body nor the address', async () => {
    const { result } = balances([ETH], {}, () => jsonResponse(fixture('blockscout/error.json')));
    await assert.rejects(result, (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.message, 'blockscout: the API answered an error');
      assert.deepEqual(error.body, fixture('blockscout/error.json'));
      return true;
    });
  });

  test('a result that is not a whole number throws', async () => {
    for (const result of ['1.5', 12, null, '-1']) {
      const { result: balance } = balances([ETH], {}, () =>
        jsonResponse({ status: '1', message: 'OK', result }),
      );
      await assert.rejects(balance, {
        message: 'blockscout: ETH: result: expected a whole number',
      });
    }
    const { result } = balances([ETH], {}, () => jsonResponse([]));
    await assert.rejects(result, { message: 'blockscout: ETH: expected a map' });
  });

  describe('rate limits', () => {
    async function failure(response: Response): Promise<unknown> {
      try {
        await balances([ETH], {}, () => response).result;
      } catch (error) {
        return error;
      }
      assert.fail('expected getBalances to throw');
    }

    test('one request a second in serial mode', () => {
      assert.equal(explorer.serialIntervalMs, 1000);
    });

    // Blockscout's answer to a keyless caller over its limit.
    const LIMITED = {
      message: 'Too many requests. Increase limits now at https://dev.blockscout.com',
      result: null,
      status: '0',
    };

    test('a 429 is a rate limit: add a key, or set serial', async () => {
      const error = await failure(jsonResponse(LIMITED, 429));
      assert.equal(
        explorer.rateLimitAdvice(error, { settings: {}, serial: false }),
        'add a free API key (api_key: ${BLOCKSCOUT_API_KEY}), or set serial: true to send one request at a time',
      );
      assert.equal(
        explorer.rateLimitAdvice(error, { settings: { api_key: 'k' }, serial: false }),
        'set serial: true to send one request at a time',
      );
      assert.match(
        explorer.rateLimitAdvice(error, { settings: { api_key: 'k' }, serial: true }) ?? '',
        /^run less often/,
      );
    });

    test('the same message in a 200 body is one too', async () => {
      const error = await failure(jsonResponse(LIMITED));
      assert.ok(explorer.rateLimitAdvice(error, { settings: {}, serial: false }));
    });

    test('other errors get no advice', async () => {
      const error = await failure(jsonResponse(fixture('blockscout/error.json')));
      assert.equal(explorer.rateLimitAdvice(error, { settings: {}, serial: false }), null);
    });
  });
});
