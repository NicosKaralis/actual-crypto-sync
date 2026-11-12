import { createHash } from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * The payload of a base58check string (version byte first, checksum removed),
 * or null when it isn't base58 or its checksum is wrong. TRON and Bitcoin
 * legacy addresses both use it.
 */
export function decodeBase58Check(text: string): Uint8Array | null {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) {
      return null;
    }
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  for (; value > 0n; value >>= 8n) {
    bytes.unshift(Number(value & 0xffn));
  }
  // Each leading '1' is a leading zero byte.
  for (let i = 0; i < text.length && text[i] === '1'; i++) {
    bytes.unshift(0);
  }
  if (bytes.length < 5) {
    return null;
  }
  const payload = Uint8Array.from(bytes.slice(0, -4));
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return checksum.every((byte, i) => byte === bytes[bytes.length - 4 + i]) ? payload : null;
}

function sha256(data: Uint8Array): Buffer {
  return createHash('sha256').update(data).digest();
}
