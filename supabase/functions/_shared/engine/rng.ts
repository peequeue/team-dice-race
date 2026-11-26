// Seeded RNG (mulberry32 over a hashed string seed).
// In production the resolver generates a fresh crypto-random seed per game date
// and stores it in `resolutions.seed`, so a day can be audited or re-rendered.

export interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  die(): number; // 1..6
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  chance(p: number): boolean;
}

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function createRng(seed: string): Rng {
  let a = hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return wrap(next);
}

/** Test helper: dice come from a script, everything else from a seeded fallback. */
export function scriptedRng(dice: number[], seed = 'scripted'): Rng & { remaining(): number } {
  const base = createRng(seed);
  const queue = [...dice];
  const r = wrap(base.next) as Rng & { remaining(): number };
  r.die = () => {
    const v = queue.shift();
    if (v === undefined) throw new Error('scriptedRng: ran out of scripted dice');
    return v;
  };
  r.remaining = () => queue.length;
  return r;
}

function wrap(next: () => number): Rng {
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    die: () => 1 + Math.floor(next() * 6),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[Math.floor(next() * items.length)];
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    chance: (p) => next() < p,
  };
  return rng;
}
