// The release workflow sends Docker Hub a copy of the README with text links in place of the
// badges, which Docker Hub shows one per line. It finds the badges by these marker lines.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const lines = readFileSync(new URL('../README.md', import.meta.url), 'utf8').split('\n');

test('the README marks its badges for the Docker Hub overview', () => {
  const start = lines.flatMap((line, i) => (line.startsWith('<!-- badges') ? [i] : []));
  const end = lines.flatMap((line, i) => (line.startsWith('<!-- /badges -->') ? [i] : []));
  assert.equal(start.length, 1, 'one <!-- badges --> line');
  assert.equal(end.length, 1, 'one <!-- /badges --> line');
  const [first = 0] = start;
  const [last = 0] = end;
  assert.match(lines.slice(first + 1, last).join('\n'), /<img /, 'the badges are between them');
  assert.doesNotMatch(lines.slice(last).join('\n'), /img\.shields\.io/, 'no badge after them');
});
