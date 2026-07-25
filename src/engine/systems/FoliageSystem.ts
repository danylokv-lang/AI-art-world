/**
 * FoliageSystem — vegetation that responds to wind.
 *
 * Each plant is anchored at its base and rotated by a few hundredths of a
 * radian. The important detail is the phase offset by x position: when a gust
 * arrives it travels *across* the scene rather than tilting everything at once,
 * which is the difference between a forest in wind and a forest on a hinge.
 *
 * Trees are placed against the terrain height function they stand on, so they
 * sit on the ground instead of floating at a fixed baseline.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import type { FoliageKind, TerrainLayerSpec } from '../types';
import { CAMERA_MARGIN } from '../constants';
import { TerrainSystem } from './TerrainSystem';
import {
  broadleafTexture,
  cactusTexture,
  deadTreeTexture,
  foliageTones,
  grassTexture,
  palmTexture,
  pineTexture,
  reedsTexture,
  rockTexture,
  type FoliageTones,
} from '../assets/sprites';
import { ambientTint } from '../palette';
import { clamp01, randInt, randRange, type Rng } from '../rng';

interface Plant {
  sprite: Sprite;
  phase: number;
  /** Taller plants sway less, from the base, like real trunks. */
  stiffness: number;
  swayAmp: number;
}

const TREE_BUILDER: Record<
  Exclude<FoliageKind, 'none'>,
  (rng: Rng, t: FoliageTones) => Texture
> = {
  pine: pineTexture,
  broadleaf: broadleafTexture,
  palm: palmTexture,
  cactus: cactusTexture,
  dead: deadTreeTexture,
  reeds: reedsTexture,
  alien: broadleafTexture,
};

export class FoliageSystem implements System {
  readonly id = 'foliage';

  private plants: Plant[] = [];
  private textures: Texture[] = [];
  private root = new Container();
  private propsRoot = new Container();
  private gust = 0;
  private gustX = 0.5;
  private unsubscribe: (() => void) | null = null;

  build(ctx: SceneContext): void {
    const rng = ctx.rng('foliage');
    const tones = foliageTones(ctx.spec.palette);
    ctx.layers.get('foliage').addChild(this.root);
    ctx.layers.get('props').addChild(this.propsRoot);

    this.buildTrees(ctx, rng, tones);
    this.buildProps(ctx, rng, tones);

    this.unsubscribe = ctx.bus.on('gust', (e) => {
      this.gust = Math.max(this.gust, e.strength);
      this.gustX = e.x ?? 0.5;
    });
  }

  private buildTrees(ctx: SceneContext, rng: Rng, tones: FoliageTones): void {
    const f = ctx.spec.foliage;
    if (f.kind === 'none' || f.density <= 0.01) return;

    const variants: Texture[] = [];
    for (let i = 0; i < 7; i++) variants.push(TREE_BUILDER[f.kind](rng, tones));
    this.textures.push(...variants);

    // Plant onto the two nearest terrain layers so the treeline has depth.
    const hosts = ctx.spec.terrain
      .filter((t) => t.ramp !== 'far')
      .slice(-2);
    if (hosts.length === 0) return;

    for (const host of hosts) {
      const heightAt = this.hostHeight(ctx, host);
      const isNear = host.ramp === 'near';
      const count = Math.round(f.density * (isNear ? 26 : 34) * (ctx.width / 480));
      const scale = isNear ? 1 : 0.62;

      for (let i = 0; i < count; i++) {
        const s = new Sprite(variants[randInt(rng, 0, variants.length - 1)]);
        s.anchor.set(0.5, 1);
        s.scale.set(scale * randRange(rng, 0.8, 1.2));

        const x = randRange(rng, -CAMERA_MARGIN, ctx.width + CAMERA_MARGIN);
        s.x = Math.round(x);
        // +2px so trunks bite into the ground rather than balancing on it.
        s.y = Math.round(heightAt(x + CAMERA_MARGIN)) + 2;
        s.alpha = isNear ? 1 : 0.92;

        this.root.addChild(s);
        this.plants.push({
          sprite: s,
          phase: rng() * Math.PI * 2,
          stiffness: clamp01(s.height / 40),
          swayAmp: f.sway * (isNear ? 0.05 : 0.032),
        });
      }
    }
    // Depth order within the layer: lower on screen is nearer, so draw it last.
    this.root.children.sort((a, b) => a.y - b.y);
  }

  private hostHeight(ctx: SceneContext, host: TerrainLayerSpec): (x: number) => number {
    const idx = ctx.spec.terrain.indexOf(host);
    const seed = Math.round(ctx.rng(`terrain-${idx}`)() * 1e6);
    return TerrainSystem.heightFn(host, ctx.height, seed);
  }

  private buildProps(ctx: SceneContext, rng: Rng, tones: FoliageTones): void {
    const props = ctx.spec.props;
    const host = ctx.spec.terrain[ctx.spec.terrain.length - 1];
    if (!host) return;
    const heightAt = this.hostHeight(ctx, host);

    const grassCount = Math.round(props.grass * 60 * (ctx.width / 480));
    const rockCount = Math.round(props.rocks * 18 * (ctx.width / 480));

    const grassVariants = Array.from({ length: 5 }, () => grassTexture(rng, tones));
    const rockVariants = Array.from({ length: 5 }, () =>
      rockTexture(rng, ctx.spec.palette, 'near'),
    );
    this.textures.push(...grassVariants, ...rockVariants);

    const place = (tex: Texture[], count: number, sway: number) => {
      for (let i = 0; i < count; i++) {
        const s = new Sprite(tex[randInt(rng, 0, tex.length - 1)]);
        s.anchor.set(0.5, 1);
        const x = randRange(rng, -CAMERA_MARGIN, ctx.width + CAMERA_MARGIN);
        s.x = Math.round(x);
        s.y = Math.round(heightAt(x + CAMERA_MARGIN)) + 2;
        this.propsRoot.addChild(s);
        if (sway > 0) {
          this.plants.push({
            sprite: s,
            phase: rng() * Math.PI * 2,
            stiffness: 0.1,
            swayAmp: sway,
          });
        }
      }
    };

    place(grassVariants, grassCount, ctx.spec.foliage.sway * 0.09);
    place(rockVariants, rockCount, 0);
  }

  update(ctx: SceneContext): void {
    if (this.plants.length === 0) return;
    if (this.gust > 0.001) this.gust *= Math.pow(0.4, ctx.dt);

    const wind = ctx.wind;
    const t = ctx.time;

    for (const p of this.plants) {
      const s = p.sprite;
      // Phase by x so the wave crosses the scene instead of hitting it flat.
      const travel = t * 1.6 - s.x * 0.05;
      const idle = Math.sin(travel + p.phase) * 0.45 + Math.sin(travel * 0.37) * 0.2;

      // A gust is a bulge that passes over: strongest near its origin.
      let gustHere = 0;
      if (this.gust > 0.001) {
        const d = Math.abs(s.x / ctx.width - this.gustX);
        gustHere = this.gust * Math.max(0, 1 - d * 1.6);
      }

      const lean = (idle + gustHere * 2.2) * (1 - p.stiffness * 0.55);
      s.rotation = (wind * 0.35 + lean) * p.swayAmp;
      s.tint = ambientTint(ctx.cycle, ctx.baseCycle);
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
    this.plants = [];
  }
}
