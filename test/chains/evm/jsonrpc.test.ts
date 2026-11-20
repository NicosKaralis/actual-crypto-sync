import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { jsonRpcExplorer } from '../../../src/chains/evm/jsonrpc.ts';
import { ApiError } from '../../../src/http.ts';
import type { Token } from '../../../src/types.ts';
import { ETH_WALLET, ETH_WALLET_2, fakeFetch, fixture, jsonResponse } from '../../fakes.ts';

const DEFAULT_URL = 'https://rpc.example';
const explorer = jsonRpcExplorer({ defaultUrl: DEFAULT_URL });

function token(symbol: string, contract?: string, decimals = 18): Token {
  return {
    chain: 'ethereum',
    symbol,
    kind: contract ? 'contract' : 'native',
    ...(contract ? { contract } : {}),
    decimals,
    displayDecimals: Math.min(decimals, 8),
    priceIds: {},
  };
}

const ETH = token('ETH');
const USDT = token('USDT', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6);
const USDC = token('USDC', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6);
const DAI = token('DAI', '0x6B175474E89094C44Da98b954EedeAC495271d0F');

// test/fixtures/json-rpc/balances.json: ETH_WALLET's ETH, USDT, USDC and DAI (none),
// in that order. unknown-contract.json: ETH, then balanceOf on ETH_WALLET_2, which has no code.
function balances(body: unknown, tokens: Token[], settings: Record<string, string> = {}) {
  const { fetch, calls } = fakeFetch(() => jsonResponse(body));
  const result = explorer.getBalances({ wallet: { address: ETH_WALLET }, tokens, settings, fetch });
  return { result, calls };
}

async function failure(response: Response): Promise<unknown> {
  const { fetch } = fakeFetch(() => response);
  try {
    await explorer.getBalances({
      wallet: { address: ETH_WALLET },
      tokens: [ETH],
      settings: {},
      fetch,
    });
  } catch (error) {
    return error;
  }
  assert.fail('expected getBalances to throw');
}

describe('jsonRpcExplorer', () => {
  test('reads contract tokens, with api_url as its one setting', () => {
    assert.equal(explorer.id, 'json-rpc');
    assert.equal(explorer.supportsContracts, true);
    assert.deepEqual(explorer.settingKeys, ['api_url']);
  });

  test('ETH and each token in one batch, keyed by symbol', async () => {
    const { result, calls } = balances(fixture('json-rpc/balances.json'), [ETH, USDT, USDC, DAI]);
    assert.deepEqual(
      await result,
      new Map([
        ['ETH', 76_771_078_045_186_866_036_890n],
        ['USDT', 14_000_000_000_000_668n],
        ['USDC', 142_297_508n],
        ['DAI', 0n],
      ]),
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, DEFAULT_URL);
    assert.equal(calls[0]?.method, 'POST');
  });

  test('the batch is eth_getBalance and balanceOf calls, with the address padded', async () => {
    const { result, calls } = balances(fixture('json-rpc/balances.json'), [ETH, USDT, USDC, DAI]);
    await result;
    const padded = `0x70a08231000000000000000000000000${ETH_WALLET.slice(2).toLowerCase()}`;
    assert.deepEqual(JSON.parse(calls[0]?.body ?? ''), [
      { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [ETH_WALLET, 'latest'] },
      ...[USDT, USDC, DAI].map((t, i) => ({
        jsonrpc: '2.0',
        id: i + 2,
        method: 'eth_call',
        params: [{ to: t.contract, data: padded }, 'latest'],
      })),
    ]);
  });

  test('results are matched by id, in any order', async () => {
    const body = (fixture('json-rpc/balances.json') as unknown[]).toReversed();
    const { result } = balances(body, [ETH, USDT, USDC, DAI]);
    assert.equal((await result).get('USDC'), 142_297_508n);
  });

  test('api_url replaces the default endpoint', async () => {
    const url = 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161';
    const { result, calls } = balances(fixture('json-rpc/balances.json'), [ETH, USDT, USDC, DAI], {
      api_url: url,
    });
    await result;
    assert.equal(calls[0]?.url, url);
  });

  test('no tokens, no request', async () => {
    const { result, calls } = balances([], []);
    assert.deepEqual(await result, new Map());
    assert.equal(calls.length, 0);
  });

  test('a contract that is not on the chain is an error, not a balance of 0', async () => {
    const unknown = token('NOPE', ETH_WALLET_2);
    const { result } = balances(fixture('json-rpc/unknown-contract.json'), [ETH, unknown]);
    await assert.rejects(result, {
      message: `json-rpc: NOPE: no contract at ${ETH_WALLET_2}`,
    });
  });

  test('a JSON-RPC error carries its code, and the server message stays out of the error', async () => {
    const error = await failure(jsonResponse(fixture('json-rpc/error.json')));
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, 'json-rpc: JSON-RPC error -32602');
    assert.deepEqual(
      error.body,
      (fixture('json-rpc/error.json') as { error: unknown }[])[0]?.error,
    );
  });

  test('a missing or malformed result throws', async () => {
    for (const body of [
      null,
      {},
      [],
      [{ id: 1 }],
      [{ id: 1, result: 12 }],
      [{ id: 1, result: '0xzz' }],
    ]) {
      const { result } = balances(body, [ETH]);
      await assert.rejects(result, /^Error: json-rpc: /, JSON.stringify(body));
    }
  });

  test('the native balance of "0x" is malformed, not a missing contract', async () => {
    const { result } = balances([{ jsonrpc: '2.0', id: 1, result: '0x' }], [ETH]);
    await assert.rejects(result, { message: 'json-rpc: ETH: expected a hex number' });
  });

  describe('rate limits', () => {
    // EIP-1474's "limit exceeded", for the whole batch.
    const LIMITED = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32005, message: 'Too many requests, exceeded the rate limit' },
    };

    test('one request a second in serial mode', () => {
      assert.equal(explorer.serialIntervalMs, 1000);
    });

    test('a 429 is a rate limit: set serial, or use your own node', async () => {
      const error = await failure(jsonResponse(LIMITED, 429));
      assert.equal(
        explorer.rateLimitAdvice(error, { settings: {}, serial: false }),
        'set serial: true to send one request at a time, or point api_url at your own node or a provider with an API key',
      );
      assert.equal(
        explorer.rateLimitAdvice(error, { settings: {}, serial: true }),
        'point api_url at your own node or a provider with an API key',
      );
    });

    test('a rate limit code or message in a 200 body is one too', async () => {
      for (const error of [
        LIMITED.error,
        { code: -32029, message: 'x' },
        { code: -32000, message: 'Rate limit reached' },
      ]) {
        const caught = await failure(jsonResponse({ jsonrpc: '2.0', id: null, error }));
        assert.ok(
          explorer.rateLimitAdvice(caught, { settings: {}, serial: false }),
          JSON.stringify(error),
        );
      }
    });

    test('other errors get no advice', async () => {
      const error = await failure(jsonResponse(fixture('json-rpc/error.json')));
      assert.equal(explorer.rateLimitAdvice(error, { settings: {}, serial: false }), null);
      assert.equal(explorer.rateLimitAdvice(new Error('x'), { settings: {}, serial: false }), null);
    });
  });
});
