import type { PriceProvider } from '../types.ts';
import { coingecko } from './coingecko.ts';
import { coinpaprika } from './coinpaprika.ts';

/** Every price provider a config can use, by id. A new provider is added here. */
export const PRICE_PROVIDERS: Readonly<Record<string, PriceProvider>> = { coingecko, coinpaprika };

export function getPriceProvider(
  id: string,
  providers: Readonly<Record<string, PriceProvider>> = PRICE_PROVIDERS,
): PriceProvider {
  const provider = Object.hasOwn(providers, id) ? providers[id] : undefined;
  if (!provider) {
    throw new Error(
      `unknown price provider "${id}"; supported: ${Object.keys(providers).join(', ') || 'none'}`,
    );
  }
  return provider;
}
