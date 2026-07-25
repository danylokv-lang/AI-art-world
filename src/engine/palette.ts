/**
 * Palette discipline.
 *
 * The single biggest thing separating "pixel art" from "AI slop" is colour
 * restraint: every pixel on screen comes from one small, deliberately related
 * set. So no system is allowed to invent a colour. Systems ask for a ramp step
 * or a blend between two palette entries, and everything stays coherent even
 * when the scene content is wildly different from one generation to the next.
 */

import type { Hex, Palette, TimeOfDay } from './types';
import { clamp, clamp01, lerp } from './rng';

export type RGB = { r: number; g: number; b: number };

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function hexToInt(hex: Hex): number {
  const m = HEX_RE.exec(hex.trim());
  return m ? parseInt(m[1], 16) : 0xff00ff; // magenta = "you shipped a bad colour"
}

export function hexToRgb(hex: Hex): RGB {
  const n = hexToInt(hex);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToInt({ r, g, b }: RGB): number {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

export function rgbToHex(rgb: RGB): Hex {
  return `#${rgbToInt(rgb).toString(16).padStart(6, '0')}`;
}

/** Blend two palette colours. Used for horizon gradients and fog falloff. */
export function mixHex(a: Hex, b: Hex, t: number): Hex {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex({
    r: Math.round(lerp(ca.r, cb.r, k)),
    g: Math.round(lerp(ca.g, cb.g, k)),
    b: Math.round(lerp(ca.b, cb.b, k)),
  });
}

export function mixInt(a: number, b: number, t: number): number {
  const k = clamp01(t);
  return (
    (Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, k)) << 16) |
    (Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, k)) << 8) |
    Math.round(lerp(a & 255, b & 255, k))
  );
}

/** Sample a 3-step ramp continuously. t: 0 = darkest, 1 = lightest. */
export function sampleRamp(ramp: readonly [Hex, Hex, Hex], t: number): Hex {
  const k = clamp01(t) * 2;
  return k <= 1 ? mixHex(ramp[0], ramp[1], k) : mixHex(ramp[1], ramp[2], k - 1);
}

/**
 * Atmospheric perspective: push a colour toward the horizon as it recedes.
 *
 * This one function does most of the work of making a flat 2D stack read as
 * having depth — far layers desaturate toward the sky, near layers stay
 * contrasty. Real technique, not a filter.
 */
export function aerial(color: Hex, horizon: Hex, depth: number): Hex {
  // depth 0 = furthest → heaviest wash; depth 1 = closest → untouched.
  // The floor is deliberately high: washing a far ridge 75% into the horizon
  // is physically defensible but visually erases it, and a silhouette you
  // cannot see contributes no depth at all.
  return mixHex(horizon, color, clamp01(0.4 + depth * 0.6));
}

/**
 * Lighting relative to the palette's authored time.
 *
 * Returns a factor where 1 means "render the palette exactly as written",
 * below 1 darkens toward the colour's own shadow, above 1 lifts it. Clamped so
 * a full scrub never bottoms out to black or blows out to white.
 */
export function relativeAmbient(cycle: number, baseCycle: number): number {
  const now = gradeAtCycle(cycle).ambient;
  const authored = gradeAtCycle(baseCycle).ambient || 1;
  return clamp(now / authored, 0.3, 1.75);
}

/** Apply a relative-ambient factor to a single colour. */
export function relight(hex: Hex, factor: number, depth = 0.7): Hex {
  if (factor <= 1) return mixHex(shade(hex, -depth), hex, clamp01(factor));
  return mixHex(hex, shade(hex, 0.4), clamp01(factor - 1));
}

/** Luminance in 0..1, Rec. 601. Used for dithering and bloom thresholds. */
export function luminance(hex: Hex): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function shade(hex: Hex, amount: number): Hex {
  const c = hexToRgb(hex);
  const t = clamp01(Math.abs(amount));
  const target = amount < 0 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  return rgbToHex({
    r: Math.round(lerp(c.r, target.r, t)),
    g: Math.round(lerp(c.g, target.g, t)),
    b: Math.round(lerp(c.b, target.b, t)),
  });
}

/* --------------------------------------------------- time-of-day grading */

/**
 * Global tint applied by the LightingSystem, expressed as a multiply colour and
 * an additive warmth. Keeping this here (rather than inside the spec) means the
 * time-of-day scrubber can relight a scene instantly, client-side, with no
 * regeneration — which is both cheaper and a better demo than round-tripping a
 * model for a colour change.
 */
export interface Grade {
  multiply: number;
  warmth: number;
  ambient: number;
}

export const TIME_GRADES: Record<TimeOfDay, Grade> = {
  dawn: { multiply: 0xffd9c0, warmth: 0.45, ambient: 0.62 },
  day: { multiply: 0xffffff, warmth: 0.08, ambient: 1.0 },
  dusk: { multiply: 0xffb894, warmth: 0.6, ambient: 0.55 },
  night: { multiply: 0x8fa6d8, warmth: -0.35, ambient: 0.34 },
};

/** Interpolate between two time-of-day grades for the scrubber. */
export function blendGrade(a: Grade, b: Grade, t: number): Grade {
  return {
    multiply: mixInt(a.multiply, b.multiply, t),
    warmth: lerp(a.warmth, b.warmth, t),
    ambient: lerp(a.ambient, b.ambient, t),
  };
}

export const TIME_ORDER: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];

/**
 * Continuous day cycle in 0..1 → a grade. Lets the scrubber cross midnight
 * smoothly instead of snapping between four presets.
 */
export function gradeAtCycle(t: number): Grade {
  const p = ((t % 1) + 1) % 1;
  const scaled = p * TIME_ORDER.length;
  const i = Math.floor(scaled);
  const frac = scaled - i;
  const a = TIME_GRADES[TIME_ORDER[i % TIME_ORDER.length]];
  const b = TIME_GRADES[TIME_ORDER[(i + 1) % TIME_ORDER.length]];
  return blendGrade(a, b, frac);
}

/**
 * The multiply tint that baked sprites apply to follow the day cycle.
 *
 * Systems own their own relighting rather than having a global overlay do it,
 * because a single full-screen multiply would also hit the sky — which is
 * already relit at texture-bake time — and darken it twice. Each system calls
 * this and assigns the result to `sprite.tint`.
 *
 * Normalised so the authored time returns 0xffffff: `tint` can only darken, so
 * "no change" has to be white. Brightening past the authored palette is the
 * LightingSystem's additive pass, not this.
 */
export function ambientTint(cycle: number, baseCycle: number): number {
  const now = gradeAtCycle(cycle);
  const authored = gradeAtCycle(baseCycle);
  const level = clamp(relativeAmbient(cycle, baseCycle), 0, 1);

  const ratio = (shift: number): number => {
    const a = (now.multiply >> shift) & 255;
    const b = (authored.multiply >> shift) & 255;
    return clamp01(b === 0 ? 1 : a / b);
  };

  const r = Math.round(255 * ratio(16) * level);
  const g = Math.round(255 * ratio(8) * level);
  const bl = Math.round(255 * ratio(0) * level);
  return (r << 16) | (g << 8) | bl;
}

/** Every colour a scene is allowed to use, flattened — for debug swatches. */
export function paletteSwatches(p: Palette): Hex[] {
  return [
    p.skyTop,
    p.skyMid,
    p.skyHorizon,
    p.light,
    ...p.far,
    ...p.mid,
    ...p.near,
    ...p.water,
    ...p.foliage,
    p.accent,
  ];
}
