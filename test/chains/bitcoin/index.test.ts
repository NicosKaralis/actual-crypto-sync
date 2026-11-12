import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { bitcoin } from '../../../src/chains/bitcoin/index.ts';
import {
  BTC_BECH32M_VECTOR,
  BTC_P2PKH_WALLET,
  BTC_P2SH_WALLET,
  BTC_WALLET,
  TRON_WALLET,
} from '../../fakes.ts';

/** The address with the character at `index` replaced by `char`. */
function swap(address: string, index: number, char: string): string {
  return address.slice(0, index) + char + address.slice(index + 1);
}

describe('bitcoin', () => {
  test('BTC is native, and it has no tokens', () => {
    assert.equal(bitcoin.id, 'bitcoin');
    assert.equal(bitcoin.nativeSymbol, 'BTC');
    assert.equal(bitcoin.supportsTokens, false);
    assert.deepEqual(bitcoin.defaultExplorers, ['mempool-space']);
    assert.equal(bitcoin.explorers['mempool-space']?.id, 'mempool-space');
  });

  test('accepts P2PKH, P2SH, bech32 and bech32m addresses', () => {
    for (const address of [BTC_P2PKH_WALLET, BTC_P2SH_WALLET, BTC_WALLET, BTC_BECH32M_VECTOR]) {
      assert.equal(bitcoin.isValidAddress(address), true, address);
    }
  });

  test('bech32 addresses may be all upper case', () => {
    assert.equal(bitcoin.isValidAddress(BTC_WALLET.toUpperCase()), true);
    assert.equal(bitcoin.isValidAddress(BTC_BECH32M_VECTOR.toUpperCase()), true);
  });

  test('rejects a bad base58check checksum', () => {
    assert.equal(bitcoin.isValidAddress(swap(BTC_P2PKH_WALLET, 33, 'Q')), false);
    assert.equal(bitcoin.isValidAddress(swap(BTC_P2SH_WALLET, 10, 'z')), false);
  });

  test('rejects a bad bech32 or bech32m checksum', () => {
    assert.equal(bitcoin.isValidAddress(swap(BTC_WALLET, 41, 'q')), false);
    assert.equal(bitcoin.isValidAddress(swap(BTC_BECH32M_VECTOR, 20, 'q')), false);
  });

  test('rejects a witness version with the other checksum', () => {
    // BIP-350 test vectors: v1 with a bech32 checksum, and v0 with a bech32m one.
    assert.equal(
      bitcoin.isValidAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd'),
      false,
    );
    assert.equal(bitcoin.isValidAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh'), false);
  });

  test('rejects other shapes', () => {
    for (const address of [
      '',
      'bc1',
      BTC_WALLET.slice(0, -1),
      `${BTC_P2PKH_WALLET}1`,
      swap(BTC_WALLET, 5, 'B'), // mixed case
      swap(BTC_WALLET, 5, 'b'), // b isn't in the bech32 alphabet
      `tb1${BTC_WALLET.slice(3)}`, // testnet
      swap(BTC_P2PKH_WALLET, 5, '0'), // 0 isn't base58
      TRON_WALLET, // valid base58check, but a TRON version byte
      ` ${BTC_WALLET}`,
      'BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P', // BIP-173 vector: a 16-byte version 0 program
    ]) {
      assert.equal(bitcoin.isValidAddress(address), false, JSON.stringify(address));
    }
  });
});
