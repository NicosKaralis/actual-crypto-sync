import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BUILTIN_TOKENS, defaultDisplayDecimals, resolveToken } from '../src/tokens.ts';
import type { Token } from '../src/types.ts';

const CUSTOM: Token = {
  chain: 'tron',
  symbol: 'XYZ',
  kind: 'contract',
  contract: 'TF4EdKvoRoQz3DJA6osYj2z33ip2AqJKv2',
  decimals: 18,
  displayDecimals: 8,
  priceIds: { coingecko: 'xyz-token' },
};

describe('built-in tokens', () => {
  test('TRX, USDT on TRON and BTC, as documented', () => {
    assert.deepEqual(
      BUILTIN_TOKENS.map((t) => [
        t.chain,
        t.symbol,
        t.kind,
        t.contract,
        t.decimals,
        t.displayDecimals,
      ]),
      [
        ['tron', 'TRX', 'native', undefined, 6, 6],
        ['tron', 'USDT', 'contract', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 6, 6],
        ['bitcoin', 'BTC', 'native', undefined, 8, 8],
      ],
    );
  });

  test('every built-in token has a CoinGecko id', () => {
    assert.deepEqual(
      Object.fromEntries(BUILTIN_TOKENS.map((t) => [`${t.chain}:${t.symbol}`, t.priceIds])),
      {
        'tron:TRX': { coingecko: 'tron' },
        'tron:USDT': { coingecko: 'tether' },
        'bitcoin:BTC': { coingecko: 'bitcoin' },
      },
    );
  });

  test('symbols are unique per chain', () => {
    const keys = BUILTIN_TOKENS.map((t) => `${t.chain}:${t.symbol}`);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('defaultDisplayDecimals', () => {
  test('is the on-chain decimals, capped at 8', () => {
    assert.equal(defaultDisplayDecimals(6), 6);
    assert.equal(defaultDisplayDecimals(8), 8);
    assert.equal(defaultDisplayDecimals(18), 8);
    assert.equal(defaultDisplayDecimals(0), 0);
  });
});

describe('resolveToken', () => {
  test('finds a built-in token with its contract and price ids', () => {
    const usdt = resolveToken('tron', 'USDT', []);
    assert.equal(usdt.contract, 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    assert.deepEqual(usdt.priceIds, { coingecko: 'tether' });
  });

  test('finds a custom token on its chain', () => {
    assert.equal(resolveToken('tron', 'XYZ', [CUSTOM]), CUSTOM);
  });

  test("a symbol on another chain isn't found", () => {
    assert.throws(
      () => resolveToken('bitcoin', 'USDT', [CUSTOM]),
      /^Error: "USDT" isn't built in on bitcoin; define it in tokens:$/,
    );
    assert.throws(
      () => resolveToken('bitcoin', 'XYZ', [CUSTOM]),
      /"XYZ" isn't built in on bitcoin/,
    );
  });

  test('an unknown symbol names the chain and tokens:', () => {
    assert.throws(
      () => resolveToken('tron', 'NOPE', []),
      /"NOPE" isn't built in on tron; define it in tokens:/,
    );
  });
});
