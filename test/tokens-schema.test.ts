// tokens.schema.json, the JSON Schema that editors use to check tokens.yml and
// the chain files in tokens/. As for the config, the loader stays the
// authority: it also checks one native token per chain, duplicates and
// addresses. These tests keep the two in line.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { Ajv } from 'ajv';
import { parseDocument } from 'yaml';

import { CHAINS } from '../src/chains/index.ts';
import { PRICE_PROVIDERS } from '../src/prices/index.ts';
import { IMPORT_PATH, parseTokens, TOKENS_FILE } from '../src/tokens.ts';

const read = (path: string) => readFileSync(new URL(path, TOKENS_FILE), 'utf8');

const schema = JSON.parse(read('tokens.schema.json')) as {
  definitions: Record<string, Record<string, unknown>>;
};
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);

/** A token file as an editor sees it: `!import <path>` is the string `<path>`. */
function editorView(text: string): unknown {
  return parseDocument(text, {
    customTags: [{ tag: '!import', resolve: (path: string) => path }],
  }).toJS();
}

const sorted = (items: readonly string[]) => [...items].sort();

describe('tokens.schema.json', () => {
  const files = [
    'tokens.yml',
    ...readdirSync(new URL('tokens/', TOKENS_FILE)).map((f) => `tokens/${f}`),
  ];

  for (const path of files) {
    test(`${path} passes it`, () => {
      assert.ok(validate(editorView(read(path))), JSON.stringify(validate.errors, null, 2));
    });

    test(`${path} names it on its first line`, () => {
      const schemaPath = path.startsWith('tokens/')
        ? '../tokens.schema.json'
        : 'tokens.schema.json';
      assert.equal(read(path).split('\n')[0], `# yaml-language-server: $schema=${schemaPath}`);
    });
  }

  test('lists the registered chains and price providers', () => {
    const index = schema.definitions.index as { propertyNames: { enum: string[] } };
    assert.deepEqual(sorted(index.propertyNames.enum), sorted(Object.keys(CHAINS)));
    const token = schema.definitions.token as {
      properties: { price_ids: { properties: Record<string, unknown> } };
    };
    assert.deepEqual(
      sorted(Object.keys(token.properties.price_ids.properties)),
      sorted(Object.keys(PRICE_PROVIDERS)),
    );
  });

  test('checks import paths with the same pattern as the loader', () => {
    assert.equal(schema.definitions.import?.pattern, IMPORT_PATH.source);
  });
});

describe('tokens.schema.json and the loader agree on the shape', () => {
  const TRX = '{ symbol: TRX, decimals: 6, price_ids: { coingecko: tron } }';
  const USDT = (fields: string) =>
    `{ symbol: USDT, contract: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t, decimals: 6, price_ids: { coingecko: tether }${fields} }`;
  const LIST = `- ${TRX}\n- ${USDT('')}\n`;

  /** `text` as tokens.yml, with `LIST` as the only file it can import. */
  function both(text: string): { schema: boolean; loader: unknown } {
    let loader: unknown = null;
    try {
      parseTokens(text, 'tokens.yml', (path) => {
        if (path !== 'tokens/tron.yml') {
          throw new Error('ENOENT');
        }
        return LIST;
      });
    } catch (error) {
      loader = error;
    }
    return { schema: validate(editorView(text)), loader };
  }

  const accepted: [string, string][] = [
    ['an inline list', `tron:\n  - ${TRX}\n  - ${USDT('')}\n`],
    ['an import', 'tron: !import tokens/tron.yml\n'],
    ['display_decimals', `tron:\n  - ${TRX}\n  - ${USDT(', display_decimals: 2')}\n`],
  ];
  const refused: [string, string][] = [
    ['an empty list', 'tron: []\n'],
    ['an unknown key', `tron:\n  - ${TRX}\n  - ${USDT(', name: Tether')}\n`],
    [
      'a lower-case symbol',
      `tron:\n  - { symbol: trx, decimals: 6, price_ids: { coingecko: tron } }\n`,
    ],
    ['no decimals', `tron:\n  - { symbol: TRX, price_ids: { coingecko: tron } }\n`],
    [
      'decimals over 255',
      `tron:\n  - { symbol: TRX, decimals: 256, price_ids: { coingecko: tron } }\n`,
    ],
    ['no price ids', `tron:\n  - { symbol: TRX, decimals: 6, price_ids: {} }\n`],
    ['an import path with ..', 'tron: !import tokens/../tron.yml\n'],
    ['an import of a .json file', 'tron: !import tokens/tron.json\n'],
  ];
  // The loader reads any chain and provider name; the rules of the built-in
  // database (tokens.test.ts) check that each one is registered.
  const schemaOnly: [string, string][] = [
    ['an unknown chain', `solana:\n  - ${TRX}\n`],
    [
      'an unknown price provider',
      `tron:\n  - { symbol: TRX, decimals: 6, price_ids: { kraken: trx } }\n`,
    ],
    [
      'a CoinMarketCap symbol in place of a slug',
      `tron:\n  - { symbol: TRX, decimals: 6, price_ids: { coinmarketcap: TRX } }\n`,
    ],
  ];

  for (const [name, text] of accepted) {
    test(`both accept ${name}`, () => {
      const { schema, loader } = both(text);
      assert.equal(loader, null, String(loader));
      assert.ok(schema, JSON.stringify(validate.errors, null, 2));
    });
  }

  for (const [name, text] of schemaOnly) {
    test(`only the schema refuses ${name}`, () => {
      const { schema, loader } = both(text);
      assert.equal(loader, null, String(loader));
      assert.equal(schema, false, 'the schema accepted it');
    });
  }

  for (const [name, text] of refused) {
    test(`both refuse ${name}`, () => {
      const { schema, loader } = both(text);
      assert.ok(loader instanceof Error, `the loader accepted it: ${String(loader)}`);
      assert.equal(schema, false, 'the schema accepted it');
    });
  }
});
