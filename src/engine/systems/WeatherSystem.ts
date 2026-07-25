/**
 * WeatherSystem — the atmosphere between the viewer and the world.
 *
 * Particles live in screen space with zero parallax, which is deliberate: rain
 * that parallaxes with the terrain reads as decals stuck to a backdrop. Real
 * weather is *between* you and the scene, so it must not move with it.
 *
 * Every kind is one recycled pool with per-kind integration, so switching
 * weather at runtime costs nothing and the particle budget is bounded no matter
 * what a generated spec asks for.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import type { WeatherKind } from '../types';
import { MAX_PARTICLES, MAX_PARTICLES_REDUCED } from '../constants';
import { glowTexture, solidTexture } from '../draw';
import { hexToInt, mixHex, sampleRamp } from '../palette';
import { clamp01, randRange, type Rng } from '../rng';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  phase: number;
  drift: number;
}

/** Per-kind tuning. `count` scales with intensity; `speed` is px/sec. */
const PROFILE: Record<
  WeatherKind,
  {
    count: number;
    speedY: [number, number];
    speedX: [number, number];
    size: [number, number];
    streak: number;
    alpha: [number, number];
    glow: boolean;
    wander: number;
    life: [number, number];
  }
> = {
  clear:      { count: 22,  speedY: [-2, 2],   speedX: [-3, 3],   size: [1, 1], streak: 1, alpha: [0.1, 0.28], glow: false, wander: 0.5, life: [6, 14] },
  rain:       { count: 340, speedY: [190, 280], speedX: [0, 0],   size: [1, 1], streak: 5, alpha: [0.12, 0.32], glow: false, wander: 0,  life: [1, 2] },
  storm:      { count: 420, speedY: [260, 380], speedX: [0, 0],   size: [1, 1], streak: 7, alpha: [0.16, 0.42], glow: false, wander: 0,  life: [1, 2] },
  snow:       { count: 220, speedY: [12, 34],  speedX: [-4, 4],   size: [1, 2], streak: 1, alpha: [0.5, 1],    glow: false, wander: 9,   life: [8, 18] },
  fog:        { count: 14,  speedY: [-1, 1],   speedX: [-5, 5],   size: [40, 90], streak: 1, alpha: [0.05, 0.14], glow: true, wander: 1, life: [14, 30] },
  ash:        { count: 150, speedY: [8, 26],   speedX: [-6, 6],   size: [1, 2], streak: 1, alpha: [0.35, 0.8], glow: false, wander: 7,   life: [8, 16] },
  petals:     { count: 90,  speedY: [10, 26],  speedX: [-8, 8],   size: [2, 2], streak: 1, alpha: [0.6, 1],    glow: false, wander: 14,  life: [8, 16] },
  fireflies:  { count: 70,  speedY: [-6, 6],   speedX: [-6, 6],   size: [2, 3], streak: 1, alpha: [0.35, 1],   glow: true,  wander: 5,   life: [5, 12] },
  sandstorm:  { count: 260, speedY: [-6, 10],  speedX: [40, 110], size: [1, 3], streak: 3, alpha: [0.15, 0.4], glow: false, wander: 3,   life: [3, 7] },
};

export class WeatherSystem implements System {
  readonly id = 'weather';

  private root = new Container();
  private pool: Particle[] = [];
  private textures: Texture[] = [];
  private kind: WeatherKind = 'clear';
  private particleTint = 0xffffff;
  private rng: Rng = Math.random;
  private gust = 0;
  private unsubscribe: (() => void) | null = null;

  build(ctx: SceneContext): void {
    this.rng = ctx.rng('weather');
    ctx.layers.get('weather').addChild(this.root);

    const p = ctx.spec.palette;
    // Particles are palette-derived so weather belongs to its world: rain in a
    // neon city picks up the neon, snow at dawn picks up the dawn.
    this.textures = [
      solidTexture(mixHex(p.light, '#ffffff', 0.5)),
      solidTexture(mixHex(p.light, p.accent, 0.4)),
      glowTexture(6, p.accent, 2.4),
      glowTexture(40, mixHex(p.skyHorizon, p.light, 0.4), 1.6),
    ];

    const budget = ctx.reducedMotion ? MAX_PARTICLES_REDUCED : MAX_PARTICLES;
    for (let i = 0; i < budget; i++) {
      const s = new Sprite(this.textures[0]);
      s.visible = false;
      this.root.addChild(s);
      this.pool.push({ sprite: s, vx: 0, vy: 0, life: 0, maxLife: 1, phase: 0, drift: 0 });
    }

    this.unsubscribe = ctx.bus.on('gust', (e) => {
      this.gust = Math.max(this.gust, e.strength);
    });
    this.reconfigure(ctx);
  }

  /**
   * Precipitation takes its colour from what it is made of, not from the key
   * light. Cream-coloured rain reads as scratches on the lens; rain tinted
   * from the scene's own water ramp reads as water.
   */
  private tintFor(ctx: SceneContext, kind: WeatherKind): number {
    const p = ctx.spec.palette;
    switch (kind) {
      case 'rain':
      case 'storm':
        return hexToInt(mixHex(sampleRamp(p.water, 1), p.light, 0.35));
      case 'snow':
        return hexToInt(mixHex(p.light, '#ffffff', 0.6));
      case 'ash':
        return hexToInt(mixHex(sampleRamp(p.near, 0.6), '#8a8a8a', 0.4));
      case 'petals':
        return hexToInt(mixHex(p.accent, '#ffffff', 0.35));
      case 'sandstorm':
        return hexToInt(sampleRamp(p.mid, 0.85));
      case 'fog':
        return hexToInt(mixHex(p.skyHorizon, p.light, 0.5));
      default:
        return hexToInt(mixHex(p.light, '#ffffff', 0.4));
    }
  }

  /** Re-seed the pool for the current weather kind. */
  private reconfigure(ctx: SceneContext): void {
    this.kind = ctx.spec.weather.kind;
    this.particleTint = this.tintFor(ctx, this.kind);
    const prof = PROFILE[this.kind];
    const budget = ctx.reducedMotion ? MAX_PARTICLES_REDUCED : MAX_PARTICLES;
    const active = Math.min(
      budget,
      Math.round(prof.count * clamp01(ctx.spec.weather.intensity) * (ctx.width / 480)),
    );

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      p.sprite.visible = i < active;
      if (i < active) this.respawn(ctx, p, true);
    }
  }

  private respawn(ctx: SceneContext, p: Particle, initial = false): void {
    const prof = PROFILE[this.kind];
    const rng = this.rng;
    const s = p.sprite;

    const glowKind = this.kind === 'fireflies';
    s.texture = prof.glow ? (glowKind ? this.textures[2] : this.textures[3]) : this.textures[rng() < 0.25 ? 1 : 0];
    // Streaked particles rotate, so they must pivot about their middle.
    s.anchor.set(prof.glow || prof.streak > 1 ? 0.5 : 0);
    s.tint = this.particleTint;

    const w = randRange(rng, prof.size[0], prof.size[1]);
    if (prof.glow) {
      s.scale.set(w / Math.max(1, s.texture.width) * (glowKind ? 1 : 1.6));
      s.width = glowKind ? w * 3 : w;
      s.height = glowKind ? w * 3 : w * 0.5;
    } else {
      s.width = Math.max(1, Math.round(w));
      s.height = Math.max(1, Math.round(w * prof.streak));
    }

    s.alpha = randRange(rng, prof.alpha[0], prof.alpha[1]);
    s.blendMode = prof.glow || glowKind ? 'add' : 'normal';

    p.vy = randRange(rng, prof.speedY[0], prof.speedY[1]);
    p.vx = randRange(rng, prof.speedX[0], prof.speedX[1]);
    p.drift = prof.wander;
    p.phase = rng() * Math.PI * 2;
    p.maxLife = randRange(rng, prof.life[0], prof.life[1]);
    p.life = initial ? rng() * p.maxLife : 0;

    // Falling kinds enter from above; ambient kinds appear anywhere.
    const falls = p.vy > 20;
    s.x = randRange(rng, -30, ctx.width + 30);
    s.y = falls && !initial ? randRange(rng, -20, -4) : randRange(rng, -20, ctx.height);
  }

  update(ctx: SceneContext): void {
    if (ctx.spec.weather.kind !== this.kind) this.reconfigure(ctx);

    const prof = PROFILE[this.kind];
    const dt = ctx.dt;
    const gustMul = 1 + this.gust * 3;
    if (this.gust > 0.001) this.gust *= Math.pow(0.28, dt);

    // Wind is the shared channel between weather, foliage and the camera, so a
    // gust visibly moves all three at once and reads as one event.
    ctx.wind = ctx.spec.weather.wind * gustMul;
    const windPx = ctx.wind * 60;

    for (const p of this.pool) {
      const s = p.sprite;
      if (!s.visible) continue;

      p.life += dt;
      s.x += (p.vx * gustMul + windPx) * dt;
      s.y += p.vy * dt;

      if (p.drift > 0) {
        // Sine wander, not random jitter — jitter reads as noise, a sine reads
        // as something being carried by air.
        s.x += Math.sin(ctx.time * 1.3 + p.phase) * p.drift * dt;
        if (this.kind === 'fireflies') {
          s.y += Math.cos(ctx.time * 0.9 + p.phase) * p.drift * dt;
          // Fireflies pulse rather than glow steadily.
          s.alpha = clamp01(0.25 + 0.75 * Math.pow(Math.sin(ctx.time * 1.7 + p.phase) * 0.5 + 0.5, 2));
        }
      }

      // Streaked kinds lean into the wind, which is what sells rain direction.
      if (prof.streak > 1) s.rotation = Math.atan2(windPx * 0.35, p.vy) * -1;

      const out =
        p.life > p.maxLife ||
        s.y > ctx.height + 24 ||
        s.x < -60 ||
        s.x > ctx.width + 60;
      if (out) this.respawn(ctx, p);
    }
  }

  resize(ctx: SceneContext): void {
    this.reconfigure(ctx);
  }

  destroy(): void {
    this.unsubscribe?.();
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
    this.pool = [];
  }
}
