import type { Chain } from '../../types.ts';
import { isValidEvmAddress, normalizeEvmAddress } from '../evm/address.ts';
import { etherscanExplorer } from '../evm/etherscan.ts';
import { jsonRpcExplorer } from '../evm/jsonrpc.ts';

const CHAIN_ID = 56;

/** BNB Smart Chain: an EVM chain, so it shares Ethereum's address check and explorers. */
export const bsc: Chain = {
  id: 'bsc',
  nativeSymbol: 'BNB',
  supportsTokens: true,
  isValidAddress: isValidEvmAddress,
  normalizeAddress: normalizeEvmAddress,
  explorers: {
    'json-rpc': jsonRpcExplorer({ defaultUrl: 'https://bsc-rpc.publicnode.com' }),
    // Etherscan's free tier doesn't cover chain 56: it takes a paid plan's key.
    etherscan: etherscanExplorer({ chainId: CHAIN_ID }),
  },
  // There is no public Blockscout for BNB Smart Chain, and etherscan needs a key.
  defaultExplorers: ['json-rpc'],
};
