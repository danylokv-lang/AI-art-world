/**
 * LightingSystem — the screen-space pass: vignette, god rays, lightning.
 *
 * Deliberately narrow. Relighting baked art for the day cycle belongs to each
 * system via `ambientTint`, not here, because a single full-screen multiply
 * would also hit the sky — which is already relit when its gradient is baked —
 * and darken it twice. What is left over is the genuinely screen-space work:
 * things that sit between the viewer and the world rather than in it.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import { createCanvas, ctx2d, textureFrom } from '../draw';
import { gradeAtCycle, hexToInt, hexToRgb, mixHex } from '../palette';
import { bayer } from '../draw';
import { clamp01, lerp } from '../rng';

/** A dithered radial darkening, baked once. */
function vignetteTexture(w: number, h: number, strength: number): Texture {
  const canvas = createCanvas(w, h);
  const g = ctx2d(canvas);
  const img = g.createImageData(w, h);
  const data = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / maxD;
      const dy = (y - cy) / maxD;
      const d = Math.sqrt(dx * dx + dy * dy) * 1.42;
      let a = clamp01(Math.pow(clamp01(d - 0.35) / 0.65, 1.7)) * strength;
      const steps = 8;
      const lv = a * steps;
      const base = Math.floor(lv);
      a = Math.min(steps, base + (lv - base > bayer(x, y) ? 1 : 0)) / steps;
      const o = (y * w + x) * 4;
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 8;
      data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return textureFrom(canvas);
}

/**
 * Angled shafts of light, baked as one additive texture.
 *
 * God rays are the cheapest way to make a scene feel like it has a real light
 * source somewhere, and baking them means the per-frame cost is one sprite.
 */
function godRayTexture(w: number, h: number, tint: string): Texture {
  const canvas = createCanvas(w, h);
  const g = ctx2d(canvas);
  const img = g.createImageData(w, h);
  const data = img.data;
  const c = hexToRgb(tint);
  const rays = [0.19, 0.33, 0.55, 0.71];

  for (let y = 0; y < h; y++) {
    // Shafts widen and fade as they descend.
    const down = y / h;
    const fade = clamp01(1 - down * 1.5) * 0.4;
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (const r of rays) {
        // Strong lateral slew so the shafts read as angled light from the sun
        // rather than as vertical bands. Vertical rays over a whole sky look
        // like smears on the lens, which is exactly how the first pass read.
        const cx = (r + down * 0.42) * w;
        const halfW = w * (0.005 + down * 0.009);
        const d = Math.abs(x - cx) / halfW;
        if (d < 1) a = Math.max(a, (1 - d) * fade);
      }
      if (a <= 0) continue;
      // Only 3 alpha steps: coarse dithering keeps the shaft on the pixel grid.
      // A smooth shaft is the one un-pixelated thing on screen and the eye
      // finds it immediately.
      const steps = 3;
      const lv = a * steps;
      const base = Math.floor(lv);
      a = Math.min(steps, base + (lv - base > bayer(x, y) ? 1 : 0)) / steps;
      const o = (y * w + x) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = Math.round(a * 30);
    }
  }
  g.putImageData(img, 0, 0);
  return textureFrom(canvas);
}

export class LightingSystem implements System {
  readonly id = 'lighting';

  private root = new Container();
  private vignette: Sprite | null = null;
  private rays: Sprite | null = null;
  private flash: Sprite | null = null;
  private warm: Sprite | null = null;
  private textures: Texture[] = [];

  private flashLevel = 0;
  private flashQueue: number[] = [];
  private unsubscribe: (() => void) | null = null;

  build(ctx: SceneContext): void {
    ctx.layers.get('lighting').addChild(this.root);
    const p = ctx.spec.palette;
    const L = ctx.spec.lighting;

    // Additive warm wash — this is how the scene brightens past its authored
    // palette, since `tint` can only ever darken.
    this.warm = new Sprite(Texture.WHITE);
    this.warm.width = ctx.width;
    this.warm.height = ctx.height;
    this.warm.blendMode = 'add';
    this.warm.alpha = 0;
    this.warm.tint = hexToInt(mixHex(p.light, p.skyHorizon, 0.4));
    this.root.addChild(this.warm);

    if (L.godRays) {
      const rayTex = godRayTexture(ctx.width, ctx.height, mixHex(p.light, '#ffffff', 0.3));
      this.textures.push(rayTex);
      this.rays = new Sprite(rayTex);
      this.rays.blendMode = 'add';
      this.rays.alpha = 0;
      this.root.addChild(this.rays);
    }

    this.flash = new Sprite(Texture.WHITE);
    this.flash.width = ctx.width;
    this.flash.height = ctx.height;
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.flash.tint = hexToInt(mixHex(p.light, '#ffffff', 0.7));
    this.root.addChild(this.flash);

    const vigTex = vignetteTexture(ctx.width, ctx.height, clamp01(L.vignette));
    this.textures.push(vigTex);
    this.vignette = new Sprite(vigTex);
    this.root.addChild(this.vignette);

    this.unsubscribe = ctx.bus.on('lightning', (e) => {
      // A real strike is a double pulse — one bright, one weaker just after.
      this.flashQueue.push(e.strength, e.strength * 0.45);
    });
  }

  update(ctx: SceneContext): void {
    const grade = gradeAtCycle(ctx.cycle);

    // Golden hours get a warm additive lift; night gets none.
    if (this.warm) {
      const golden = clamp01((grade.warmth - 0.15) / 0.6);
      this.warm.alpha = golden * 0.16;
    }

    if (this.rays) {
      // Rays only exist when the light is low and the sky is bright enough to
      // scatter — overhead noon does not produce visible shafts.
      const low = clamp01(1 - Math.abs(grade.warmth - 0.5) / 0.5);
      this.rays.alpha = low * grade.ambient * 0.35;
      this.rays.x = Math.sin(ctx.time * 0.08) * 3;
    }

    if (this.flash) {
      if (this.flashQueue.length > 0 && this.flashLevel < 0.05) {
        this.flashLevel = this.flashQueue.shift()!;
      }
      this.flashLevel *= Math.pow(0.0006, ctx.dt);
      if (this.flashLevel < 0.002) this.flashLevel = 0;
      this.flash.alpha = this.flashLevel * 0.75;
      ctx.flash = this.flashLevel;
    }
  }

  resize(ctx: SceneContext): void {
    for (const s of [this.warm, this.flash]) {
      if (s) {
        s.width = ctx.width;
        s.height = ctx.height;
      }
    }
    if (this.vignette) this.vignette.width = ctx.width;
    if (this.rays) this.rays.width = ctx.width;
  }

  destroy(): void {
    this.unsubscribe?.();
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
  }
}
