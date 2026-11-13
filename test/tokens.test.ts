import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { getChain } from '../src/chains/index.ts';
import { PRICE_PROVIDERS } from '../src/prices/index.ts';
import {
  BUILTIN_TOKENS,
  defaultDisplayDecimals,
  findBuiltinToken,
  parseTokens,
  resolveToken,
} from '../src/tokens.ts';
import type { Token } from '../src/types.ts';
import { fakeTokens, TRON_WALLET, TRON_WALLET_2 } from './fakes.ts';

const CUSTOM: Token = {
  chain: 'tron',
  symbol: 'XYZ',
  kind: 'contract',
  contract: TRON_WALLET_2,
  decimals: 18,
  displayDecimals: 8,
  priceIds: { coingecko: 'xyz-token' },
};

const parse = (text: string) => parseTokens(text, 'test.yml');

/** A one-chain database whose second token is `fields`, after a native TRX. */
function withToken(fields: string): string {
  return `tron:\n  - { symbol: TRX, decimals: 6, price_ids: { coingecko: tron } }\n  - ${fields}\n`;
}

describe('the built-in database, src/tokens.yml', () => {
  // Rules only: adding a token to src/tokens.yml shouldn't need a test change.
  test('loads', () => {
    assert.ok(BUILTIN_TOKENS.length > 0);
  });

  test('every chain has exactly one native token', () => {
    for (const chain of new Set(BUILTIN_TOKENS.map((t) => t.chain))) {
      const natives = BUILTIN_TOKENS.filter((t) => t.chain === chain && t.kind === 'native');
      assert.equal(natives.length, 1, chain);
    }
  });

  test('symbols and contracts are unique per chain', () => {
    const symbols = BUILTIN_TOKENS.map((t) => `${t.chain}:${t.symbol}`);
    assert.equal(new Set(symbols).size, symbols.length);
    const contracts = BUILTIN_TOKENS.filter((t) => t.contract).map(
      (t) => `${t.chain}:${t.contract}`,
    );
    assert.equal(new Set(contracts).size, contracts.length);
  });

  test('every token has a CoinGecko id', () => {
    for (const token of BUILTIN_TOKENS) {
      assert.ok(token.priceIds.coingecko, `${token.chain}:${token.symbol}`);
    }
  });

  test('every chain in it is registered, its native token named as the chain says', () => {
    for (const token of BUILTIN_TOKENS.filter((t) => t.kind === 'native')) {
      assert.equal(getChain(token.chain).nativeSymbol, token.symbol, token.chain);
    }
  });

  test('every contract is a valid address on its chain, which has tokens', () => {
    for (const token of BUILTIN_TOKENS.filter((t) => t.kind === 'contract')) {
      const chain = getChain(token.chain);
      assert.ok(chain.supportsTokens, `${token.chain}:${token.symbol}`);
      assert.ok(chain.isValidAddress(token.contract ?? ''), `${token.chain}:${token.symbol}`);
    }
  });

  test('every price id names a registered provider', () => {
    for (const token of BUILTIN_TOKENS) {
      for (const provider of Object.keys(token.priceIds)) {
        assert.ok(
          Object.hasOwn(PRICE_PROVIDERS, provider),
          `${token.chain}:${token.symbol}: ${provider}`,
        );
      }
    }
  });
});

describe('parseTokens', () => {
  test('reads each chain, a contract making a contract token', () => {
    assert.deepEqual(fakeTokens, [
      {
        chain: 'tron',
        symbol: 'TRX',
        kind: 'native',
        decimals: 6,
        displayDecimals: 6,
        priceIds: { coingecko: 'tron' },
      },
      {
        chain: 'tron',
        symbol: 'USDT',
        kind: 'contract',
        contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        decimals: 6,
        displayDecimals: 6,
        priceIds: { coingecko: 'tether' },
      },
      {
        chain: 'bitcoin',
        symbol: 'BTC',
        kind: 'native',
        decimals: 8,
        displayDecimals: 8,
        priceIds: { coingecko: 'bitcoin' },
      },
    ]);
  });

  test('display_decimals defaults to min(decimals, 8) and can be set', () => {
    const token = (fields: string) =>
      parse(
        withToken(
          `{ symbol: XYZ, contract: ${TRON_WALLET}, price_ids: { coingecko: x }, ${fields} }`,
        ),
      )[1];
    assert.equal(token('decimals: 18')?.displayDecimals, 8);
    assert.equal(token('decimals: 4')?.displayDecimals, 4);
    assert.equal(token('decimals: 18, display_decimals: 2')?.displayDecimals, 2);
  });

  test('errors name the file and the entry', () => {
    const cases: [string, string][] = [
      ['', 'test.yml: file: is empty'],
      ['- TRX\n', 'test.yml: file: expected a map'],
      ['tron:\n  symbol: TRX\n', 'test.yml: tron: expected a list of tokens'],
      [
        withToken('{ symbol: XYZ, decimals: 6, price_ids: { coingecko: x }, kind: native }'),
        'test.yml: tron[1].kind: unknown key; expected symbol, contract, decimals, display_decimals or price_ids',
      ],
      [
        withToken('{ decimals: 6, price_ids: { coingecko: x } }'),
        'test.yml: tron[1].symbol: required',
      ],
      [
        withToken('{ symbol: xyz, decimals: 6, price_ids: { coingecko: x } }'),
        'test.yml: tron[1].symbol: use only upper-case letters and digits (A-Z, 0-9)',
      ],
      [
        withToken(`{ symbol: XYZ, contract: ${TRON_WALLET}, price_ids: { coingecko: x } }`),
        'test.yml: tron[1].decimals: required',
      ],
      [
        withToken(
          `{ symbol: XYZ, contract: ${TRON_WALLET}, decimals: 1.5, price_ids: { coingecko: x } }`,
        ),
        'test.yml: tron[1].decimals: expected an integer from 0 to 255',
      ],
      [
        withToken(
          `{ symbol: XYZ, contract: ${TRON_WALLET}, decimals: 6, display_decimals: 7, price_ids: { coingecko: x } }`,
        ),
        'test.yml: tron[1].display_decimals: expected an integer from 0 to 6',
      ],
      [
        withToken(`{ symbol: XYZ, contract: ${TRON_WALLET}, decimals: 6 }`),
        'test.yml: tron[1].price_ids: required',
      ],
      [
        withToken(`{ symbol: XYZ, contract: ${TRON_WALLET}, decimals: 6, price_ids: {} }`),
        'test.yml: tron[1].price_ids: list at least one price id',
      ],
      [
        withToken(
          `{ symbol: TRX, contract: ${TRON_WALLET}, decimals: 6, price_ids: { coingecko: x } }`,
        ),
        'test.yml: tron[1].symbol: TRX is already defined on tron',
      ],
      [
        withToken('{ symbol: XYZ, decimals: 6, price_ids: { coingecko: x } }'),
        'test.yml: tron[1]: tron already has a native token; set contract',
      ],
      [
        'tron:\n  - { symbol: USDT, contract: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t, decimals: 6, price_ids: { coingecko: tether } }\n',
        'test.yml: tron: list the native token (the one without a contract)',
      ],
      [
        'tron:\n  - { symbol: TRX, decimals: 6, decimals: 7, price_ids: { coingecko: tron } }\n',
        'test.yml: file: Map keys must be unique at line 2, column 33',
      ],
    ];
    for (const [text, message] of cases) {
      assert.throws(() => parse(text), { message }, JSON.stringify(text));
    }
  });

  test('a contract used twice on a chain is an error', () => {
    const text = `${withToken(`{ symbol: AAA, contract: ${TRON_WALLET}, decimals: 6, price_ids: { coingecko: a } }`)}  - { symbol: BBB, contract: ${TRON_WALLET}, decimals: 6, price_ids: { coingecko: b } }\n`;
    assert.throws(() => parse(text), {
      message: 'test.yml: tron[2].contract: already used by AAA',
    });
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
    const usdt = resolveToken('tron', 'USDT', [], fakeTokens);
    assert.equal(usdt.contract, 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    assert.deepEqual(usdt.priceIds, { coingecko: 'tether' });
  });

  test('finds a custom token on its chain', () => {
    assert.equal(resolveToken('tron', 'XYZ', [CUSTOM], fakeTokens), CUSTOM);
  });

  test('a custom token with a built-in symbol wins over the built-in one', () => {
    const usdt: Token = { ...CUSTOM, symbol: 'USDT' };
    assert.equal(resolveToken('tron', 'USDT', [usdt], fakeTokens), usdt);
  });

  test("a symbol on another chain isn't found", () => {
    assert.throws(
      () => resolveToken('bitcoin', 'USDT', [CUSTOM], fakeTokens),
      /^Error: "USDT" isn't built in on bitcoin; define it in tokens:$/,
    );
    assert.throws(
      () => resolveToken('bitcoin', 'XYZ', [CUSTOM], fakeTokens),
      /"XYZ" isn't built in on bitcoin/,
    );
  });

  test('an unknown symbol names the chain and tokens:', () => {
    assert.throws(
      () => resolveToken('tron', 'NOPE', [], fakeTokens),
      /"NOPE" isn't built in on tron; define it in tokens:/,
    );
  });

  test('uses the built-in database by default', () => {
    assert.equal(
      findBuiltinToken('tron', 'TRX'),
      BUILTIN_TOKENS.find((t) => t.symbol === 'TRX'),
    );
  });
});
