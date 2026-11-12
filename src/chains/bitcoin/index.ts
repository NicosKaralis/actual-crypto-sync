import type { Chain } from '../../types.ts';
import { decodeBase58Check } from '../base58check.ts';
import { mempoolSpace } from './mempool-space.ts';

// Base58check version bytes on mainnet: P2PKH (`1...`) and P2SH (`3...`).
const P2PKH = 0x00;
const P2SH = 0x05;

export const bitcoin: Chain = {
  id: 'bitcoin',
  nativeSymbol: 'BTC',
  supportsTokens: false,
  isValidAddress(address) {
    if (/^(bc|BC)1/.test(address)) {
      return isSegwitAddress(address);
    }
    if (!/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) {
      return false;
    }
    const payload = decodeBase58Check(address);
    return payload?.length === 21 && (payload[0] === P2PKH || payload[0] === P2SH);
  },
  explorers: { 'mempool-space': mempoolSpace },
  defaultExplorers: ['mempool-space'],
};

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32 = 1; // BIP-173, witness version 0
const BECH32M = 0x2bc830a3; // BIP-350, witness versions 1 to 16

/** A mainnet segwit address: bech32 for version 0, bech32m for later versions. */
function isSegwitAddress(address: string): boolean {
  if (
    address.length > 90 ||
    (address !== address.toLowerCase() && address !== address.toUpperCase())
  ) {
    return false;
  }
  const text = address.toLowerCase();
  const separator = text.lastIndexOf('1');
  const hrp = text.slice(0, separator);
  const data = [...text.slice(separator + 1)].map((char) => CHARSET.indexOf(char));
  if (hrp !== 'bc' || data.length < 7 || data.includes(-1)) {
    return false;
  }

  const checksum = polymod([...expandHrp(hrp), ...data]);
  const [version = -1, ...rest] = data.slice(0, -6);
  const program = fromWords(rest);
  if (program === null || program.length < 2 || program.length > 40 || version > 16) {
    return false;
  }
  if (version === 0) {
    return checksum === BECH32 && (program.length === 20 || program.length === 32);
  }
  return checksum === BECH32M;
}

function expandHrp(hrp: string): number[] {
  const codes = [...hrp].map((char) => char.charCodeAt(0));
  return [...codes.map((code) => code >> 5), 0, ...codes.map((code) => code & 31)];
}

function polymod(values: number[]): number {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let check = 1;
  for (const value of values) {
    const top = check >>> 25;
    check = ((check & 0x1ffffff) << 5) ^ value;
    generator.forEach((g, i) => {
      if ((top >>> i) & 1) {
        check ^= g;
      }
    });
  }
  return check >>> 0;
}

/** 5-bit groups back to bytes, or null when the padding isn't zero bits. */
function fromWords(words: number[]): number[] | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const word of words) {
    buffer = (buffer << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
    buffer &= (1 << bits) - 1;
  }
  return bits >= 5 || buffer !== 0 ? null : bytes;
}
