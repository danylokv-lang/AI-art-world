/**
 * CloudSystem — two banks of clouds drifting at different rates.
 *
 * Clouds are the cheapest honest motion in the scene: they are unambiguously
 * separate objects at a known distance, so moving them at two different speeds
 * establishes depth immediately and reads as weather rather than as an effect.
 *
 * The sprites are built pixel-by-pixel rather than with canvas arcs, because
 * `arc()` anti-aliases and a single soft edge anywhere on screen breaks the
 * pixel grid for the whole composition.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import type { Hex } from '../types';
import { createCanvas, ctx2d, textureFrom } from '../draw';
import { hexToRgb, mixHex, shade } from '../palette';
import { clamp01, randInt, randRange, type Rng } from '../rng';

interface Cloud {
  sprite: Sprite;
  speed: number;
  bobPhase: number;
  bobAmp: number;
  baseY: number;
}

/** Build one puffy cloud as an explicit pixel mask of overlapping discs. */
function cloudTexture(rng: Rng, body: Hex, rim: Hex, under: Hex): Texture {
  const w = randInt(rng, 34, 78);
  const h = randInt(rng, 12, 22);
  const discs: Array<{ x: number; y: number; r: number }> = [];
  const lobes = randInt(rng, 3, 6);
  for (let i = 0; i < lobes; i++) {
    const t = (i + 0.5) / lobes;
    discs.push({
      x: t * w + randRange(rng, -3, 3),
      // Flat-ish bottom: lobes sit near the baseline, rising in the middle.
      y: h * 0.72 - Math.sin(t * Math.PI) * randRange(rng, 1, 5),
      r: randRange(rng, h * 0.32, h * 0.52),
    });
  }

  const canvas = createCanvas(w, h);
  const g = ctx2d(canvas);
  const img = g.createImageData(w, h);
  const data = img.data;
  const cBody = hexToRgb(body);
  const cRim = hexToRgb(rim);
  const cUnder = hexToRgb(under);

  const solid = (x: number, y: number): boolean => {
    if (y >= h * 0.78) return false; // flat base
    for (const d of discs) {
      const dx = x - d.x;
      const dy = (y - d.y) * 1.35; // squash vertically
      if (dx * dx + dy * dy <= d.r * d.r) return true;
    }
    return false;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      const lit = !solid(x, y - 1) || !solid(x - 1, y - 1);
      const shadowed = !solid(x, y + 1) && y > h * 0.5;
      const c = lit ? cRim : shadowed ? cUnder : cBody;
      const o = (y * w + x) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return textureFrom(canvas);
}

export class CloudSystem implements System {
  readonly id = 'clouds';

  private banks: Array<{ root: Container; clouds: Cloud[] }> = [];
  private textures: Texture[] = [];
  private gust = 0;
  private unsubscribe: (() => void) | null = null;

  build(ctx: SceneContext): void {
    const rng = ctx.rng('clouds');
    const p = ctx.spec.palette;
    const density = clamp01(ctx.spec.sky.cloudDensity);
    if (density <= 0.02) return;

    // Palette-derived, not white: clouds pick up the sky they sit in.
    const body = mixHex(p.skyMid, p.light, 0.55);
    const rim = mixHex(p.light, '#ffffff', 0.3);
    const under = mixHex(p.skyMid, shade(p.skyHorizon, -0.2), 0.6);

    for (let i = 0; i < 8; i++) {
      this.textures.push(cloudTexture(rng, body, rim, under));
    }

    const plan = [
      { layer: 'cloudsFar' as const, count: Math.round(density * 7), scale: 1, alpha: 0.55, band: [0.06, 0.34], speed: 0.5 },
      { layer: 'cloudsNear' as const, count: Math.round(density * 5), scale: 1.6, alpha: 0.85, band: [0.02, 0.24], speed: 1.15 },
    ];

    for (const b of plan) {
      const root = new Container();
      ctx.layers.get(b.layer).addChild(root);
      const clouds: Cloud[] = [];
      for (let i = 0; i < b.count; i++) {
        const s = new Sprite(this.textures[randInt(rng, 0, this.textures.length - 1)]);
        s.scale.set(b.scale * randRange(rng, 0.8, 1.25));
        s.alpha = b.alpha * randRange(rng, 0.75, 1);
        s.x = randRange(rng, -80, ctx.width + 80);
        const baseY = randRange(rng, b.band[0], b.band[1]) * ctx.height;
        s.y = Math.round(baseY);
        root.addChild(s);
        clouds.push({
          sprite: s,
          speed: b.speed * randRange(rng, 0.7, 1.4),
          bobPhase: rng() * Math.PI * 2,
          bobAmp: randRange(rng, 0.6, 2.2),
          baseY,
        });
      }
      this.banks.push({ root, clouds });
    }

    this.unsubscribe = ctx.bus.on('gust', (e) => {
      this.gust = Math.max(this.gust, e.strength);
    });
  }

  update(ctx: SceneContext): void {
    const base = ctx.spec.sky.cloudSpeed * 6;
    const wind = ctx.wind === 0 ? 0.35 : ctx.wind;
    const gustMul = 1 + this.gust * 2.5;
    if (this.gust > 0.001) this.gust *= Math.pow(0.3, ctx.dt);

    for (const bank of this.banks) {
      for (const c of bank.clouds) {
        c.sprite.x += wind * base * c.speed * gustMul * ctx.dt;
        // A slight vertical bob keeps a bank from reading as a sliding decal.
        c.sprite.y = Math.round(
          c.baseY + Math.sin(ctx.time * 0.12 * c.speed + c.bobPhase) * c.bobAmp,
        );

        const w = c.sprite.width;
        if (wind >= 0 && c.sprite.x > ctx.width + w + 20) c.sprite.x = -w - 20;
        else if (wind < 0 && c.sprite.x < -w - 20) c.sprite.x = ctx.width + w + 20;

        // Whole-pixel positions only, or the cloud shimmers as it moves.
        c.sprite.x = Math.round(c.sprite.x * 100) / 100;
      }
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
    this.banks = [];
  }
}
