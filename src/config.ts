import { parseDocument } from 'yaml';

import { CHAINS, getChain } from './chains/index.ts';
import { getPriceProvider, PRICE_PROVIDERS } from './prices/index.ts';
import {
  BUILTIN_TOKENS,
  defaultDisplayDecimals,
  findBuiltinToken,
  resolveToken,
} from './tokens.ts';
import type { Chain, ChainId, Currency, Explorer, PriceProvider, Token, Wallet } from './types.ts';

export type ActualAuth =
  | { kind: 'session'; token: string }
  | { kind: 'password'; password: string }
  | { kind: 'apiKey'; key: string };

export interface Config {
  actual: { serverURL: string; syncId: string; auth: ActualAuth; encryptionPassword?: string };
  prices: {
    currency: Currency;
    providers: { label: string; provider: PriceProvider; settings: Record<string, string> }[];
  };
  chains: Record<
    ChainId,
    {
      chain: Chain;
      explorers: { label: string; explorer: Explorer; settings: Record<string, string> }[];
    }
  >;
  accounts: { name: string; chain: ChainId; token: Token; wallets: Wallet[] }[];
}

export interface Registries {
  chains: Readonly<Record<ChainId, Chain>>;
  priceProviders: Readonly<Record<string, PriceProvider>>;
}

type Env = Record<string, string | undefined>;
type RawMap = Record<string, unknown>;

/** A config problem, as `<path>: <message>`. Never holds a secret's value. */
export class ConfigError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ConfigError';
  }
}

const AUTH_METHODS = ['session', 'password', 'api_key'] as const;
// The names config.example.yml uses, suggested when a method is left blank.
const EXAMPLE_VARS = {
  session: 'ACTUAL_SESSION_TOKEN',
  password: 'ACTUAL_PASSWORD',
  api_key: 'ACTUAL_API_KEY',
} as const;
const VAR_REF = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const VAR_ANYWHERE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const ACTUAL_API_KEY = /^actual_[A-Za-z0-9_-]{43}$/;
// Notes are written and parsed with 3-letter codes only (format.ts), whatever a provider supports.
const ISO_CURRENCY = /^[a-z]{3}$/;
const SYMBOL = /^[A-Z0-9]+$/;
const MAX_DECIMALS = 255;

/** Reads the YAML config, substitutes `${VAR}` from `env`, and checks and resolves it. */
export function loadConfig(
  text: string,
  env: Env,
  registries: Registries = { chains: CHAINS, priceProviders: PRICE_PROVIDERS },
): Config {
  const doc = parseDocument(text, { uniqueKeys: true });
  const [syntaxError] = doc.errors;
  if (syntaxError) {
    // Only the first line: the rest quotes the file, which may hold a secret.
    throw new ConfigError('config', syntaxError.message.split('\n')[0]?.replace(/:$/, '') ?? '');
  }
  const raw: unknown = doc.toJS();
  if (raw === null || raw === undefined) {
    throw new ConfigError('config', 'the file is empty');
  }
  if (!isMap(raw)) {
    throw new ConfigError('config', 'expected a map');
  }
  return new Loader(env, registries).load(raw);
}

class Loader {
  readonly env: Env;
  readonly registries: Registries;

  constructor(env: Env, registries: Registries) {
    this.env = env;
    this.registries = registries;
  }

  load(raw: RawMap): Config {
    checkKeys(raw, '', ['actual', 'prices', 'chains', 'tokens', 'accounts']);
    const actual = this.actual(required(raw.actual, 'actual'));
    const prices = this.prices(required(raw.prices, 'prices'));
    const chains = this.chains(raw.chains);
    const tokens = this.tokens(raw.tokens);
    const accounts = this.accounts(required(raw.accounts, 'accounts'), prices, chains, tokens);
    return { actual, prices, chains, accounts };
  }

  actual(value: unknown): Config['actual'] {
    const raw = map(value, 'actual');
    checkKeys(raw, 'actual', ['server_url', 'sync_id', 'auth', 'encryption_password']);
    const serverURL = this.str(required(raw.server_url, 'actual.server_url'), 'actual.server_url');
    if (!isHttpURL(serverURL)) {
      throw new ConfigError('actual.server_url', 'expected an http or https URL');
    }
    const syncId = this.nonEmpty(required(raw.sync_id, 'actual.sync_id'), 'actual.sync_id');
    const auth = this.auth(raw.auth);
    if (raw.encryption_password === undefined || raw.encryption_password === null) {
      return { serverURL, syncId, auth };
    }
    const encryptionPassword = this.nonEmpty(raw.encryption_password, 'actual.encryption_password');
    return { serverURL, syncId, auth, encryptionPassword };
  }

  auth(value: unknown): ActualAuth {
    const path = 'actual.auth';
    const none = `set one of ${AUTH_METHODS.join(', ')}`;
    if (value === undefined || value === null) {
      throw new ConfigError(path, none);
    }
    const raw = map(value, path);
    checkKeys(raw, path, AUTH_METHODS);
    const methods = AUTH_METHODS.filter((method) => raw[method] !== undefined);
    if (methods.length === 0) {
      throw new ConfigError(path, none);
    }
    if (methods.length > 1) {
      throw new ConfigError(
        path,
        `set only one of ${AUTH_METHODS.join(', ')}; found ${methods.join(', ')}`,
      );
    }
    const method = methods[0] as (typeof AUTH_METHODS)[number];
    const methodPath = `${path}.${method}`;
    const ref = raw[method];
    if (ref === null || ref === '') {
      throw new ConfigError(
        methodPath,
        `empty; set it to a \${VAR} reference, e.g. \${${EXAMPLE_VARS[method]}}`,
      );
    }
    const name = typeof ref === 'string' ? VAR_REF.exec(ref)?.[1] : undefined;
    if (typeof ref !== 'string' || name === undefined) {
      throw new ConfigError(methodPath, 'use ${VAR}, never the secret itself');
    }
    const secret = this.variable(name, methodPath);
    if (secret === '') {
      throw new ConfigError(methodPath, `${ref} is empty`);
    }
    const looksLikeKey = ACTUAL_API_KEY.test(secret);
    switch (method) {
      case 'api_key':
        if (!looksLikeKey) {
          throw new ConfigError(
            methodPath,
            `${ref} doesn't look like an Actual API key (actual_ and 43 characters)`,
          );
        }
        return { kind: 'apiKey', key: secret };
      case 'session':
        if (looksLikeKey) {
          throw new ConfigError(
            methodPath,
            `${ref} looks like an Actual API key; set it as auth.api_key`,
          );
        }
        return { kind: 'session', token: secret };
      case 'password':
        return { kind: 'password', password: secret };
    }
  }

  prices(value: unknown): Config['prices'] {
    const raw = map(value, 'prices');
    checkKeys(raw, 'prices', ['currency', 'providers']);
    const providers = this.entries(
      required(raw.providers, 'prices.providers'),
      'prices.providers',
      'provider',
      (id, path) => at(path, () => getPriceProvider(id, this.registries.priceProviders)),
    ).map(({ label, item, settings }) => ({ label, provider: item, settings }));

    const currency = this.str(
      required(raw.currency, 'prices.currency'),
      'prices.currency',
    ).toLowerCase();
    if (!ISO_CURRENCY.test(currency)) {
      throw new ConfigError('prices.currency', `"${currency}" isn't an ISO 4217 currency code`);
    }
    if (!providers.some(({ provider }) => provider.supportsCurrency(currency))) {
      const ids = unique(providers.map(({ provider }) => provider.id));
      throw new ConfigError(
        'prices.currency',
        `"${currency}" isn't supported by ${ids.join(', ')}`,
      );
    }
    return { currency, providers };
  }

  /** The chains listed under `chains:`; the ones accounts use are added later. */
  chains(value: unknown): Config['chains'] {
    const chains: Config['chains'] = {};
    if (value === undefined || value === null) {
      return chains;
    }
    for (const [id, settings] of Object.entries(map(value, 'chains'))) {
      const path = `chains.${id}`;
      const chain = at(path, () => getChain(id, this.registries.chains));
      const raw = settings === null ? {} : map(settings, path);
      checkKeys(raw, path, ['explorers']);
      chains[id] = { chain, explorers: this.explorers(chain, raw.explorers, `${path}.explorers`) };
    }
    return chains;
  }

  explorers(chain: Chain, value: unknown, path: string): Config['chains'][ChainId]['explorers'] {
    const list = value === undefined || value === null ? chain.defaultExplorers : value;
    return this.entries(list, path, 'explorer', (id, entryPath) => {
      const explorer = Object.hasOwn(chain.explorers, id) ? chain.explorers[id] : undefined;
      if (!explorer) {
        throw new ConfigError(
          entryPath,
          `unknown explorer "${id}" for ${chain.id}; supported: ${Object.keys(chain.explorers).join(', ') || 'none'}`,
        );
      }
      return explorer;
    }).map(({ label, item, settings }) => ({ label, explorer: item, settings }));
  }

  /**
   * A providers or explorers list: a name, a list of names, or a list of names
   * and one-key maps of name to settings. Repeats are labelled `id#2`, `id#3`
   * unless they set `label`.
   */
  entries<T>(
    value: unknown,
    path: string,
    noun: string,
    lookup: (id: string, path: string) => T,
  ): { label: string; item: T; settings: Record<string, string> }[] {
    if (typeof value === 'string') {
      return this.entries([value], path, noun, (id) => lookup(id, path));
    }
    if (!Array.isArray(value)) {
      throw new ConfigError(path, `expected a ${noun} name or a list of them`);
    }
    if (value.length === 0) {
      throw new ConfigError(path, `list at least one ${noun}`);
    }
    const result: { id: string; label: string; item: T; settings: Record<string, string> }[] = [];
    const unlabelled = new Map<string, number>();
    value.forEach((entry: unknown, index) => {
      const entryPath = `${path}[${index}]`;
      let id: string;
      let settings: Record<string, string> = {};
      let label: string | undefined;
      if (isMap(entry)) {
        const keys = Object.keys(entry);
        if (keys.length !== 1) {
          throw new ConfigError(
            entryPath,
            `each entry names one ${noun}; found ${keys.join(', ') || 'none'}`,
          );
        }
        id = keys[0] as string;
        ({ settings, label } = this.settings(entry[id], `${entryPath}.${id}`));
      } else {
        id = this.nonEmpty(entry, entryPath);
      }
      const item = lookup(id, entryPath);
      if (result.some((other) => other.id === id && sameSettings(other.settings, settings))) {
        throw new ConfigError(entryPath, `${id} is already listed with the same settings`);
      }
      if (label === undefined) {
        const count = (unlabelled.get(id) ?? 0) + 1;
        unlabelled.set(id, count);
        label = count === 1 ? id : `${id}#${count}`;
      }
      if (result.some((other) => other.label === label)) {
        throw new ConfigError(entryPath, `the label "${label}" is already used`);
      }
      result.push({ id, label, item, settings });
    });
    return result.map(({ label, item, settings }) => ({ label, item, settings }));
  }

  /** Settings are scalars, passed on as strings; `label` names the entry instead. */
  settings(value: unknown, path: string): { settings: Record<string, string>; label?: string } {
    if (value === null || value === undefined) {
      return { settings: {} };
    }
    const settings: Record<string, string> = {};
    let label: string | undefined;
    for (const [key, setting] of Object.entries(map(value, path))) {
      if (!['string', 'number', 'boolean'].includes(typeof setting)) {
        throw new ConfigError(`${path}.${key}`, 'expected a string');
      }
      const text = this.substitute(String(setting), `${path}.${key}`);
      if (key === 'label') {
        label = this.nonEmpty(text, `${path}.label`);
      } else {
        settings[key] = text;
      }
    }
    return label === undefined ? { settings } : { settings, label };
  }

  tokens(value: unknown): Token[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new ConfigError('tokens', 'expected a list');
    }
    const tokens: Token[] = [];
    value.forEach((entry: unknown, index) => {
      const path = `tokens[${index}]`;
      const raw = map(entry, path);
      checkKeys(raw, path, [
        'chain',
        'symbol',
        'contract',
        'decimals',
        'display_decimals',
        'price_ids',
      ]);

      const chainId = this.str(required(raw.chain, `${path}.chain`), `${path}.chain`);
      const chain = at(`${path}.chain`, () => getChain(chainId, this.registries.chains));
      if (!chain.supportsTokens) {
        throw new ConfigError(`${path}.chain`, `${chain.id} has no tokens`);
      }

      const symbol = this.str(required(raw.symbol, `${path}.symbol`), `${path}.symbol`);
      if (!SYMBOL.test(symbol)) {
        throw new ConfigError(
          `${path}.symbol`,
          'use only upper-case letters and digits (A-Z, 0-9)',
        );
      }
      if (findBuiltinToken(chain.id, symbol)) {
        throw new ConfigError(
          `${path}.symbol`,
          `"${symbol}" is built in on ${chain.id}; remove it from tokens:`,
        );
      }
      if (tokens.some((token) => token.chain === chain.id && token.symbol === symbol)) {
        throw new ConfigError(`${path}.symbol`, `${symbol} is already defined on ${chain.id}`);
      }

      const contract = this.str(required(raw.contract, `${path}.contract`), `${path}.contract`);
      if (!chain.isValidAddress(contract)) {
        throw new ConfigError(`${path}.contract`, `not a valid ${chain.id} address`);
      }
      const sameContract = [...BUILTIN_TOKENS, ...tokens].find(
        (token) => token.chain === chain.id && token.contract === contract,
      );
      if (sameContract) {
        throw new ConfigError(`${path}.contract`, `already used by ${sameContract.symbol}`);
      }

      const decimals = integer(
        required(raw.decimals, `${path}.decimals`),
        `${path}.decimals`,
        MAX_DECIMALS,
      );
      const displayDecimals =
        raw.display_decimals === undefined || raw.display_decimals === null
          ? defaultDisplayDecimals(decimals)
          : integer(raw.display_decimals, `${path}.display_decimals`, decimals);

      const priceIds = this.priceIds(
        required(raw.price_ids, `${path}.price_ids`),
        `${path}.price_ids`,
      );
      tokens.push({
        chain: chain.id,
        symbol,
        kind: 'contract',
        contract,
        decimals,
        displayDecimals,
        priceIds,
      });
    });
    return tokens;
  }

  priceIds(value: unknown, path: string): Record<string, string> {
    const raw = map(value, path);
    if (Object.keys(raw).length === 0) {
      throw new ConfigError(path, 'list at least one price id');
    }
    const priceIds: Record<string, string> = {};
    for (const [providerId, id] of Object.entries(raw)) {
      at(`${path}.${providerId}`, () =>
        getPriceProvider(providerId, this.registries.priceProviders),
      );
      priceIds[providerId] = this.nonEmpty(id, `${path}.${providerId}`);
    }
    return priceIds;
  }

  accounts(
    value: unknown,
    prices: Config['prices'],
    chains: Config['chains'],
    customTokens: Token[],
  ): Config['accounts'] {
    if (!Array.isArray(value)) {
      throw new ConfigError('accounts', 'expected a list');
    }
    if (value.length === 0) {
      throw new ConfigError('accounts', 'list at least one account');
    }
    const providerIds = unique(prices.providers.map(({ provider }) => provider.id));
    const accounts: Config['accounts'] = [];
    value.forEach((entry: unknown, index) => {
      const path = `accounts[${index}]`;
      const raw = map(entry, path);
      checkKeys(raw, path, ['name', 'chain', 'token', 'wallets']);

      const name = this.nonEmpty(required(raw.name, `${path}.name`), `${path}.name`);
      const sameName = accounts.findIndex((account) => account.name === name);
      if (sameName !== -1) {
        throw new ConfigError(`${path}.name`, `"${name}" is already used by accounts[${sameName}]`);
      }

      const chainId = this.str(required(raw.chain, `${path}.chain`), `${path}.chain`);
      const chain = at(`${path}.chain`, () => getChain(chainId, this.registries.chains));
      chains[chain.id] ??= {
        chain,
        explorers: this.explorers(chain, undefined, `chains.${chain.id}.explorers`),
      };
      const explorers = chains[chain.id]?.explorers ?? [];

      const symbol = this.str(required(raw.token, `${path}.token`), `${path}.token`);
      const token = at(`${path}.token`, () => resolveToken(chain.id, symbol, customTokens));
      if (!providerIds.some((id) => Object.hasOwn(token.priceIds, id))) {
        throw new ConfigError(
          `${path}.token`,
          `none of the listed price providers (${providerIds.join(', ')}) has a price id for ${symbol}`,
        );
      }
      if (
        token.kind === 'contract' &&
        !explorers.some(({ explorer }) => explorer.supportsContracts)
      ) {
        throw new ConfigError(
          `${path}.token`,
          `${symbol} is a contract token, but none of ${chain.id}'s explorers (${explorers.map((e) => e.label).join(', ')}) reads contract tokens`,
        );
      }

      const wallets = this.wallets(
        required(raw.wallets, `${path}.wallets`),
        `${path}.wallets`,
        chain,
      );
      accounts.push({ name, chain: chain.id, token, wallets });
    });
    return accounts;
  }

  wallets(value: unknown, path: string, chain: Chain): Wallet[] {
    if (!Array.isArray(value)) {
      throw new ConfigError(path, 'expected a list');
    }
    if (value.length === 0) {
      throw new ConfigError(path, 'list one wallet');
    }
    if (value.length > 1) {
      throw new ConfigError(
        path,
        "several wallets per account isn't supported yet (see ROADMAP.md)",
      );
    }
    return value.map((entry: unknown, index) => {
      const address = this.str(entry, `${path}[${index}]`);
      if (!chain.isValidAddress(address)) {
        // The address isn't shown: it may be someone's wallet.
        throw new ConfigError(`${path}[${index}]`, `not a valid ${chain.id} address`);
      }
      return { address };
    });
  }

  str(value: unknown, path: string): string {
    if (typeof value !== 'string') {
      throw new ConfigError(path, 'expected a string');
    }
    return this.substitute(value, path);
  }

  nonEmpty(value: unknown, path: string): string {
    const text = this.str(value, path);
    if (text === '') {
      throw new ConfigError(path, 'must not be empty');
    }
    return text;
  }

  substitute(text: string, path: string): string {
    return text.replace(VAR_ANYWHERE, (_, name: string) => this.variable(name, path));
  }

  variable(name: string, path: string): string {
    const value = this.env[name];
    if (value === undefined) {
      throw new ConfigError(path, `environment variable ${name} is not set`);
    }
    return value;
  }
}

function isMap(value: unknown): value is RawMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function map(value: unknown, path: string): RawMap {
  if (!isMap(value)) {
    throw new ConfigError(path, 'expected a map');
  }
  return value;
}

function required(value: unknown, path: string): unknown {
  if (value === undefined || value === null) {
    throw new ConfigError(path, 'required');
  }
  return value;
}

function checkKeys(raw: RawMap, path: string, allowed: readonly string[]) {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new ConfigError(
        path ? `${path}.${key}` : key,
        `unknown key; expected ${listOr(allowed)}`,
      );
    }
  }
}

function integer(value: unknown, path: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new ConfigError(path, `expected an integer from 0 to ${max}`);
  }
  return value;
}

/** Runs `fn`, giving a registry's error the config path. */
function at<T>(path: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ConfigError || !(error instanceof Error)) {
      throw error;
    }
    throw new ConfigError(path, error.message);
  }
}

function isHttpURL(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sameSettings(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function listOr(items: readonly string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
