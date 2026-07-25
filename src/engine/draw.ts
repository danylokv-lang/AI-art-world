/**
 * Canvas drawing helpers — the pixel-art vocabulary.
 *
 * Everything visual is baked into small offscreen canvases once at build time
 * and uploaded as nearest-neighbour textures, rather than drawn with vector
 * Graphics each frame. Two reasons: vector fills anti-alias (which instantly
 * breaks the pixel grid), and baking means the per-frame cost is just moving
 * sprites around.
 *
 * The dithering here is doing real work, not decoration. Banded gradients with
 * ordered dither between bands is the single most recognisable signature of
 * hand-made pixel art, and it is what stops a 16-colour scene from reading as a
 * posterised photo.
 */

import { Texture } from 'pixi.js';
import type { Hex } from './types';
import { hexToRgb, mixHex } from './palette';
import { clamp01 } from './rng';

/** Classic 4x4 Bayer matrix, normalised to 0..1. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => v / 16));

export const bayer = (x: number, y: number): number =>
  BAYER4[y & 3][x & 3];

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext('2d', { willReadFrequently: false });
  if (!g) throw new Error('2D context unavailable');
  g.imageSmoothingEnabled = false;
  return g;
}

export function textureFrom(canvas: HTMLCanvasElement): Texture {
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

export interface GradientStop {
  t: number;
  hex: Hex;
}

function sampleStops(stops: GradientStop[], t: number): Hex {
  const k = clamp01(t);
  if (k <= stops[0].t) return stops[0].hex;
  const last = stops[stops.length - 1];
  if (k >= last.t) return last.hex;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (k >= a.t && k <= b.t) {
      const span = b.t - a.t || 1;
      return mixHex(a.hex, b.hex, (k - a.t) / span);
    }
  }
  return last.hex;
}

/**
 * A vertical gradient quantised into `bands` steps, with ordered dither across
 * each band boundary so the transitions read as texture rather than as a blur.
 */
export function verticalGradientTexture(
  w: number,
  h: number,
  stops: GradientStop[],
  bands = 14,
  dither = 1,
): Texture {
  const canvas = createCanvas(w, h);
  const g = ctx2d(canvas);
  const img = g.createImageData(canvas.width, canvas.height);
  const data = img.data;

  // Precompute one colour per band so we sample the ramp `bands` times, not
  // w*h times.
  const bandColors: Array<{ r: number; g: number; b: number }> = [];
  for (let i = 0; i <= bands; i++) {
    bandColors.push(hexToRgb(sampleStops(stops, i / bands)));
  }

  for (let y = 0; y < canvas.height; y++) {
    const t = canvas.height === 1 ? 0 : y / (canvas.height - 1);
    const level = t * bands;
    const base = Math.floor(level);
    const frac = level - base;
    for (let x = 0; x < canvas.width; x++) {
      const threshold = bayer(x, y) * dither;
      const idx = Math.min(bands, base + (frac > threshold ? 1 : 0));
      const c = bandColors[idx];
      const o = (y * canvas.width + x) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return textureFrom(canvas);
}

/**
 * A soft radial glow, dithered rather than smoothly alpha-blended.
 *
 * Used for the sun/moon halo, lantern light and firefly bodies. A smooth radial
 * gradient here would be the one un-pixelated element on screen and the eye
 * finds it immediately.
 */
export function glowTexture(radius: number, hex: Hex, falloff = 2.2): Texture {
  const size = Math.max(2, Math.round(radius * 2));
  const canvas = createCanvas(size, size);
  const g = ctx2d(canvas);
  const img = g.createImageData(size, size);
  const data = img.data;
  const c = hexToRgb(hex);
  const mid = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - mid) / mid;
      const dy = (y + 0.5 - mid) / mid;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a = Math.pow(clamp01(1 - d), falloff);
      // Quantise alpha into 6 steps and dither the boundaries.
      const steps = 6;
      const lv = a * steps;
      const base = Math.floor(lv);
      a = Math.min(steps, base + (lv - base > bayer(x, y) ? 1 : 0)) / steps;
      const o = (y * size + x) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return textureFrom(canvas);
}

/** A hard-edged filled disc — the sun/moon body itself. */
export function discTexture(radius: number, hex: Hex): Texture {
  const size = Math.max(2, Math.round(radius * 2));
  const canvas = createCanvas(size, size);
  const g = ctx2d(canvas);
  const img = g.createImageData(size, size);
  const data = img.data;
  const c = hexToRgb(hex);
  const mid = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - mid;
      const dy = y + 0.5 - mid;
      const inside = dx * dx + dy * dy <= mid * mid;
      const o = (y * size + x) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = inside ? 255 : 0;
    }
  }
  g.putImageData(img, 0, 0);
  return textureFrom(canvas);
}

/** A 1x1 texture — stretched for solid fills without touching Graphics. */
export function solidTexture(hex: Hex): Texture {
  const canvas = createCanvas(1, 1);
  const g = ctx2d(canvas);
  g.fillStyle = hex;
  g.fillRect(0, 0, 1, 1);
  return textureFrom(canvas);
}

/**
 * Fill a column range under a height function, with a lit rim along the top
 * edge and a dithered band beneath it. The rim is what gives a flat silhouette
 * the read of a lit surface — two extra pixel rows doing the work that a whole
 * lighting pass would otherwise need to.
 */
export function fillSilhouette(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  heightAt: (x: number) => number,
  body: Hex,
  rim: Hex,
  shadow: Hex,
  rimThickness = 1,
): void {
  const img = g.createImageData(w, h);
  const data = img.data;
  const cBody = hexToRgb(body);
  const cRim = hexToRgb(rim);
  const cShadow = hexToRgb(shadow);

  for (let x = 0; x < w; x++) {
    const top = Math.round(heightAt(x));
    for (let y = Math.max(0, top); y < h; y++) {
      const depthBelow = y - top;
      let c = cBody;
      if (depthBelow < rimThickness) {
        c = cRim;
      } else if (depthBelow < rimThickness + 5) {
        // Dither from rim into body so the lit edge does not end abruptly.
        const t = (depthBelow - rimThickness) / 5;
        c = t > bayer(x, y) ? cBody : cRim;
      } else if (depthBelow > 18) {
        const t = Math.min(1, (depthBelow - 18) / 26);
        c = t > bayer(x, y) ? cShadow : cBody;
      }
      const o = (y * w + x) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}
