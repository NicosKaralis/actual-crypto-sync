import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ethereum } from '../../../src/chains/ethereum/index.ts';
import { toChecksumAddress } from '../../../src/chains/evm/address.ts';
import { BUILTIN_TOKENS } from '../../../src/tokens.ts';
import { ETH_WALLET, ETH_WALLET_2, ETH_WALLET_3, TRON_WALLET } from '../../fakes.ts';

describe('ethereum', () => {
  test('ETH is native, and it has tokens', () => {
    assert.equal(ethereum.id, 'ethereum');
    assert.equal(ethereum.nativeSymbol, 'ETH');
    assert.equal(ethereum.supportsTokens, true);
  });

  test('three explorers; the two without a key are the default', () => {
    assert.deepEqual(Object.keys(ethereum.explorers), ['json-rpc', 'blockscout', 'etherscan']);
    assert.deepEqual(ethereum.defaultExplorers, ['json-rpc', 'blockscout']);
  });

  test('accepts the test wallets, and EIP-55 checks mixed case', () => {
    for (const address of [ETH_WALLET, ETH_WALLET_2, ETH_WALLET_3, ETH_WALLET.toLowerCase()]) {
      assert.equal(ethereum.isValidAddress(address), true, address);
    }
    assert.equal(ethereum.isValidAddress(`${ETH_WALLET.slice(0, -1)}c`), false);
    assert.equal(ethereum.isValidAddress(TRON_WALLET), false);
  });

  test('normalizeAddress is lower case', () => {
    assert.equal(ethereum.normalizeAddress(ETH_WALLET), ETH_WALLET.toLowerCase());
  });

  test('the built-in contracts are written in their EIP-55 spelling', () => {
    const tokens = BUILTIN_TOKENS.filter((token) => token.chain === 'ethereum');
    assert.ok(tokens.length > 1);
    for (const { symbol, contract } of tokens) {
      if (contract !== undefined) {
        assert.equal(contract, toChecksumAddress(contract), symbol);
      }
    }
  });
});
