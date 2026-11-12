import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Config } from '../src/config.ts';
import { collectQuotes } from '../src/quotes.ts';
import type { PriceProvider, Quote, Token } from '../src/types.ts';
import { fakeTokens } from './fakes.ts';

const [TRX, USDT, BTC] = ['TRX', 'USDT', 'BTC'].map(
  (symbol) => fakeTokens.find((t) => t.symbol === symbol) as Token,
) as [Token, Token, Token];

interface Call {
  provider: string;
  tokens: string[];
}

/** A provider pricing what `prices` lists (by `${chain}:${symbol}`), recording its calls. */
function provider(
  id: string,
  calls: Call[],
  prices: Record<string, Quote> | Error,
  currencies = ['eur'],
): PriceProvider {
  return {
    id,
    supportsCurrency: (currency) => currencies.includes(currency),
    getQuotes: async ({ tokens }) => {
      calls.push({ provider: id, tokens: tokens.map((t) => `${t.chain}:${t.symbol}`) });
      if (prices instanceof Error) {
        throw prices;
      }
      return new Map(Object.entries(prices));
    },
  };
}

/** Accounts holding `tokens`, priced by `providers` in order. */
function config(providers: { label: string; provider: PriceProvider }[], tokens: Token[]): Config {
  return {
    actual: { serverURL: 'http://actual:5006', syncId: 'x', auth: { kind: 'session', token: 'x' } },
    prices: { currency: 'eur', providers: providers.map((p) => ({ ...p, settings: {} })) },
    chains: {},
    accounts: tokens.map((token, index) => ({
      name: `account ${index}`,
      chain: token.chain,
      token,
      wallets: [{ address: 'x' }],
    })),
  };
}

const fetch = (() => Promise.reject(new Error('no requests here'))) as typeof globalThis.fetch;
const eur = (price: number): Quote => ({ price, currency: 'eur' });
const withIds = (token: Token, priceIds: Record<string, string>): Token => ({ ...token, priceIds });

describe('collectQuotes', () => {
  test('the second provider is asked only for what the first did not price', async () => {
    const calls: Call[] = [];
    const trx = withIds(TRX, { coingecko: 'tron', other: 'trx' });
    const usdt = withIds(USDT, { coingecko: 'tether', other: 'usdt' });
    const result = await collectQuotes({
      config: config(
        [
          { label: 'coingecko', provider: provider('coingecko', calls, { 'tron:TRX': eur(0.3) }) },
          {
            label: 'other',
            provider: provider('other', calls, { 'tron:TRX': eur(9), 'tron:USDT': eur(0.9) }),
          },
        ],
        [trx, usdt, trx],
      ),
      fetch,
    });
    assert.deepEqual(calls, [
      { provider: 'coingecko', tokens: ['tron:TRX', 'tron:USDT'] },
      { provider: 'other', tokens: ['tron:USDT'] },
    ]);
    assert.deepEqual(
      result,
      new Map([
        ['tron:TRX', { quote: eur(0.3), source: 'coingecko' }],
        ['tron:USDT', { quote: eur(0.9), source: 'other' }],
      ]),
    );
  });

  test("a token with no id at a provider isn't sent to it", async () => {
    const calls: Call[] = [];
    const result = await collectQuotes({
      config: config(
        [
          { label: 'other', provider: provider('other', calls, { 'tron:TRX': eur(1) }) },
          { label: 'coingecko', provider: provider('coingecko', calls, { 'bitcoin:BTC': eur(2) }) },
        ],
        [withIds(TRX, { other: 'trx', coingecko: 'tron' }), BTC],
      ),
      fetch,
    });
    assert.deepEqual(calls, [
      { provider: 'other', tokens: ['tron:TRX'] },
      { provider: 'coingecko', tokens: ['bitcoin:BTC'] },
    ]);
    assert.equal(result.size, 2);
  });

  test("a provider with nothing to price isn't called", async () => {
    const calls: Call[] = [];
    await collectQuotes({
      config: config(
        [
          { label: 'coingecko', provider: provider('coingecko', calls, { 'bitcoin:BTC': eur(2) }) },
          { label: 'other', provider: provider('other', calls, {}) },
        ],
        [BTC],
      ),
      fetch,
    });
    assert.deepEqual(
      calls.map((c) => c.provider),
      ['coingecko'],
    );
  });

  test("a provider that doesn't support the currency is skipped", async () => {
    const calls: Call[] = [];
    await collectQuotes({
      config: config(
        [{ label: 'coingecko', provider: provider('coingecko', calls, {}, ['usd']) }],
        [BTC],
      ),
      fetch,
    });
    assert.deepEqual(calls, []);
  });

  test('a quote in the wrong currency is dropped and logged', async () => {
    const warnings: string[] = [];
    const result = await collectQuotes({
      config: config(
        [
          {
            label: 'coingecko',
            provider: provider('coingecko', [], {
              'bitcoin:BTC': { price: 70000, currency: 'usd' },
            }),
          },
        ],
        [BTC],
      ),
      fetch,
      warn: (message) => warnings.push(message),
    });
    assert.equal(result.size, 0);
    assert.deepEqual(warnings, ['bitcoin:BTC: coingecko answered in usd, not eur; quote dropped']);
  });

  test('a price that is not a positive number is dropped', async () => {
    const result = await collectQuotes({
      config: config(
        [{ label: 'coingecko', provider: provider('coingecko', [], { 'bitcoin:BTC': eur(0) }) }],
        [BTC],
      ),
      fetch,
    });
    assert.equal(result.size, 0);
  });

  test('every provider failing leaves the token out', async () => {
    const warnings: string[] = [];
    const trx = withIds(TRX, { coingecko: 'tron', other: 'trx' });
    const result = await collectQuotes({
      config: config(
        [
          {
            label: 'coingecko',
            provider: provider('coingecko', [], new Error('coingecko: HTTP 429')),
          },
          { label: 'other', provider: provider('other', [], new Error('other: HTTP 500')) },
        ],
        [trx],
      ),
      fetch,
      warn: (message) => warnings.push(message),
    });
    assert.equal(result.size, 0);
    assert.deepEqual(warnings, [
      'coingecko failed: coingecko: HTTP 429',
      'other failed: other: HTTP 500',
    ]);
  });
});
