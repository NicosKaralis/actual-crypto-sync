import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

import { stringify } from 'yaml';

import { type Config, ConfigError, loadConfig } from '../src/config.ts';
import { BTC_WALLET, fakeRegistries, TRON_WALLET, TRON_WALLET_2 } from './fakes.ts';

const SESSION = 'a8f1c2d3-0000-4000-8000-123456789abc';
const API_KEY = `actual_${'A'.repeat(43)}`;

const ENV = {
  SYNC_ID: '3f2a9c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  ACTUAL_SESSION_TOKEN: SESSION,
  TRON_WALLET,
  TRON_WALLET_2,
  BTC_WALLET,
};

type Raw = Record<string, unknown>;

function base(): Raw {
  return {
    actual: {
      server_url: 'http://actual:5006',
      sync_id: '${SYNC_ID}',
      auth: { session: '${ACTUAL_SESSION_TOKEN}' },
    },
    prices: { currency: 'eur', providers: ['coingecko'] },
    accounts: [{ name: 'TRON: TRX', chain: 'tron', token: 'TRX', wallets: ['${TRON_WALLET}'] }],
  };
}

/** Loads base() after `change` edits it; `env` is added to ENV. */
function load(change: (raw: Raw) => void = () => {}, env: Record<string, string | undefined> = {}) {
  const raw = base();
  change(raw);
  return loadConfig(stringify(raw), { ...ENV, ...env }, fakeRegistries);
}

function loadText(text: string, env: Record<string, string | undefined> = ENV) {
  return loadConfig(text, env, fakeRegistries);
}

/** Asserts a ConfigError whose message is exactly `message` (a string) or matches it (a RegExp). */
function assertConfigError(fn: () => unknown, message: string | RegExp) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ConfigError, `expected a ConfigError, got ${error}`);
    if (typeof message === 'string') {
      assert.equal(error.message, message);
    } else {
      assert.match(error.message, message);
    }
    return true;
  });
}

const actual = (raw: Raw) => raw.actual as Raw;
const prices = (raw: Raw) => raw.prices as Raw;
const accounts = (raw: Raw) => raw.accounts as Raw[];
const firstAccount = (raw: Raw) => accounts(raw)[0] as Raw;

const usdtAccount = {
  name: 'TRON: USDT',
  chain: 'tron',
  token: 'USDT',
  wallets: ['${TRON_WALLET}'],
};
const btcAccount = { name: 'Bitcoin', chain: 'bitcoin', token: 'BTC', wallets: ['${BTC_WALLET}'] };
const customToken = {
  chain: 'tron',
  symbol: 'XYZ',
  contract: TRON_WALLET_2,
  decimals: 18,
  price_ids: { coingecko: 'xyz-token' },
};

describe('loadConfig: the whole file', () => {
  test('a minimal config loads, resolved', () => {
    const config: Config = load();
    assert.deepEqual(config.actual, {
      serverURL: 'http://actual:5006',
      syncId: ENV.SYNC_ID,
      auth: { kind: 'session', token: SESSION },
    });
    assert.equal(config.prices.currency, 'eur');
    assert.deepEqual(
      config.prices.providers.map((p) => [p.label, p.provider.id, p.settings]),
      [['coingecko', 'coingecko', {}]],
    );
    assert.deepEqual(config.accounts, [
      {
        name: 'TRON: TRX',
        chain: 'tron',
        token: config.accounts[0]?.token,
        wallets: [{ address: TRON_WALLET }],
      },
    ]);
    assert.equal(config.accounts[0]?.token.symbol, 'TRX');
  });

  test('an empty file is an error', () => {
    assertConfigError(() => loadText(''), 'config: the file is empty');
  });

  test('YAML syntax errors are config errors', () => {
    assertConfigError(() => loadText('actual: [unclosed'), /^config: /);
  });

  test('a duplicate key is an error', () => {
    assertConfigError(
      () => loadText('prices:\n  currency: eur\n  currency: usd\n'),
      /^config: .*unique/i,
    );
  });

  test('the top level must be a map', () => {
    assertConfigError(() => loadText('- just\n- a list\n'), 'config: expected a map');
  });

  test('unknown keys are errors, at every level', () => {
    assertConfigError(
      () => load((raw) => Object.assign(raw, { account: [] })),
      'account: unknown key; expected actual, prices, chains, tokens or accounts',
    );
    assertConfigError(
      () => load((raw) => Object.assign(actual(raw), { server_ur: 'x' })),
      'actual.server_ur: unknown key; expected server_url, sync_id, auth or encryption_password',
    );
    assertConfigError(
      () => load((raw) => Object.assign(firstAccount(raw), { wallet: 'x' })),
      'accounts[0].wallet: unknown key; expected name, chain, token or wallets',
    );
  });

  test('required keys are named', () => {
    assertConfigError(() => load((raw) => delete raw.actual), 'actual: required');
    assertConfigError(() => load((raw) => delete actual(raw).sync_id), 'actual.sync_id: required');
    assertConfigError(
      () => load((raw) => delete prices(raw).providers),
      'prices.providers: required',
    );
    assertConfigError(() => load((raw) => delete raw.accounts), 'accounts: required');
    assertConfigError(
      () => load((raw) => Object.assign(raw, { accounts: [] })),
      'accounts: list at least one account',
    );
  });

  test('server_url must be an http(s) URL', () => {
    assertConfigError(
      () => load((raw) => Object.assign(actual(raw), { server_url: 'actual:5006' })),
      'actual.server_url: expected an http or https URL',
    );
    assert.equal(
      load((raw) => Object.assign(actual(raw), { server_url: 'https://budget.example.com/' }))
        .actual.serverURL,
      'https://budget.example.com/',
    );
  });
});

describe('loadConfig: ${VAR} substitution', () => {
  test('is replaced anywhere in a string value', () => {
    const config = load(
      (raw) => Object.assign(actual(raw), { server_url: 'http://${HOST}:5006' }),
      {
        HOST: 'actual.lan',
      },
    );
    assert.equal(config.actual.serverURL, 'http://actual.lan:5006');
  });

  test('an unset variable is an error naming it, never its value', () => {
    assertConfigError(
      () => load(() => {}, { TRON_WALLET: undefined }),
      'accounts[0].wallets[0]: environment variable TRON_WALLET is not set',
    );
  });

  test('is replaced in explorer and provider settings', () => {
    const config = load(
      (raw) =>
        Object.assign(raw, {
          chains: { tron: { explorers: [{ trongrid: { api_key: '${KEY}' } }] } },
        }),
      { KEY: 'grid-key' },
    );
    assert.deepEqual(config.chains.tron?.explorers[0]?.settings, { api_key: 'grid-key' });
  });
});

describe('loadConfig: actual.auth', () => {
  test('each method loads into its kind', () => {
    assert.deepEqual(load().actual.auth, { kind: 'session', token: SESSION });
    assert.deepEqual(
      load((raw) => Object.assign(actual(raw), { auth: { password: '${PW}' } }), { PW: 'hunter2' })
        .actual.auth,
      { kind: 'password', password: 'hunter2' },
    );
    assert.deepEqual(
      load((raw) => Object.assign(actual(raw), { auth: { api_key: '${KEY}' } }), { KEY: API_KEY })
        .actual.auth,
      { kind: 'apiKey', key: API_KEY },
    );
  });

  test('no auth, or an empty one, asks for one method', () => {
    const message = 'actual.auth: set one of session, password, api_key';
    assertConfigError(() => load((raw) => delete actual(raw).auth), message);
    assertConfigError(() => load((raw) => Object.assign(actual(raw), { auth: null })), message);
    assertConfigError(() => load((raw) => Object.assign(actual(raw), { auth: {} })), message);
  });

  test('two methods are an error', () => {
    assertConfigError(
      () =>
        load((raw) => Object.assign(actual(raw), { auth: { session: '${S}', password: '${P}' } }), {
          S: SESSION,
          P: 'hunter2',
        }),
      'actual.auth: set only one of session, password, api_key; found session, password',
    );
  });

  test('an unknown key is an error', () => {
    assertConfigError(
      () => load((raw) => Object.assign(actual(raw), { auth: { token: '${S}' } }), { S: SESSION }),
      'actual.auth.token: unknown key; expected session, password or api_key',
    );
  });

  test('a literal secret is an error that never shows it', () => {
    for (const [method, value] of [
      ['session', SESSION],
      ['password', 'hunter2'],
      ['api_key', API_KEY],
      ['password', 'prefix-${PW}'],
    ] as const) {
      assertConfigError(
        () => load((raw) => Object.assign(actual(raw), { auth: { [method]: value } }), { PW: 'x' }),
        `actual.auth.${method}: use \${VAR}, never the secret itself`,
      );
    }
  });

  test('a blank value asks for a ${VAR}, not about a secret', () => {
    for (const [method, value, example] of [
      ['session', null, 'ACTUAL_SESSION_TOKEN'],
      ['session', '', 'ACTUAL_SESSION_TOKEN'],
      ['password', null, 'ACTUAL_PASSWORD'],
      ['api_key', null, 'ACTUAL_API_KEY'],
    ] as const) {
      assertConfigError(
        () => load((raw) => Object.assign(actual(raw), { auth: { [method]: value } })),
        `actual.auth.${method}: empty; set it to a \${VAR} reference, e.g. \${${example}}`,
      );
    }
  });

  test('an empty variable is an error naming it', () => {
    assertConfigError(
      () => load(() => {}, { ACTUAL_SESSION_TOKEN: '' }),
      'actual.auth.session: ${ACTUAL_SESSION_TOKEN} is empty',
    );
  });

  test("an api_key that isn't shaped like an Actual key is an error", () => {
    assertConfigError(
      () =>
        load((raw) => Object.assign(actual(raw), { auth: { api_key: '${KEY}' } }), {
          KEY: SESSION,
        }),
      "actual.auth.api_key: ${KEY} doesn't look like an Actual API key (actual_ and 43 characters)",
    );
  });

  test('a session shaped like an Actual key points at api_key', () => {
    assertConfigError(
      () => load(() => {}, { ACTUAL_SESSION_TOKEN: API_KEY }),
      'actual.auth.session: ${ACTUAL_SESSION_TOKEN} looks like an Actual API key; set it as auth.api_key',
    );
  });

  test('no auth error message contains the secret', () => {
    const secrets = [SESSION, API_KEY, 'hunter2'];
    const cases: [Raw, Record<string, string>][] = [
      [{ session: '${S}' }, { S: API_KEY }],
      [{ api_key: '${S}' }, { S: SESSION }],
      [
        { session: '${S}', password: '${P}' },
        { S: SESSION, P: 'hunter2' },
      ],
      [{ password: 'hunter2' }, {}],
      [{ session: SESSION }, {}],
    ];
    for (const [auth, env] of cases) {
      assert.throws(
        () => load((raw) => Object.assign(actual(raw), { auth }), env),
        (error: Error) => secrets.every((secret) => !error.message.includes(secret)),
      );
    }
  });

  test('encryption_password loads beside any method, literal or ${VAR}', () => {
    assert.equal(
      load((raw) => Object.assign(actual(raw), { encryption_password: 'budget-pass' })).actual
        .encryptionPassword,
      'budget-pass',
    );
    assert.equal(
      load(
        (raw) =>
          Object.assign(actual(raw), {
            auth: { password: '${PW}' },
            encryption_password: '${ENC}',
          }),
        { PW: 'hunter2', ENC: 'budget-pass' },
      ).actual.encryptionPassword,
      'budget-pass',
    );
    assert.equal(load().actual.encryptionPassword, undefined);
  });
});

describe('loadConfig: chains and wallets', () => {
  test('an account on an unknown chain is an error', () => {
    assertConfigError(
      () => load((raw) => Object.assign(firstAccount(raw), { chain: 'ethereum' })),
      'accounts[0].chain: unknown chain "ethereum"; supported: tron, bitcoin',
    );
  });

  test("a wallet that isn't valid for the chain is an error that doesn't show it", () => {
    assertConfigError(
      () => load(() => {}, { TRON_WALLET: BTC_WALLET }),
      'accounts[0].wallets[0]: not a valid tron address',
    );
  });

  test('wallets become { address }', () => {
    assert.deepEqual(load().accounts[0]?.wallets, [{ address: TRON_WALLET }]);
  });

  test('two wallets in one account are not supported yet', () => {
    assertConfigError(
      () =>
        load((raw) =>
          accounts(raw).push(btcAccount, {
            ...usdtAccount,
            wallets: ['${TRON_WALLET}', '${TRON_WALLET_2}'],
          }),
        ),
      "accounts[2].wallets: several wallets per account isn't supported yet (see ROADMAP.md)",
    );
  });

  test('wallets may be a single address', () => {
    const config = load((raw) => Object.assign(firstAccount(raw), { wallets: '${TRON_WALLET}' }));
    assert.deepEqual(config.accounts[0]?.wallets, [{ address: TRON_WALLET }]);
  });

  test('a single address is checked too', () => {
    assertConfigError(
      () => load((raw) => Object.assign(firstAccount(raw), { wallets: 'not-an-address' })),
      'accounts[0].wallets: not a valid tron address',
    );
  });

  test('wallets as a map is an error', () => {
    assertConfigError(
      () => load((raw) => Object.assign(firstAccount(raw), { wallets: { address: 'x' } })),
      'accounts[0].wallets: expected an address or a list of addresses',
    );
  });

  test('an account needs a wallet', () => {
    assertConfigError(
      () => load((raw) => Object.assign(firstAccount(raw), { wallets: [] })),
      'accounts[0].wallets: list one wallet',
    );
  });

  test('each Actual account appears once', () => {
    assertConfigError(
      () => load((raw) => accounts(raw).push({ ...usdtAccount, name: 'TRON: TRX' })),
      'accounts[1].name: "TRON: TRX" is already used by accounts[0]',
    );
  });

  test('the same wallet in two accounts is fine', () => {
    const config = load((raw) => accounts(raw).push(usdtAccount));
    assert.deepEqual(
      config.accounts.map((a) => [a.name, a.wallets[0]?.address]),
      [
        ['TRON: TRX', TRON_WALLET],
        ['TRON: USDT', TRON_WALLET],
      ],
    );
  });
});

describe('loadConfig: providers and explorers lists', () => {
  test('a name, a list of names and a list of empty maps load the same', () => {
    const forms = ['coingecko', ['coingecko'], [{ coingecko: null }]];
    const loaded = forms.map((providers) =>
      load((raw) => Object.assign(prices(raw), { providers })).prices.providers.map((p) => [
        p.label,
        p.provider.id,
        p.settings,
      ]),
    );
    for (const result of loaded) {
      assert.deepEqual(result, [['coingecko', 'coingecko', {}]]);
    }
  });

  test('the YAML form with an empty value means no settings', () => {
    const text = stringify(base()).replace(
      /providers:\n\s+- coingecko\n/,
      'providers:\n    - coingecko:\n',
    );
    assert.match(text, /- coingecko:\n/);
    assert.deepEqual(loadText(text).prices.providers[0]?.settings, {});
  });

  test('a mixed list keeps its order and settings', () => {
    const config = load((raw) =>
      Object.assign(prices(raw), {
        currency: 'chf',
        providers: [{ other: { api_url: 'https://other.example', timeout: 5 } }, 'coingecko'],
      }),
    );
    assert.deepEqual(
      config.prices.providers.map((p) => [p.label, p.settings]),
      [
        ['other', { api_url: 'https://other.example', timeout: '5' }],
        ['coingecko', {}],
      ],
    );
  });

  test('an entry with two keys is an error', () => {
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(prices(raw), { providers: [{ coingecko: null, other: null }] }),
        ),
      'prices.providers[0]: each entry names one provider; found coingecko, other',
    );
  });

  test('an unknown provider names the supported ones', () => {
    assertConfigError(
      () => load((raw) => Object.assign(prices(raw), { providers: ['coingecko', 'kraken'] })),
      'prices.providers[1]: unknown price provider "kraken"; supported: coingecko, other',
    );
  });

  test('an empty list is an error', () => {
    assertConfigError(
      () => load((raw) => Object.assign(prices(raw), { providers: [] })),
      'prices.providers: list at least one provider',
    );
  });

  test('an unknown setting names the settings of that provider or explorer', () => {
    assertConfigError(
      () =>
        load((raw) => Object.assign(prices(raw), { providers: [{ coingecko: { api_kye: 'x' } }] })),
      'prices.providers[0].coingecko.api_kye: unknown setting; expected api_url, api_key, timeout, label or serial',
    );
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(raw, {
            chains: { tron: { explorers: [{ trongrid: { serial: true, apikey: 'k' } }] } },
          }),
        ),
      'chains.tron.explorers[0].trongrid.apikey: unknown setting; expected api_url, api_key, timeout, label or serial',
    );
  });

  test("an entry's settings are checked by its provider", () => {
    // The real registries: coingecko refuses both kinds of key at once.
    const raw = base();
    Object.assign(prices(raw), {
      providers: [{ coingecko: { demo_api_key: '${DEMO}', pro_api_key: '${PRO}' } }],
    });
    assertConfigError(
      () => loadConfig(stringify(raw), { ...ENV, DEMO: 'a', PRO: 'b' }),
      'prices.providers[0].coingecko: set only one of demo_api_key and pro_api_key',
    );
  });

  test('serial: true and false load into serial, not settings', () => {
    const config = load((raw) =>
      Object.assign(raw, {
        chains: { tron: { explorers: [{ trongrid: { serial: true, api_key: 'k' } }] } },
        prices: { currency: 'eur', providers: [{ coingecko: { serial: 'false' } }] },
      }),
    );
    const [explorer] = config.chains.tron?.explorers ?? [];
    assert.deepEqual([explorer?.serial, explorer?.settings], [true, { api_key: 'k' }]);
    const [provider] = config.prices.providers;
    assert.deepEqual([provider?.serial, provider?.settings], [false, {}]);
  });

  test('serial is off unless set', () => {
    const config = load();
    assert.equal(config.prices.providers[0]?.serial, false);
    assert.equal(config.chains.tron?.explorers[0]?.serial, false);
  });

  test('serial must be true or false', () => {
    for (const value of ['yes', 1, '']) {
      assertConfigError(
        () =>
          load((raw) =>
            Object.assign(prices(raw), { providers: [{ coingecko: { serial: value } }] }),
          ),
        'prices.providers[0].coingecko.serial: expected true or false',
      );
    }
  });

  test('two entries differing only by serial are not the same settings', () => {
    const config = load((raw) =>
      Object.assign(raw, {
        chains: { tron: { explorers: [{ trongrid: { serial: true } }, 'trongrid'] } },
      }),
    );
    assert.deepEqual(
      config.chains.tron?.explorers.map((e) => [e.label, e.serial]),
      [
        ['trongrid', true],
        ['trongrid#2', false],
      ],
    );
  });

  test('settings must be scalars', () => {
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(prices(raw), { providers: [{ coingecko: { api_url: ['a', 'b'] } }] }),
        ),
      'prices.providers[0].coingecko.api_url: expected a string',
    );
  });

  test('a chain left out gets its default explorers', () => {
    const config = load((raw) => accounts(raw).push(btcAccount));
    assert.deepEqual(
      config.chains.tron?.explorers.map((e) => [e.label, e.explorer.id, e.settings]),
      [['trongrid', 'trongrid', {}]],
    );
    assert.deepEqual(
      config.chains.bitcoin?.explorers.map((e) => e.label),
      ['mempool-space'],
    );
  });

  test('a chain with no explorers listed gets its defaults', () => {
    const config = load((raw) => Object.assign(raw, { chains: { tron: null } }));
    assert.deepEqual(
      config.chains.tron?.explorers.map((e) => e.label),
      ['trongrid'],
    );
  });

  test('explorers take the same three forms', () => {
    for (const explorers of ['trongrid', ['trongrid'], [{ trongrid: null }]]) {
      const config = load((raw) => Object.assign(raw, { chains: { tron: { explorers } } }));
      assert.deepEqual(
        config.chains.tron?.explorers.map((e) => e.label),
        ['trongrid'],
      );
    }
  });

  test("an unknown explorer names only that chain's explorers", () => {
    assertConfigError(
      () => load((raw) => Object.assign(raw, { chains: { tron: { explorers: ['nope'] } } })),
      'chains.tron.explorers[0]: unknown explorer "nope" for tron; supported: trongrid, tron-native-only',
    );
    assertConfigError(
      () =>
        load((raw) => Object.assign(raw, { chains: { tron: { explorers: ['mempool-space'] } } })),
      'chains.tron.explorers[0]: unknown explorer "mempool-space" for tron; supported: trongrid, tron-native-only',
    );
  });

  test('an unknown chain under chains: is an error', () => {
    assertConfigError(
      () => load((raw) => Object.assign(raw, { chains: { ethereum: null } })),
      'chains.ethereum: unknown chain "ethereum"; supported: tron, bitcoin',
    );
  });

  test('a repeated id with other settings is labelled #2', () => {
    const config = load((raw) => {
      accounts(raw).push(btcAccount);
      Object.assign(raw, {
        chains: {
          bitcoin: {
            explorers: [
              { 'mempool-space': { api_url: 'http://mempool.lan/api' } },
              'mempool-space',
            ],
          },
        },
      });
    });
    assert.deepEqual(
      config.chains.bitcoin?.explorers.map((e) => [e.label, e.settings]),
      [
        ['mempool-space', { api_url: 'http://mempool.lan/api' }],
        ['mempool-space#2', {}],
      ],
    );
  });

  test('a label names the entry and is not passed on as a setting', () => {
    const config = load((raw) =>
      Object.assign(raw, {
        chains: {
          bitcoin: {
            explorers: [
              { 'mempool-space': { api_url: 'http://mempool.lan/api', label: 'home-mempool' } },
              'mempool-space',
            ],
          },
        },
      }),
    );
    assert.deepEqual(
      config.chains.bitcoin?.explorers.map((e) => [e.label, e.settings]),
      [
        ['home-mempool', { api_url: 'http://mempool.lan/api' }],
        ['mempool-space', {}],
      ],
    );
  });

  test('a repeat with the same settings is an error', () => {
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(raw, {
            chains: { bitcoin: { explorers: ['mempool-space', { 'mempool-space': null }] } },
          }),
        ),
      'chains.bitcoin.explorers[1]: mempool-space is already listed with the same settings',
    );
  });

  test('two entries with the same label are an error', () => {
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(raw, {
            chains: {
              bitcoin: {
                explorers: [
                  { 'mempool-space': { label: 'mine', api_url: 'http://a/api' } },
                  { 'mempool-space': { label: 'mine', api_url: 'http://b/api' } },
                ],
              },
            },
          }),
        ),
      'chains.bitcoin.explorers[1]: the label "mine" is already used',
    );
  });
});

describe('loadConfig: currency', () => {
  test('is lowercased', () => {
    assert.equal(
      load((raw) => Object.assign(prices(raw), { currency: 'EUR' })).prices.currency,
      'eur',
    );
  });

  test('must be a 3-letter ISO 4217 code, even if a provider supports it', () => {
    assertConfigError(
      () => load((raw) => Object.assign(prices(raw), { currency: 'sats' })),
      'prices.currency: "sats" isn\'t an ISO 4217 currency code',
    );
  });

  test('must be supported by a listed provider', () => {
    assertConfigError(
      () => load((raw) => Object.assign(prices(raw), { currency: 'chf' })),
      'prices.currency: "chf" isn\'t supported by coingecko',
    );
    const config = load((raw) =>
      Object.assign(prices(raw), { currency: 'chf', providers: ['coingecko', 'other'] }),
    );
    assert.equal(config.prices.currency, 'chf');
  });
});

describe('loadConfig: tokens', () => {
  test("token: USDT on tron gets the registry's contract and price ids", () => {
    const usdt = load((raw) => accounts(raw).push(usdtAccount)).accounts[1]?.token;
    assert.equal(usdt?.contract, 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    assert.deepEqual(usdt?.priceIds, { coingecko: 'tether' });
  });

  test('an unknown token points at tokens:', () => {
    assertConfigError(
      () =>
        load((raw) => {
          accounts(raw).push(usdtAccount, { ...usdtAccount, name: 'XYZ', token: 'XYZ' });
        }),
      'accounts[2].token: "XYZ" isn\'t built in on tron; define it in tokens:',
    );
  });

  test('a custom token with every field resolves, and two accounts can use it', () => {
    const config = load((raw) =>
      Object.assign(raw, {
        tokens: [customToken],
        accounts: [
          { ...usdtAccount, name: 'XYZ 1', token: 'XYZ' },
          { ...usdtAccount, name: 'XYZ 2', token: 'XYZ', wallets: ['${TRON_WALLET_2}'] },
        ],
      }),
    );
    const expected = {
      chain: 'tron',
      symbol: 'XYZ',
      kind: 'contract',
      contract: TRON_WALLET_2,
      decimals: 18,
      displayDecimals: 8,
      priceIds: { coingecko: 'xyz-token' },
    };
    assert.deepEqual(config.accounts[0]?.token, expected);
    assert.deepEqual(config.accounts[1]?.token, expected);
  });

  test('display_decimals defaults to min(decimals, 8) and can be set', () => {
    const tokenWith = (token: Raw) =>
      load((raw) =>
        Object.assign(raw, {
          tokens: [{ ...customToken, ...token }],
          accounts: [{ ...usdtAccount, token: 'XYZ' }],
        }),
      ).accounts[0]?.token.displayDecimals;
    assert.equal(tokenWith({ decimals: 18 }), 8);
    assert.equal(tokenWith({ decimals: 6 }), 6);
    assert.equal(tokenWith({ decimals: 18, display_decimals: 4 }), 4);
    assertConfigError(
      () => tokenWith({ decimals: 6, display_decimals: 7 }),
      'tokens[0].display_decimals: expected an integer from 0 to 6',
    );
  });

  test('each field of a tokens: entry is required', () => {
    for (const field of ['chain', 'symbol', 'contract', 'decimals', 'price_ids']) {
      const token: Raw = { ...customToken };
      delete token[field];
      assertConfigError(
        () => load((raw) => Object.assign(raw, { tokens: [token] })),
        `tokens[0].${field}: required`,
      );
    }
  });

  test('decimals must be a non-negative integer', () => {
    for (const decimals of [-1, 1.5, '18']) {
      assertConfigError(
        () => load((raw) => Object.assign(raw, { tokens: [{ ...customToken, decimals }] })),
        'tokens[0].decimals: expected an integer from 0 to 255',
      );
    }
  });

  test('price_ids needs at least one id, at a known provider', () => {
    assertConfigError(
      () => load((raw) => Object.assign(raw, { tokens: [{ ...customToken, price_ids: {} }] })),
      'tokens[0].price_ids: list at least one price id',
    );
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(raw, { tokens: [{ ...customToken, price_ids: { coingeko: 'xyz' } }] }),
        ),
      'tokens[0].price_ids.coingeko: unknown price provider "coingeko"; supported: coingecko, other',
    );
  });

  test('a token none of the listed providers can price is an error', () => {
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(raw, {
            tokens: [{ ...customToken, price_ids: { other: 'xyz' } }],
            accounts: [{ ...usdtAccount, token: 'XYZ' }],
          }),
        ),
      'accounts[0].token: none of the listed price providers (coingecko) has a price id for XYZ',
    );
  });

  test('a tokens: entry on a chain without tokens is an error', () => {
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(raw, {
            tokens: [{ ...customToken, chain: 'bitcoin', contract: BTC_WALLET }],
          }),
        ),
      'tokens[0].chain: bitcoin has no tokens',
    );
  });

  test('a tokens: entry with a built-in symbol replaces the built-in token', () => {
    // Even with the built-in contract: only the custom tokens must differ.
    const usdt = { ...customToken, symbol: 'USDT', contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' };
    const config = load((raw) =>
      Object.assign(raw, {
        tokens: [usdt],
        accounts: [{ name: 'USDT', chain: 'tron', token: 'USDT', wallets: '${TRON_WALLET}' }],
      }),
    );
    assert.deepEqual(config.accounts[0]?.token.priceIds, { coingecko: 'xyz-token' });
    assert.equal(config.accounts[0]?.token.decimals, 18);
  });

  test('symbols are upper-case letters and digits, as notes need', () => {
    for (const symbol of ['xyz', 'X-Y', 'X Y', '']) {
      assertConfigError(
        () => load((raw) => Object.assign(raw, { tokens: [{ ...customToken, symbol }] })),
        'tokens[0].symbol: use only upper-case letters and digits (A-Z, 0-9)',
      );
    }
    const config = load((raw) =>
      Object.assign(raw, {
        tokens: [{ ...customToken, symbol: 'USDT0' }],
        accounts: [{ ...usdtAccount, token: 'USDT0' }],
      }),
    );
    assert.equal(config.accounts[0]?.token.symbol, 'USDT0');
  });

  test('the contract must be a valid address on the chain', () => {
    assertConfigError(
      () => load((raw) => Object.assign(raw, { tokens: [{ ...customToken, contract: '0xabc' }] })),
      'tokens[0].contract: not a valid tron address',
    );
  });

  test('a token or a contract defined twice is an error', () => {
    assertConfigError(
      () => load((raw) => Object.assign(raw, { tokens: [customToken, customToken] })),
      'tokens[1].symbol: XYZ is already defined on tron',
    );
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(raw, { tokens: [customToken, { ...customToken, symbol: 'ABC' }] }),
        ),
      'tokens[1].contract: already used by XYZ',
    );
  });

  test('a contract token needs an explorer that reads contract tokens', () => {
    assertConfigError(
      () =>
        load((raw) =>
          Object.assign(raw, {
            chains: { tron: { explorers: ['tron-native-only'] } },
            accounts: [usdtAccount],
          }),
        ),
      "accounts[0].token: USDT is a contract token, but none of tron's explorers (tron-native-only) reads contract tokens",
    );
    const trx = load((raw) =>
      Object.assign(raw, { chains: { tron: { explorers: ['tron-native-only'] } } }),
    );
    assert.equal(trx.accounts[0]?.token.symbol, 'TRX');
  });
});

describe('config.example.yml', () => {
  test('loads, with the env it names set', async () => {
    const text = await readFile(new URL('../config.example.yml', import.meta.url), 'utf8');
    // The real registries, as the tool loads it.
    const config = loadConfig(text, {
      ACTUAL_BUDGET_SYNC_ID: ENV.SYNC_ID,
      ACTUAL_SESSION_TOKEN: SESSION,
      TRON_WALLET_ADDRESS: TRON_WALLET,
      BTC_ADDRESS: BTC_WALLET,
    });
    assert.deepEqual(config.actual.auth, { kind: 'session', token: SESSION });
    assert.equal(config.prices.currency, 'eur');
    assert.deepEqual(
      config.accounts.map((a) => [a.name, a.chain, a.token.symbol, a.wallets[0]?.address]),
      [
        ['TC9F...R2MJ: TRX', 'tron', 'TRX', TRON_WALLET],
        ['WTRX Account', 'tron', 'WTRX', TRON_WALLET],
        ['Bitcoin', 'bitcoin', 'BTC', BTC_WALLET],
      ],
    );
    assert.deepEqual(
      config.chains.tron?.explorers.map((e) => e.label),
      ['trongrid'],
    );
    assert.deepEqual(
      config.chains.bitcoin?.explorers.map((e) => e.label),
      ['mempool-space'],
    );
  });
});
