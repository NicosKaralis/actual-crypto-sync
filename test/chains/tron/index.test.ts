import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { tron } from '../../../src/chains/tron/index.ts';
import { BTC_P2PKH_WALLET, TRON_WALLET, TRON_WALLET_2 } from '../../fakes.ts';

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

describe('tron', () => {
  test('TRX is native, and it has tokens', () => {
    assert.equal(tron.id, 'tron');
    assert.equal(tron.nativeSymbol, 'TRX');
    assert.equal(tron.supportsTokens, true);
    assert.deepEqual(tron.defaultExplorers, ['trongrid']);
    assert.equal(tron.explorers.trongrid?.id, 'trongrid');
  });

  test('accepts wallets and contracts with a valid checksum', () => {
    for (const address of [TRON_WALLET, TRON_WALLET_2, USDT_CONTRACT]) {
      assert.equal(tron.isValidAddress(address), true, address);
    }
  });

  test('rejects a bad checksum', () => {
    // The last character changed: still base58, still 34 characters.
    assert.equal(tron.isValidAddress(`${TRON_WALLET.slice(0, -1)}K`), false);
    assert.equal(
      tron.isValidAddress(`${TRON_WALLET.slice(0, 10)}x${TRON_WALLET.slice(11)}`),
      false,
    );
  });

  test('rejects other shapes', () => {
    for (const address of [
      '',
      TRON_WALLET.slice(0, -1),
      `${TRON_WALLET}a`,
      `${TRON_WALLET.slice(0, -1)}0`, // 0 isn't base58
      TRON_WALLET.toLowerCase(),
      BTC_P2PKH_WALLET, // valid base58check, but not a TRON version byte
      ` ${TRON_WALLET}`,
    ]) {
      assert.equal(tron.isValidAddress(address), false, JSON.stringify(address));
    }
  });
});
