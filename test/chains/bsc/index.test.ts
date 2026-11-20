import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bsc } from '../../../src/chains/bsc/index.ts';
import { toChecksumAddress } from '../../../src/chains/evm/address.ts';
import { BUILTIN_TOKENS } from '../../../src/tokens.ts';
import { ETH_WALLET, ETH_WALLET_2, fakeFetch, jsonResponse, TRON_WALLET } from '../../fakes.ts';

describe('bsc', () => {
  test('BNB is native, and it has tokens', () => {
    assert.equal(bsc.id, 'bsc');
    assert.equal(bsc.nativeSymbol, 'BNB');
    assert.equal(bsc.supportsTokens, true);
  });

  test('two explorers; json-rpc, which needs no key, is the default', () => {
    assert.deepEqual(Object.keys(bsc.explorers), ['json-rpc', 'etherscan']);
    assert.deepEqual(bsc.defaultExplorers, ['json-rpc']);
  });

  test('etherscan asks for chain 56', async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({ status: '1', message: 'OK', result: '0' }),
    );
    await bsc.explorers.etherscan?.getBalances({
      wallet: { address: ETH_WALLET },
      tokens: BUILTIN_TOKENS.filter((token) => token.chain === 'bsc' && token.kind === 'native'),
      settings: { api_key: 'test-key' },
      fetch,
    });
    assert.equal(new URL(calls[0]?.url ?? '').searchParams.get('chainid'), '56');
  });

  test('accepts the EVM test wallets, and EIP-55 checks mixed case', () => {
    for (const address of [ETH_WALLET, ETH_WALLET_2, ETH_WALLET.toLowerCase()]) {
      assert.equal(bsc.isValidAddress(address), true, address);
    }
    assert.equal(bsc.isValidAddress(`${ETH_WALLET.slice(0, -1)}c`), false);
    assert.equal(bsc.isValidAddress(TRON_WALLET), false);
  });

  test('normalizeAddress is lower case', () => {
    assert.equal(bsc.normalizeAddress(ETH_WALLET), ETH_WALLET.toLowerCase());
  });

  test('the built-in contracts are written in their EIP-55 spelling', () => {
    const tokens = BUILTIN_TOKENS.filter((token) => token.chain === 'bsc');
    assert.ok(tokens.length > 1);
    for (const { symbol, contract } of tokens) {
      if (contract !== undefined) {
        assert.equal(contract, toChecksumAddress(contract), symbol);
      }
    }
  });

  test('USDT and USDC have 18 decimals here, not 6 as on Ethereum', () => {
    for (const symbol of ['USDT', 'USDC']) {
      const token = BUILTIN_TOKENS.find((t) => t.chain === 'bsc' && t.symbol === symbol);
      assert.equal(token?.decimals, 18, symbol);
    }
  });
});
