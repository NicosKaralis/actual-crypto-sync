import type { Chain, ChainId } from '../types.ts';

/** Every chain a config can use, by id. Each chain registers itself here. */
export const CHAINS: Readonly<Record<ChainId, Chain>> = {};

export function getChain(id: ChainId, chains: Readonly<Record<ChainId, Chain>> = CHAINS): Chain {
  const chain = Object.hasOwn(chains, id) ? chains[id] : undefined;
  if (!chain) {
    throw new Error(
      `unknown chain "${id}"; supported: ${Object.keys(chains).join(', ') || 'none'}`,
    );
  }
  return chain;
}
