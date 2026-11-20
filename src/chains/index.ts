import type { Chain, ChainId } from '../types.ts';
import { bitcoin } from './bitcoin/index.ts';
import { bsc } from './bsc/index.ts';
import { ethereum } from './ethereum/index.ts';
import { tron } from './tron/index.ts';

/** Every chain a config can use, by id. A new chain is added here. */
export const CHAINS: Readonly<Record<ChainId, Chain>> = { tron, bitcoin, ethereum, bsc };

export function getChain(id: ChainId, chains: Readonly<Record<ChainId, Chain>> = CHAINS): Chain {
  const chain = Object.hasOwn(chains, id) ? chains[id] : undefined;
  if (!chain) {
    throw new Error(
      `unknown chain "${id}"; supported: ${Object.keys(chains).join(', ') || 'none'}`,
    );
  }
  return chain;
}
