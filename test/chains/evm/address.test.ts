import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  isValidEvmAddress,
  normalizeEvmAddress,
  toChecksumAddress,
} from '../../../src/chains/evm/address.ts';
import { ETH_WALLET, ETH_WALLET_2, ETH_WALLET_3, TRON_WALLET } from '../../fakes.ts';

// The test vectors from EIP-55.
const MIXED_CASE = [
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
];
const ALL_UPPER = [
  '0x52908400098527886E0F7030069857D2E4169EE7',
  '0x8617E340B3D01FA5F11F306F4090FD50E238070D',
];
const ALL_LOWER = [
  '0xde709f2102306220921060314715629080e2fb77',
  '0x27b1fdb04752bbc536007a920d24acb045561c26',
];

describe('isValidEvmAddress', () => {
  test('accepts the EIP-55 vectors and the test wallets', () => {
    for (const address of [
      ...MIXED_CASE,
      ...ALL_UPPER,
      ...ALL_LOWER,
      ETH_WALLET,
      ETH_WALLET_2,
      ETH_WALLET_3,
    ]) {
      assert.equal(isValidEvmAddress(address), true, address);
    }
  });

  test('accepts an address without its checksum, in lower or upper case', () => {
    assert.equal(isValidEvmAddress(ETH_WALLET.toLowerCase()), true);
    assert.equal(isValidEvmAddress(`0x${ETH_WALLET.slice(2).toUpperCase()}`), true);
  });

  test('rejects mixed case that is not the checksum: a typo', () => {
    for (const address of MIXED_CASE) {
      // One letter's case swapped.
      const index = address.search(/[a-fA-F]/);
      const char = address[index] ?? '';
      const swapped = char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase();
      const typo = `${address.slice(0, index)}${swapped}${address.slice(index + 1)}`;
      assert.equal(isValidEvmAddress(typo), false, typo);
    }
  });

  test('rejects other shapes', () => {
    for (const address of [
      '',
      ETH_WALLET.slice(2), // no 0x
      ETH_WALLET.slice(0, -1),
      `${ETH_WALLET}0`,
      `0X${ETH_WALLET.slice(2)}`,
      `${ETH_WALLET.slice(0, -1)}g`,
      ` ${ETH_WALLET}`,
      TRON_WALLET,
    ]) {
      assert.equal(isValidEvmAddress(address), false, JSON.stringify(address));
    }
  });
});

describe('toChecksumAddress', () => {
  test('gives the EIP-55 spelling from any case', () => {
    for (const address of MIXED_CASE) {
      assert.equal(toChecksumAddress(address.toLowerCase()), address);
      assert.equal(toChecksumAddress(`0x${address.slice(2).toUpperCase()}`), address);
    }
  });
});

describe('normalizeEvmAddress', () => {
  test('is lower case, so one wallet has one spelling', () => {
    assert.equal(normalizeEvmAddress(ETH_WALLET), ETH_WALLET.toLowerCase());
    assert.equal(
      normalizeEvmAddress(`0x${ETH_WALLET.slice(2).toUpperCase()}`),
      ETH_WALLET.toLowerCase(),
    );
  });
});
