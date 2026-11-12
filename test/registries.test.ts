import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { CHAINS, getChain } from '../src/chains/index.ts';
import { getPriceProvider, PRICE_PROVIDERS } from '../src/prices/index.ts';
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

describe('the registries', () => {
  test('hold the chains, with their explorers', () => {
    assert.equal(getChain('tron').explorers.trongrid?.id, 'trongrid');
    assert.equal(getChain('bitcoin').explorers['mempool-space']?.id, 'mempool-space');
    for (const [id, chain] of Object.entries(CHAINS)) {
      assert.equal(chain.id, id);
    }
  });

  test('hold the price providers', () => {
    assert.equal(getPriceProvider('coingecko').id, 'coingecko');
    for (const [id, provider] of Object.entries(PRICE_PROVIDERS)) {
      assert.equal(provider.id, id);
    }
  });

  test("each chain's default explorers are its own", () => {
    for (const chain of Object.values(CHAINS)) {
      assert.ok(chain.defaultExplorers.length > 0, chain.id);
      for (const id of chain.defaultExplorers) {
        assert.equal(chain.explorers[id]?.id, id, `${chain.id}: ${id}`);
      }
    }
  });
});
