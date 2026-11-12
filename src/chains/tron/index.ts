import type { Chain } from '../../types.ts';
import { decodeBase58Check } from '../base58check.ts';
import { trongrid } from './trongrid.ts';

// A TRON address is base58check of 0x41 and a 20-byte account id: `T` and 33 characters.
const ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const VERSION = 0x41;

export const tron: Chain = {
  id: 'tron',
  nativeSymbol: 'TRX',
  supportsTokens: true,
  isValidAddress(address) {
    if (!ADDRESS.test(address)) {
      return false;
    }
    const payload = decodeBase58Check(address);
    return payload?.length === 21 && payload[0] === VERSION;
  },
  explorers: { trongrid },
  defaultExplorers: ['trongrid'],
};
