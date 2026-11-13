// config.schema.json, the JSON Schema that editors use to check a config file.
// The loader stays the authority: the schema checks the shape, and the loader
// also checks ${VAR} values, addresses, the tokens of accounts and duplicates.
// These tests keep the two in line: the configs in the repo pass the schema,
// the schema lists what the registries hold, and a shape error is refused by
// both.

import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { describe, test } from 'node:test';

import { Ajv } from 'ajv';
import { parse, stringify } from 'yaml';

import { CHAINS } from '../src/chains/index.ts';
import { ConfigError, loadConfig } from '../src/config.ts';
import { PRICE_PROVIDERS } from '../src/prices/index.ts';
import { TRON_WALLET, TRON_WALLET_2 } from './fakes.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const schema: unknown = JSON.parse(read('config.schema.json'));
// Strict, but `not: { required: [...] }` (one CoinGecko key) is fine without listing the properties again.
const validate = new Ajv({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true,
}).compile(schema as object);

/** The value at `path` in the schema; fails the test when a step is missing. */
function at(...path: (string | number)[]): unknown {
  let node = schema;
  for (const step of path) {
    assert.ok(typeof node === 'object' && node !== null, `schema: no ${path.join('.')}`);
    node = (node as Record<string | number, unknown>)[step];
  }
  assert.ok(node !== undefined, `schema: no ${path.join('.')}`);
  return node;
}

const keys = (...path: (string | number)[]) => Object.keys(at(...path) as object).sort();
const sorted = (items: readonly string[]) => [...items].sort();

/** The ids of an entries list (providers, explorers) and each id's own settings. */
function entries(...path: (string | number)[]): Record<string, string[]> {
  const settings: Record<string, string[]> = {};
  for (const id of at(...path, 'oneOf', 0, 'enum') as string[]) {
    settings[id] = keys(...path, 'oneOf', 1, 'items', 'oneOf', 1, 'properties', id, 'properties')
      .filter((key) => key !== 'label' && key !== 'serial')
      .sort();
  }
  return settings;
}

describe('config.schema.json', () => {
  const configs = globSync('**/config*.yml', {
    cwd: new URL('..', import.meta.url),
    exclude: (path) => path === 'node_modules',
  }).sort();

  test('the repo has its configs', () => {
    assert.deepEqual(configs, [
      'config.example.yml',
      'dev/config.password.yml',
      'dev/config.yml',
      'test/e2e/config.yml',
    ]);
  });

  for (const path of configs) {
    test(`${path} passes it`, () => {
      assert.ok(validate(parse(read(path))), JSON.stringify(validate.errors, null, 2));
    });

    // The example is copied out of the repo, so it points at the released
    // schema; the others point at the schema next to them.
    test(`${path} names it on its first line`, () => {
      const schema =
        path === 'config.example.yml'
          ? 'https://raw.githubusercontent.com/NicosKaralis/actual-crypto-sync/main/config.schema.json'
          : relative(dirname(path), 'config.schema.json');
      assert.equal(read(path).split('\n')[0], `# yaml-language-server: $schema=${schema}`);
    });
  }
});

describe('the schema lists what the registries hold', () => {
  test('the chains, under chains and in accounts', () => {
    assert.deepEqual(keys('properties', 'chains', 'properties'), sorted(Object.keys(CHAINS)));
    assert.deepEqual(
      sorted(at('properties', 'accounts', 'items', 'properties', 'chain', 'enum') as string[]),
      sorted(Object.keys(CHAINS)),
    );
  });

  test("each chain's explorers and their settings", () => {
    for (const chain of Object.values(CHAINS)) {
      const expected = Object.fromEntries(
        Object.values(chain.explorers).map((e) => [e.id, sorted(e.settingKeys)]),
      );
      assert.deepEqual(
        entries('properties', 'chains', 'properties', chain.id, 'properties', 'explorers'),
        expected,
        chain.id,
      );
    }
  });

  test('the price providers and their settings', () => {
    const expected = Object.fromEntries(
      Object.values(PRICE_PROVIDERS).map((p) => [p.id, sorted(p.settingKeys)]),
    );
    assert.deepEqual(entries('properties', 'prices', 'properties', 'providers'), expected);
    assert.deepEqual(
      keys('properties', 'tokens', 'items', 'properties', 'price_ids', 'properties'),
      sorted(Object.keys(PRICE_PROVIDERS)),
    );
  });

  test('the chains with tokens', () => {
    const withTokens = Object.values(CHAINS)
      .filter((chain) => chain.supportsTokens)
      .map((chain) => chain.id);
    assert.deepEqual(
      sorted(at('properties', 'tokens', 'items', 'properties', 'chain', 'enum') as string[]),
      sorted(withTokens),
    );
  });
});

describe('the schema and the loader agree on the shape', () => {
  type Raw = Record<string, unknown>;
  const ENV = {
    ACTUAL_SESSION_TOKEN: 'session-token',
    ACTUAL_PASSWORD: 'password',
    TRON_WALLET,
    KEY: 'CG-test-key',
    ENCRYPTION: 'encryption-password',
  };

  function base(): Raw {
    return {
      actual: {
        server_url: 'http://actual:5006',
        sync_id: 'sync-id',
        auth: { session: '${ACTUAL_SESSION_TOKEN}' },
      },
      prices: { currency: 'eur', providers: ['coingecko', 'coinpaprika'] },
      accounts: [{ name: 'TRON: TRX', chain: 'tron', token: 'TRX', wallets: '${TRON_WALLET}' }],
    };
  }
  const actual = (raw: Raw) => raw.actual as Raw;
  const prices = (raw: Raw) => raw.prices as Raw;
  const account = (raw: Raw) => (raw.accounts as Raw[])[0] as Raw;
  const WTRX = {
    chain: 'tron',
    symbol: 'WTRX',
    contract: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
    decimals: 6,
    price_ids: { coingecko: 'wrapped-tron' },
  };
  const token = (fields: Raw) => (raw: Raw) =>
    Object.assign(raw, { tokens: [{ ...WTRX, ...fields }] });

  function both(change: (raw: Raw) => void): { schema: boolean; loader: unknown } {
    const raw = base();
    change(raw);
    // Through YAML, as a file is read.
    const text = stringify(raw);
    let loader: unknown = null;
    try {
      loadConfig(text, ENV);
    } catch (error) {
      loader = error;
    }
    return { schema: validate(parse(text)), loader };
  }

  const accepted: [string, (raw: Raw) => void][] = [
    ['the base config', () => {}],
    ['one provider by name', (raw) => Object.assign(prices(raw), { providers: 'coingecko' })],
    [
      'an entry with no settings',
      (raw) => Object.assign(prices(raw), { providers: [{ coingecko: null }] }),
    ],
    [
      'an entry with settings, label and serial',
      (raw) =>
        Object.assign(prices(raw), {
          providers: [
            'coinpaprika',
            { coingecko: { demo_api_key: '${KEY}', label: 'cg', serial: true } },
          ],
        }),
    ],
    [
      'a password login',
      (raw) => Object.assign(actual(raw), { auth: { password: '${ACTUAL_PASSWORD}' } }),
    ],
    [
      'an encryption password',
      (raw) => Object.assign(actual(raw), { encryption_password: '${ENCRYPTION}' }),
    ],
    ['a chain with no settings', (raw) => Object.assign(raw, { chains: { tron: null } })],
    [
      'explorers with settings',
      (raw) =>
        Object.assign(raw, {
          chains: {
            bitcoin: { explorers: [{ 'mempool-space': { api_url: 'http://mempool.lan/api' } }] },
          },
        }),
    ],
    ['wallets as a list', (raw) => Object.assign(account(raw), { wallets: ['${TRON_WALLET}'] })],
    ['a custom token with a built-in symbol', token({ symbol: 'USDT' })],
    [
      'a custom token in an account',
      (raw) => {
        token({})(raw);
        Object.assign(account(raw), { token: 'WTRX' });
      },
    ],
  ];

  const refused: [string, (raw: Raw) => void][] = [
    ['an unknown top-level key', (raw) => Object.assign(raw, { extra: 1 })],
    ['no actual', (raw) => delete raw.actual],
    ['no prices', (raw) => delete raw.prices],
    ['no accounts', (raw) => delete raw.accounts],
    ['actual: an unknown key', (raw) => Object.assign(actual(raw), { url: 'x' })],
    ['actual: no server_url', (raw) => delete actual(raw).server_url],
    [
      'actual: a server_url that is not http',
      (raw) => Object.assign(actual(raw), { server_url: 'ftp://x' }),
    ],
    ['actual: no sync_id', (raw) => delete actual(raw).sync_id],
    ['auth: no method', (raw) => Object.assign(actual(raw), { auth: {} })],
    [
      'auth: two methods',
      (raw) =>
        Object.assign(actual(raw), {
          auth: { session: '${ACTUAL_SESSION_TOKEN}', password: '${ACTUAL_PASSWORD}' },
        }),
    ],
    [
      'auth: a secret, not ${VAR}',
      (raw) => Object.assign(actual(raw), { auth: { session: 'abc' } }),
    ],
    [
      'auth: an unknown method',
      (raw) => Object.assign(actual(raw), { auth: { token: '${ACTUAL_PASSWORD}' } }),
    ],
    ['prices: no currency', (raw) => delete prices(raw).currency],
    [
      'prices: a currency that is not a code',
      (raw) => Object.assign(prices(raw), { currency: 'euro' }),
    ],
    ['providers: an empty list', (raw) => Object.assign(prices(raw), { providers: [] })],
    [
      'providers: an unknown provider',
      (raw) => Object.assign(prices(raw), { providers: ['kraken'] }),
    ],
    [
      'providers: an entry with two names',
      (raw) => Object.assign(prices(raw), { providers: [{ coingecko: null, coinpaprika: null }] }),
    ],
    [
      'providers: an unknown setting',
      (raw) => Object.assign(prices(raw), { providers: [{ coingecko: { api_kye: 'x' } }] }),
    ],
    [
      'providers: a setting that is a list',
      (raw) => Object.assign(prices(raw), { providers: [{ coingecko: { api_url: ['a'] } }] }),
    ],
    [
      'providers: serial that is not true or false',
      (raw) => Object.assign(prices(raw), { providers: [{ coingecko: { serial: 'yes' } }] }),
    ],
    [
      'providers: both CoinGecko keys',
      (raw) =>
        Object.assign(prices(raw), {
          providers: [{ coingecko: { demo_api_key: '${KEY}', pro_api_key: '${KEY}' } }],
        }),
    ],
    ['chains: an unknown chain', (raw) => Object.assign(raw, { chains: { ethereum: null } })],
    [
      "chains: another chain's explorer",
      (raw) => Object.assign(raw, { chains: { tron: { explorers: ['mempool-space'] } } }),
    ],
    [
      'chains: an unknown key',
      (raw) => Object.assign(raw, { chains: { tron: { explorer: 'trongrid' } } }),
    ],
    ['tokens: not a list', (raw) => Object.assign(raw, { tokens: { WTRX } })],
    [
      'tokens: no contract',
      (raw) => Object.assign(raw, { tokens: [{ ...WTRX, contract: undefined }] }),
    ],
    ['tokens: a lower-case symbol', token({ symbol: 'wtrx' })],
    ['tokens: a chain without tokens', token({ chain: 'bitcoin' })],
    ['tokens: decimals over 255', token({ decimals: 256 })],
    ['tokens: no price ids', token({ price_ids: {} })],
    ['tokens: an unknown price provider', token({ price_ids: { kraken: 'x' } })],
    ['tokens: an unknown key', token({ name: 'Wrapped TRX' })],
    ['accounts: an empty list', (raw) => Object.assign(raw, { accounts: [] })],
    [
      'accounts: an unknown key',
      (raw) => Object.assign(account(raw), { wallet: '${TRON_WALLET}' }),
    ],
    ['accounts: no wallets', (raw) => delete account(raw).wallets],
    ['accounts: no token', (raw) => delete account(raw).token],
    ['accounts: an unknown chain', (raw) => Object.assign(account(raw), { chain: 'ethereum' })],
    ['accounts: a lower-case token', (raw) => Object.assign(account(raw), { token: 'trx' })],
    ['accounts: an empty wallet list', (raw) => Object.assign(account(raw), { wallets: [] })],
    [
      'accounts: two wallets',
      (raw) => Object.assign(account(raw), { wallets: [TRON_WALLET, TRON_WALLET_2] }),
    ],
  ];

  for (const [name, change] of accepted) {
    test(`both accept ${name}`, () => {
      const { schema, loader } = both(change);
      assert.equal(loader, null, String(loader));
      assert.ok(schema, JSON.stringify(validate.errors, null, 2));
    });
  }

  // Any symbol passes the schema: the loader knows the tokens of each chain.
  for (const [name, symbol] of [
    ['an unknown token', 'NOPE'],
    ['a token of another chain', 'BTC'],
  ]) {
    test(`only the loader refuses ${name} in an account`, () => {
      const { schema, loader } = both((raw) => Object.assign(account(raw), { token: symbol }));
      assert.ok(loader instanceof ConfigError, `the loader accepted it: ${String(loader)}`);
      assert.ok(schema, JSON.stringify(validate.errors, null, 2));
    });
  }

  for (const [name, change] of refused) {
    test(`both refuse ${name}`, () => {
      const { schema, loader } = both(change);
      assert.ok(loader instanceof ConfigError, `the loader accepted it: ${String(loader)}`);
      assert.equal(schema, false, 'the schema accepted it');
    });
  }
});
