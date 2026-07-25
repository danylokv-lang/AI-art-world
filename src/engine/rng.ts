/**
 * Seeded randomness and value noise.
 *
 * Every system draws from a stream derived from the scene seed, so a given
 * SceneSpec always produces the identical world. That is what makes gallery
 * replay free: we store ~2KB of JSON instead of an image, and re-derive the
 * scene exactly. It also makes visual bugs reproducible, which matters more
 * than it sounds when you are debugging a scene that only breaks sometimes.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, and good enough for visual variation. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive an independent stream from a base seed and a label.
 *
 * Systems must not share one Rng: if the cloud system draws a different number
 * of values on some frame, every downstream system's output shifts. Per-system
 * streams keep them isolated.
 */
export function deriveRng(seed: number, label: string): Rng {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return makeRng((seed ^ h) >>> 0);
}

export const randRange = (rng: Rng, min: number, max: number): number =>
  min + rng() * (max - min);

export const randInt = (rng: Rng, min: number, max: number): number =>
  Math.floor(randRange(rng, min, max + 1));

export const pick = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

export const chance = (rng: Rng, p: number): boolean => rng() < p;

/* ------------------------------------------------------------------ noise */

const fade = (t: number): number => t * t * (3 - 2 * t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo = 0, hi = 1): number =>
  v < lo ? lo : v > hi ? hi : v;
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** Hash a lattice point to [0,1). Deterministic, no allocation. */
function hash1(x: number, seed: number): number {
  let h = (x | 0) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 1D value noise — the backbone of terrain silhouettes and drift. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  return lerp(hash1(i, seed), hash1(i + 1, seed), fade(f));
}

/** Fractal Brownian motion over noise1. `octaves` trades detail for cost. */
export function fbm1(x: number, seed: number, octaves = 4, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise1(x * freq, seed + o * 1013);
    norm += amp;
    amp *= gain;
    freq *= 2.03; // slightly off 2.0 to avoid visible lattice alignment
  }
  return sum / norm;
}

/**
 * Ridged variant — folds the noise at its midpoint to create sharp crests.
 * This is the difference between rolling hills and a mountain range.
 */
export function ridged1(x: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise1(x * freq, seed + o * 7717) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
