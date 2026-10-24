/** GF(2^8) = GF(2)[x]/(x^8 + x^4 + x^3 + x + 1), elements as numbers 0..255. */

export function xtime(a: number): number {
  const shifted = a << 1;
  return (shifted & 0x100 ? shifted ^ 0x11b : shifted) & 0xff;
}

export function gfMul(a: number, b: number): number {
  let result = 0;
  let x = a & 0xff;
  let y = b & 0xff;
  while (y) {
    if (y & 1) result ^= x;
    x = xtime(x);
    y >>= 1;
  }
  return result;
}

export function gfPow(a: number, e: number): number {
  let result = 1;
  let base = a;
  let n = e;
  while (n > 0) {
    if (n & 1) result = gfMul(result, base);
    base = gfMul(base, base);
    n >>= 1;
  }
  return result;
}

/** Multiplicative inverse; 0 maps to 0 (as in the AES S-box construction). */
export function gfInv(a: number): number {
  return a === 0 ? 0 : gfPow(a, 254);
}

const HEX_RE = /^[0-9a-fA-F]{2}$/;

export function isGfHex(text: string): boolean {
  return HEX_RE.test(text);
}

export function parseGfHex(text: string): number {
  if (!HEX_RE.test(text)) throw new Error(`not a two-digit hex byte: ${JSON.stringify(text)}`);
  return parseInt(text, 16);
}

export function formatGfHex(value: number): string {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

let aesSboxCache: number[] | null = null;

/** The AES S-box, computed from its definition (inverse then affine map). */
export function aesSbox(): number[] {
  if (aesSboxCache) return aesSboxCache;
  const table: number[] = [];
  for (let x = 0; x < 256; x++) {
    const b = gfInv(x);
    let s = b;
    for (let i = 1; i <= 4; i++) s ^= ((b << i) | (b >>> (8 - i))) & 0xff;
    table.push((s ^ 0x63) & 0xff);
  }
  aesSboxCache = table;
  return table;
}
