/**
 * TerrainSystem — the silhouettes that give the scene its bones.
 *
 * Terrain is baked once into textures and then barely moves, and that is
 * correct: a mountain that sways is a worse lie than a mountain that sits
 * still. What sells depth here is not motion but *separation* — three
 * independently-parallaxing silhouettes with atmospheric perspective between
 * them. The layer behind reads as far away because it is washed toward the
 * horizon colour and moves a fifth as fast, which is how real distance looks.
 *
 * The 'skyline' profile also owns its windows, because it is the only thing
 * that knows where the buildings are. Unlit windows are baked into the
 * silhouette; lit ones are separate sprites so they can flicker.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import type { Hex, TerrainLayerSpec } from '../types';
import { CAMERA_MARGIN } from '../constants';
import { createCanvas, ctx2d, fillSilhouette, textureFrom } from '../draw';
import { aerial, mixHex, sampleRamp, shade } from '../palette';
import { clamp01, fbm1, randInt, randRange, ridged1, type Rng } from '../rng';

interface Building {
  x: number;
  w: number;
  top: number;
}

interface LitWindow {
  sprite: Sprite;
  phase: number;
  speed: number;
  base: number;
}

interface BuiltLayer {
  sprite: Sprite;
  texture: Texture;
  spec: TerrainLayerSpec;
}

const LAYER_FOR_RAMP = {
  far: 'terrainFar',
  mid: 'terrainMid',
  near: 'terrainNear',
} as const;

export class TerrainSystem implements System {
  readonly id = 'terrain';

  private built: BuiltLayer[] = [];
  private windowsRoot = new Container();
  private litWindows: LitWindow[] = [];
  private flickerBoost = 0;
  private unsubscribe: (() => void) | null = null;

  /**
   * The shape seed for a terrain layer.
   *
   * Every system that places something *on* the ground must derive the terrain
   * shape from exactly this function. It previously did not: this system used
   * `randInt` on a stream it also spent on buildings, while foliage used
   * `Math.round(rng() * 1e6)` on a fresh one. Two different seeds meant trees
   * were positioned against a mountain that was never drawn — which is why
   * they appeared to float in mid-air and stand in open water.
   */
  static seedFor(ctx: SceneContext, index: number): number {
    return Math.round(ctx.rng(`terrain-shape-${index}`)() * 1e6);
  }

  /** Height profile in virtual pixels (y of the terrain top edge at x). */
  static heightFn(
    spec: TerrainLayerSpec,
    height: number,
    seed: number,
  ): (x: number) => number {
    const base = spec.baseline * height;
    const amp = spec.amplitude * height;
    const f = spec.roughness * 0.012;

    switch (spec.profile) {
      case 'ridge':
        return (x) => base - ridged1(x * f, seed, 5) * amp * 1.35;
      case 'cliff':
        // Steepened noise: a gentle curve pushed through a power function
        // turns rolling hills into headlands with real vertical faces.
        return (x) => base - Math.pow(fbm1(x * f * 0.7, seed, 4), 1.8) * amp * 1.9;
      case 'plateau': {
        const steps = 4;
        return (x) => {
          const n = fbm1(x * f * 0.55, seed, 3);
          return base - (Math.floor(n * steps) / steps) * amp * 1.4;
        };
      }
      case 'dune':
      default:
        return (x) => base - fbm1(x * f * 0.5, seed, 2) * amp;
    }
  }

  build(ctx: SceneContext): void {
    const w = ctx.width + CAMERA_MARGIN * 2;
    const p = ctx.spec.palette;

    ctx.spec.terrain.forEach((layerSpec, i) => {
      const rng = ctx.rng(`terrain-${i}`);
      const seed = TerrainSystem.seedFor(ctx, i);
      const ramp = p[layerSpec.ramp];

      // Atmospheric perspective — the further back, the more the silhouette is
      // washed into the horizon colour. This is the whole depth cue.
      const d = layerSpec.depth;
      const body = aerial(sampleRamp(ramp, 0.25), p.skyHorizon, d);
      const rim = aerial(sampleRamp(ramp, 0.95), p.skyHorizon, d);
      const shadowTone = aerial(shade(sampleRamp(ramp, 0.05), -0.35), p.skyHorizon, d);

      const canvas = createCanvas(w, ctx.height);
      const g = ctx2d(canvas);

      if (layerSpec.profile === 'skyline') {
        const buildings = this.buildingsFor(layerSpec, w, ctx.height, rng);
        this.paintSkyline(g, w, ctx.height, buildings, body, rim, shadowTone);
        this.spawnLitWindows(ctx, buildings, layerSpec, rng);
      } else {
        const heightAt = TerrainSystem.heightFn(layerSpec, ctx.height, seed);
        fillSilhouette(g, w, ctx.height, heightAt, body, rim, shadowTone, d > 0.5 ? 2 : 1);
      }

      const texture = textureFrom(canvas);
      const sprite = new Sprite(texture);
      sprite.x = -CAMERA_MARGIN;
      sprite.y = 0;
      ctx.layers.get(LAYER_FOR_RAMP[layerSpec.ramp]).addChild(sprite);
      this.built.push({ sprite, texture, spec: layerSpec });
    });

    ctx.layers.get('structures').addChild(this.windowsRoot);
    this.unsubscribe = ctx.bus.on('window_flicker', (e) => {
      this.flickerBoost = Math.max(this.flickerBoost, e.strength);
    });
  }

  /* -------------------------------------------------------------- skyline */

  private buildingsFor(
    spec: TerrainLayerSpec,
    w: number,
    height: number,
    rng: Rng,
  ): Building[] {
    const out: Building[] = [];
    const base = spec.baseline * height;
    const amp = spec.amplitude * height;
    let x = 0;
    while (x < w) {
      const bw = randInt(rng, 7, 26);
      // Vary heights with noise rather than pure random so the skyline has
      // districts — clusters of tall and low — instead of white noise.
      const n = fbm1(x * 0.006 * spec.roughness, 4242, 3);
      const h = amp * (0.35 + n * 0.9) * randRange(rng, 0.8, 1.2);
      out.push({ x, w: bw, top: Math.round(base - h) });
      x += bw + randInt(rng, 0, 3);
    }
    return out;
  }

  private paintSkyline(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    buildings: Building[],
    body: Hex,
    rim: Hex,
    shadowTone: Hex,
  ): void {
    g.clearRect(0, 0, w, h);
    for (const b of buildings) {
      g.fillStyle = body;
      g.fillRect(b.x, b.top, b.w, h - b.top);
      // Lit top edge and one lit vertical face — enough to imply a light
      // direction without a lighting pass.
      g.fillStyle = rim;
      g.fillRect(b.x, b.top, b.w, 1);
      g.fillStyle = shadowTone;
      g.fillRect(b.x + b.w - 1, b.top, 1, h - b.top);

      // Unlit window grid, baked in. Lit ones arrive as sprites.
      g.fillStyle = shade(body, -0.3);
      for (let wy = b.top + 4; wy < h - 2; wy += 5) {
        for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += 4) {
          g.fillRect(wx, wy, 2, 2);
        }
      }
    }
  }

  private spawnLitWindows(
    ctx: SceneContext,
    buildings: Building[],
    spec: TerrainLayerSpec,
    rng: Rng,
  ): void {
    const litRatio = ctx.spec.structures.litWindows;
    if (litRatio <= 0) return;
    const p = ctx.spec.palette;
    // Warm interior light, not the neon accent — every window being neon pink
    // is exactly the "AI slop" read we are avoiding.
    const warm = mixHex(p.light, '#ffcf8a', 0.55);
    const tints = [warm, mixHex(warm, p.accent, 0.35), mixHex(warm, '#9fd6ff', 0.4)];

    for (const b of buildings) {
      for (let wy = b.top + 4; wy < ctx.height - 2; wy += 5) {
        for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += 4) {
          if (rng() > litRatio * 0.5) continue;
          const s = new Sprite(Texture.WHITE);
          s.width = 2;
          s.height = 2;
          s.x = wx - CAMERA_MARGIN;
          s.y = wy;
          s.tint = parseInt(tints[randInt(rng, 0, tints.length - 1)].slice(1), 16);
          this.windowsRoot.addChild(s);
          this.litWindows.push({
            sprite: s,
            phase: rng() * Math.PI * 2,
            speed: randRange(rng, 0.15, 0.7),
            base: randRange(rng, 0.55, 1),
          });

          // Anything this bright near water should show up in the water.
          if (ctx.spec.water.enabled && rng() < 0.25) {
            ctx.reflections.push({
              x: wx - CAMERA_MARGIN,
              color: s.tint as number,
              strength: 0.5 * spec.depth + 0.2,
              width: 2,
            });
          }
        }
      }
    }
  }

  /* --------------------------------------------------------------- update */

  update(ctx: SceneContext): void {
    if (this.litWindows.length === 0) return;
    // Windows mostly hold steady and occasionally shift — someone crossing a
    // room. A whole city pulsing in sync looks like a screensaver.
    for (const lw of this.litWindows) {
      const slow = 0.88 + 0.12 * Math.sin(ctx.time * lw.speed + lw.phase);
      lw.sprite.alpha = lw.base * slow;
    }
    if (this.flickerBoost > 0.001) {
      const n = this.litWindows.length;
      const hit = this.litWindows[Math.floor(Math.random() * n)];
      hit.base = hit.base > 0.5 ? randRange(Math.random, 0.15, 0.4) : randRange(Math.random, 0.6, 1);
      this.flickerBoost = 0;
    }
  }

  resize(ctx: SceneContext): void {
    // Rebuilding silhouettes on every resize frame would thrash; the baked
    // margin absorbs modest changes, and a remount handles big ones.
    const w = ctx.width + CAMERA_MARGIN * 2;
    for (const b of this.built) {
      if (b.texture.width < w) b.sprite.width = w;
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    for (const b of this.built) b.texture.destroy(true);
    this.built = [];
    this.litWindows = [];
  }
}
