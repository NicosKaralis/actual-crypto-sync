import assert from 'node:assert/strict';
import { test } from 'node:test';

import { USAGE } from '../src/main.ts';

test('the CLI module loads and exposes its usage', () => {
  const usage: string = USAGE;
  assert.match(usage, /^Usage: actual-crypto-sync/);
});
