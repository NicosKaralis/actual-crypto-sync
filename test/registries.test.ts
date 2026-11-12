import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { getChain } from '../src/chains/index.ts';
import { getPriceProvider } from '../src/prices/index.ts';
import { fakeChains, fakePriceProviders } from './fakes.ts';

describe('getChain', () => {
  test('returns a registered chain', () => {
    assert.equal(getChain('tron', fakeChains).id, 'tron');
  });

  test('an unknown chain names the supported ones', () => {
    assert.throws(
      () => getChain('ethereum', fakeChains),
      /^Error: unknown chain "ethereum"; supported: tron, bitcoin$/,
    );
  });

  test("inherited object keys aren't chains", () => {
    assert.throws(() => getChain('toString', fakeChains), /unknown chain "toString"/);
  });
});

describe('getPriceProvider', () => {
  test('returns a registered provider', () => {
    assert.equal(getPriceProvider('coingecko', fakePriceProviders).id, 'coingecko');
  });

  test('an unknown provider names the supported ones', () => {
    assert.throws(
      () => getPriceProvider('kraken', fakePriceProviders),
      /^Error: unknown price provider "kraken"; supported: coingecko, other$/,
    );
  });
});
