import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError, postJson } from '../src/http.ts';
import { fakeFetch, jsonResponse } from './fakes.ts';

describe('postJson', () => {
  test('sends the body as JSON and parses the answer', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    const body = await postJson('rpc', 'https://rpc.example/', fetch, [{ id: 1 }], {
      authorization: 'Bearer x',
    });
    assert.deepEqual(body, { ok: true });
    assert.equal(calls[0]?.method, 'POST');
    assert.equal(calls[0]?.body, '[{"id":1}]');
    assert.equal(calls[0]?.headers['content-type'], 'application/json');
    assert.equal(calls[0]?.headers.authorization, 'Bearer x');
  });

  test('an HTTP error is an ApiError with the status and body, and no URL', async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ error: 'slow down' }, 429));
    await assert.rejects(
      postJson('rpc', 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161', fetch, {}),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.message, 'rpc: HTTP 429');
        assert.equal(error.status, 429);
        assert.deepEqual(error.body, { error: 'slow down' });
        return true;
      },
    );
  });

  test('a network error names only the service and the code', async () => {
    const fetch = (() =>
      Promise.reject(
        new TypeError('fetch failed https://mainnet.infura.io/v3/secret', {
          cause: { code: 'ENOTFOUND' },
        }),
      )) as typeof globalThis.fetch;
    await assert.rejects(postJson('rpc', 'https://rpc.example/', fetch, {}), {
      message: 'rpc: request failed (ENOTFOUND)',
    });
  });
});
