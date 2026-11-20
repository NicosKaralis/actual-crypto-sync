import type { Chain } from '../../types.ts';
import { isValidEvmAddress, normalizeEvmAddress } from '../evm/address.ts';
import { blockscoutExplorer } from '../evm/blockscout.ts';
import { etherscanExplorer } from '../evm/etherscan.ts';
import { jsonRpcExplorer } from '../evm/jsonrpc.ts';

const CHAIN_ID = 1;

export const ethereum: Chain = {
  id: 'ethereum',
  nativeSymbol: 'ETH',
  supportsTokens: true,
  isValidAddress: isValidEvmAddress,
  normalizeAddress: normalizeEvmAddress,
  explorers: {
    'json-rpc': jsonRpcExplorer({ defaultUrl: 'https://ethereum-rpc.publicnode.com' }),
    blockscout: blockscoutExplorer({
      defaultUrl: 'https://eth.blockscout.com/api',
      chainId: CHAIN_ID,
    }),
    etherscan: etherscanExplorer({ chainId: CHAIN_ID }),
  },
  // Neither needs a key (blockscout takes one); etherscan does, so it's used only when listed.
  defaultExplorers: ['json-rpc', 'blockscout'],
};
