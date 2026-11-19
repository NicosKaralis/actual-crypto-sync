import { readFileSync } from 'node:fs';

import { parseDocument, type ScalarTag } from 'yaml';

import type { ChainId, Token } from './types.ts';

/** Notes show at most 8 decimals; tokens with fewer show them all. */
export const MAX_DISPLAY_DECIMALS = 8;
const MAX_DECIMALS = 255;
// Notes are parsed by symbol (format.ts), so it can't hold spaces or punctuation.
const SYMBOL = /^[A-Z0-9]+$/;
const TOKEN_KEYS = ['symbol', 'contract', 'decimals', 'display_decimals', 'price_ids'];

export function defaultDisplayDecimals(decimals: number): number {
  return Math.min(decimals, MAX_DISPLAY_DECIMALS);
}

/** A problem with a token entry, at `path` (`tron[1].decimals`, `tokens[0].symbol`). */
export class TokenError extends Error {
  readonly path: string;
  readonly detail: string;

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = 'TokenError';
    this.path = path;
    this.detail = detail;
  }
}

/** `chain: !import <path>` in tokens.yml: the chain's list is in that file. */
class TokenImport {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }
}

const IMPORT_TAG: ScalarTag = { tag: '!import', resolve: (path) => new TokenImport(path) };
// Only tokens.yml imports, so an imported file can't import again (no cycles).
const NO_IMPORT_TAG: ScalarTag = {
  tag: '!import',
  resolve: (_path, onError) => {
    onError('!import is only allowed in tokens.yml');
    return null;
  },
};
// Relative, segments that start with a letter or digit (no `.`, `..`, empty or
// hidden ones), and a .yml or .yaml file.
const IMPORT_PATH = /^[A-Za-z0-9][\w.-]*(?:\/[A-Za-z0-9][\w.-]*)*\.ya?ml$/;

/**
 * One token entry, from `tokens.yml` or the config's `tokens:`. An entry with
 * a `contract` is a contract token, one without is the chain's native token.
 */
export function readToken(
  raw: unknown,
  path: string,
  chain: ChainId,
  extraKeys: readonly string[] = [],
): Token {
  const entry = map(raw, path);
  const allowed = [...extraKeys, ...TOKEN_KEYS];
  for (const key of Object.keys(entry)) {
    if (!allowed.includes(key)) {
      throw new TokenError(`${path}.${key}`, `unknown key; expected ${listOr(allowed)}`);
    }
  }

  const symbol = string(required(entry.symbol, `${path}.symbol`), `${path}.symbol`);
  if (!SYMBOL.test(symbol)) {
    throw new TokenError(`${path}.symbol`, 'use only upper-case letters and digits (A-Z, 0-9)');
  }
  const contract =
    entry.contract === undefined || entry.contract === null
      ? undefined
      : nonEmpty(entry.contract, `${path}.contract`);
  const decimals = integer(
    required(entry.decimals, `${path}.decimals`),
    `${path}.decimals`,
    MAX_DECIMALS,
  );
  const displayDecimals =
    entry.display_decimals === undefined || entry.display_decimals === null
      ? defaultDisplayDecimals(decimals)
      : integer(entry.display_decimals, `${path}.display_decimals`, decimals);

  const rawPriceIds = map(required(entry.price_ids, `${path}.price_ids`), `${path}.price_ids`);
  if (Object.keys(rawPriceIds).length === 0) {
    throw new TokenError(`${path}.price_ids`, 'list at least one price id');
  }
  const priceIds: Record<string, string> = {};
  for (const [provider, id] of Object.entries(rawPriceIds)) {
    priceIds[provider] = nonEmpty(id, `${path}.price_ids.${provider}`);
  }

  return contract === undefined
    ? { chain, symbol, kind: 'native', decimals, displayDecimals, priceIds }
    : { chain, symbol, kind: 'contract', contract, decimals, displayDecimals, priceIds };
}

/** A symbol or a contract used twice on one chain would make tokens ambiguous. */
export function checkUnique(token: Token, others: readonly Token[], path: string) {
  const onChain = others.filter((other) => other.chain === token.chain);
  if (onChain.some((other) => other.symbol === token.symbol)) {
    throw new TokenError(`${path}.symbol`, `${token.symbol} is already defined on ${token.chain}`);
  }
  const sameContract =
    token.contract === undefined
      ? undefined
      : onChain.find((other) => other.contract === token.contract);
  if (sameContract) {
    throw new TokenError(`${path}.contract`, `already used by ${sameContract.symbol}`);
  }
}

/**
 * The token database: a map of chain id to its tokens, exactly one of them
 * native. A chain's list can be `!import <path>` when `readImport` reads that
 * path. Errors start with the name of the file that has the problem: `source`,
 * or the import path.
 */
export function parseTokens(
  text: string,
  source: string,
  readImport?: (path: string) => string,
): Token[] {
  try {
    const tokens: Token[] = [];
    for (const [chain, value] of Object.entries(map(readYaml(text, IMPORT_TAG), 'file'))) {
      if (!(value instanceof TokenImport)) {
        readChain(value, chain, tokens);
        continue;
      }
      if (readImport === undefined) {
        throw new TokenError(chain, "!import isn't allowed in this file");
      }
      if (!IMPORT_PATH.test(value.path)) {
        throw new TokenError(
          chain,
          '!import needs a relative path to a .yml or .yaml file, such as tokens/tron.yml',
        );
      }
      let imported: string;
      try {
        imported = readImport(value.path);
      } catch {
        throw new TokenError(chain, `can't read ${value.path}`);
      }
      try {
        readChain(readYaml(imported, NO_IMPORT_TAG), chain, tokens);
      } catch (error) {
        if (error instanceof TokenError) {
          throw new Error(`${value.path}: ${error.message}`);
        }
        throw error;
      }
    }
    return tokens;
  } catch (error) {
    if (error instanceof TokenError) {
      throw new Error(`${source}: ${error.message}`);
    }
    throw error;
  }
}

/** A YAML file's content. Unknown tags are errors too, not plain strings. */
function readYaml(text: string, importTag: ScalarTag): unknown {
  const doc = parseDocument(text, { uniqueKeys: true, customTags: [importTag] });
  const [problem] = [...doc.errors, ...doc.warnings];
  if (problem) {
    throw new TokenError('file', problem.message.split('\n')[0]?.replace(/:$/, '') ?? '');
  }
  const raw: unknown = doc.toJS();
  if (raw === null || raw === undefined) {
    throw new TokenError('file', 'is empty');
  }
  return raw;
}

/** One chain's list, added to `tokens`. */
function readChain(list: unknown, chain: ChainId, tokens: Token[]) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new TokenError(chain, 'expected a list of tokens');
  }
  list.forEach((entry: unknown, index) => {
    const path = `${chain}[${index}]`;
    const token = readToken(entry, path, chain);
    checkUnique(token, tokens, path);
    if (token.kind === 'native' && tokens.some((t) => t.chain === chain && t.kind === 'native')) {
      throw new TokenError(path, `${chain} already has a native token; set contract`);
    }
    tokens.push(token);
  });
  if (!tokens.some((token) => token.chain === chain && token.kind === 'native')) {
    throw new TokenError(chain, 'list the native token (the one without a contract)');
  }
}

/** The built-in token list, at the root of the project. */
export const TOKENS_FILE = new URL('../tokens.yml', import.meta.url);

/** The token database in `file`, whose `!import` paths are relative to it. */
export function loadTokens(file: URL, source: string): Token[] {
  return parseTokens(readFileSync(file, 'utf8'), source, (path) =>
    readFileSync(new URL(path, file), 'utf8'),
  );
}

/**
 * Popular tokens, picked in the config by symbol, read from `tokens.yml` and
 * the files it imports when the program starts. Adding one is an entry there.
 */
export const BUILTIN_TOKENS: readonly Token[] = loadTokens(TOKENS_FILE, 'tokens.yml');

/** How quotes are keyed: `tron:USDT`. */
export function tokenKey(token: Token): string {
  return `${token.chain}:${token.symbol}`;
}

export function findBuiltinToken(
  chain: ChainId,
  symbol: string,
  builtins: readonly Token[] = BUILTIN_TOKENS,
): Token | undefined {
  return builtins.find((token) => token.chain === chain && token.symbol === symbol);
}

/** A built-in token, or one defined in the config's `tokens:`, on that chain. */
export function resolveToken(
  chain: ChainId,
  symbol: string,
  customTokens: readonly Token[],
  builtins: readonly Token[] = BUILTIN_TOKENS,
): Token {
  // A custom token with a built-in symbol replaces the built-in one.
  const token =
    customTokens.find((custom) => custom.chain === chain && custom.symbol === symbol) ??
    findBuiltinToken(chain, symbol, builtins);
  if (!token) {
    throw new Error(`"${symbol}" isn't built in on ${chain}; define it in tokens:`);
  }
  return token;
}

function map(value: unknown, path: string): Record<string, unknown> {
  if (value instanceof TokenImport) {
    throw new TokenError(path, "!import must be a chain's whole list");
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TokenError(path, 'expected a map');
  }
  return value as Record<string, unknown>;
}

function required(value: unknown, path: string): unknown {
  if (value === undefined || value === null) {
    throw new TokenError(path, 'required');
  }
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new TokenError(path, 'expected a string');
  }
  return value;
}

function nonEmpty(value: unknown, path: string): string {
  const text = string(value, path);
  if (text === '') {
    throw new TokenError(path, 'must not be empty');
  }
  return text;
}

function integer(value: unknown, path: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new TokenError(path, `expected an integer from 0 to ${max}`);
  }
  return value;
}

function listOr(items: readonly string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
