/**
 * Seeded xorshift32 PRNG.
 *
 * Every random decision in the simulation goes through one of these so that a
 * game is fully reproducible from its seed. That is what makes worldgen a
 * one-number save, and what makes the determinism tests possible.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    // 0 is a fixed point of xorshift, so never allow it.
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Next raw uint32. */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x;
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next() / 0x1_0000_0000;
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.float() * maxExclusive);
  }

  /** Integer in [min, maxInclusive]. */
  range(min: number, maxInclusive: number): number {
    return min + this.int(maxInclusive - min + 1);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }

  /** Serialise / restore the stream position so saves resume mid-sequence. */
  getState(): number {
    return this.s;
  }

  setState(s: number): void {
    this.s = (s >>> 0) || 0x9e3779b9;
  }
}

/** Turn an arbitrary string into a usable 32-bit seed (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
