/**
 * StructureSystem — the built world: huts, towers, ruins, shrines, windmills,
 * and the lighthouse.
 *
 * City skylines are *not* here; those belong to TerrainSystem, because the
 * 'skyline' terrain profile is the only thing that knows where its buildings
 * are and therefore where the windows go. This system handles standalone
 * structures that stand on a terrain surface.
 *
 * Two things here move, and both are load-bearing for their scene: the
 * lighthouse beam sweeps, and windmill blades turn with the wind.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import type { StructureKind, TerrainLayerSpec } from '../types';
import { CAMERA_MARGIN } from '../constants';
import { TerrainSystem } from './TerrainSystem';
import { beamTexture, glowTexture } from '../draw';
import {
  hutTexture,
  lighthouseTexture,
  ruinTexture,
  shrineTexture,
  towerTexture,
  windmillTexture,
} from '../assets/sprites';
import { ambientTint, hexToInt, mixHex } from '../palette';
import { clamp01, randInt, randRange, type Rng } from '../rng';

export class StructureSystem implements System {
  readonly id = 'structures';

  private root = new Container();
  private textures: Texture[] = [];
  private blades: Sprite[] = [];
  private beam: Sprite | null = null;
  private lamp: Sprite | null = null;
  private statics: Sprite[] = [];

  build(ctx: SceneContext): void {
    const kind = ctx.spec.structures.kind;
    if (kind === 'none' || kind === 'city') return;

    const rng = ctx.rng('structures');
    ctx.layers.get('structures').addChild(this.root);

    const host = ctx.spec.terrain[ctx.spec.terrain.length - 1];
    if (!host) return;
    const heightAt = this.hostHeight(ctx, host);

    const count = this.countFor(kind, ctx.spec.structures.density, ctx.width);
    for (let i = 0; i < count; i++) {
      this.placeOne(ctx, kind, rng, heightAt, i, count);
    }

    this.root.children.sort((a, b) => a.y - b.y);
  }

  private hostHeight(ctx: SceneContext, host: TerrainLayerSpec): (x: number) => number {
    const idx = ctx.spec.terrain.indexOf(host);
    return TerrainSystem.heightFn(host, ctx.height, TerrainSystem.seedFor(ctx, idx));
  }

  private countFor(kind: StructureKind, density: number, width: number): number {
    const scale = width / 480;
    switch (kind) {
      case 'lighthouse':
        return 1; // more than one lighthouse is a different, sillier scene
      case 'shrine':
        return Math.max(1, Math.round(density * 3 * scale));
      case 'huts':
        return Math.round(density * 10 * scale);
      case 'ruins':
        return Math.round(density * 8 * scale);
      case 'windmills':
        return Math.max(1, Math.round(density * 4 * scale));
      case 'towers':
      default:
        return Math.round(density * 6 * scale);
    }
  }

  private placeOne(
    ctx: SceneContext,
    kind: StructureKind,
    rng: Rng,
    heightAt: (x: number) => number,
    index: number,
    total: number,
  ): void {
    const p = ctx.spec.palette;
    const lit = rng() < ctx.spec.structures.litWindows;

    // Spread across the frame with jitter rather than pure random, so a low
    // count never clumps into one corner and leaves the rest empty.
    const slot = (index + 0.5) / total;
    const x = Math.round(
      (slot + randRange(rng, -0.35, 0.35) / total) * ctx.width,
    );
    const groundY = Math.round(heightAt(x + CAMERA_MARGIN)) + 2;

    if (kind === 'lighthouse') {
      const { texture, lampX, lampY } = lighthouseTexture(p);
      this.textures.push(texture);
      const s = new Sprite(texture);
      s.anchor.set(0.5, 1);
      // Lighthouses sit on high ground; find the tallest point nearby.
      let bestX = x;
      let bestY = groundY;
      for (let dx = -60; dx <= 60; dx += 4) {
        const y = heightAt(x + dx + CAMERA_MARGIN);
        if (y < bestY) {
          bestY = y;
          bestX = x + dx;
        }
      }
      s.x = bestX;
      s.y = Math.round(bestY) + 2;
      this.root.addChild(s);
      this.statics.push(s);

      const lampWorldX = s.x - texture.width / 2 + lampX;
      const lampWorldY = s.y - texture.height + lampY;

      const beamTex = beamTexture(150, 16, mixHex(p.accent, '#ffffff', 0.45));
      this.textures.push(beamTex);
      this.beam = new Sprite(beamTex);
      // Pivot at the lamp end of the cone, not its centre.
      this.beam.anchor.set(0, 0.5);
      this.beam.position.set(lampWorldX, lampWorldY);
      this.beam.blendMode = 'add';
      this.beam.alpha = 0.5;
      this.root.addChild(this.beam);

      const lampTex = glowTexture(14, mixHex(p.accent, '#ffffff', 0.6), 2.2);
      this.textures.push(lampTex);
      this.lamp = new Sprite(lampTex);
      this.lamp.anchor.set(0.5);
      this.lamp.position.set(lampWorldX, lampWorldY);
      this.lamp.blendMode = 'add';
      this.root.addChild(this.lamp);

      if (ctx.spec.water.enabled) {
        ctx.reflections.push({
          x: lampWorldX,
          color: hexToInt(mixHex(p.accent, '#ffffff', 0.4)),
          strength: 0.9,
          width: 3,
        });
      }
      return;
    }

    if (kind === 'windmills') {
      const { body, blades } = windmillTexture(rng, p);
      this.textures.push(body, blades);
      const s = new Sprite(body);
      s.anchor.set(0.5, 1);
      s.x = x;
      s.y = groundY;
      this.root.addChild(s);
      this.statics.push(s);

      const b = new Sprite(blades);
      b.anchor.set(0.5);
      b.position.set(x, s.y - body.height + 3);
      this.root.addChild(b);
      this.blades.push(b);
      return;
    }

    let tex: Texture;
    switch (kind) {
      case 'huts':
        tex = hutTexture(rng, p, lit);
        break;
      case 'ruins':
        tex = ruinTexture(rng, p);
        break;
      case 'shrine':
        tex = shrineTexture(rng, p);
        break;
      case 'towers':
      default:
        tex = towerTexture(rng, p, lit);
        break;
    }
    this.textures.push(tex);
    const s = new Sprite(tex);
    s.anchor.set(0.5, 1);
    s.x = x;
    s.y = groundY;
    this.root.addChild(s);
    this.statics.push(s);

    if (lit && ctx.spec.water.enabled) {
      ctx.reflections.push({
        x,
        color: hexToInt(mixHex(p.light, '#ffcf8a', 0.5)),
        strength: 0.45,
        width: 2,
      });
    }
  }

  update(ctx: SceneContext): void {
    const tint = ambientTint(ctx.cycle, ctx.baseCycle);
    for (const s of this.statics) s.tint = tint;

    // Blades turn with the wind, and stall when the air is still.
    if (this.blades.length > 0) {
      const speed = 0.35 + Math.abs(ctx.wind) * 1.4;
      for (const b of this.blades) b.rotation += speed * ctx.dt * Math.sign(ctx.wind || 1);
    }

    if (this.beam && this.lamp) {
      // One slow revolution roughly every 12 seconds.
      const angle = ctx.time * 0.52;
      this.beam.rotation = angle;
      // Brightest when the beam points across the frame, dimmest end-on —
      // which is exactly when a real one sweeps past you.
      const facing = Math.abs(Math.cos(angle));
      this.beam.alpha = 0.18 + facing * 0.55;
      this.lamp.alpha = 0.55 + facing * 0.45;
      this.lamp.scale.set(0.9 + facing * 0.35);
    }
  }

  destroy(): void {
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
    this.blades = [];
    this.statics = [];
    this.beam = null;
    this.lamp = null;
  }
}
