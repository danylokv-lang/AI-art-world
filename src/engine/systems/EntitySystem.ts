/**
 * EntitySystem — the things in the world that have somewhere to be.
 *
 * This is what separates "an animated backdrop" from "a place". Weather and
 * parallax make a scene move; a bird that crosses the frame on its own path,
 * flaps at its own rate and leaves gives it *inhabitants*. Each entity runs a
 * small state machine, so behaviour emerges from rules rather than from a
 * looping animation everyone can spot after ten seconds.
 */

import { AnimatedSprite, Container, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import type { EntitySpec } from '../types';
import {
  balloonTexture,
  birdFrames,
  boatTexture,
  critterFrames,
  fishTexture,
  lanternTexture,
  walkerFrames,
} from '../assets/sprites';
import { ambientTint, mixHex, sampleRamp } from '../palette';
import { clamp01, fbm1, lerp, randInt, randRange, type Rng } from '../rng';

interface Entity {
  view: Sprite | AnimatedSprite;
  spec: EntitySpec;
  vx: number;
  vy: number;
  phase: number;
  baseY: number;
  /** Wander target, for path === 'wander'. */
  tx: number;
  ty: number;
  seed: number;
  /** Set when a flock event is scattering this entity. */
  startle: number;
}

export class EntitySystem implements System {
  readonly id = 'entities';

  private entities: Entity[] = [];
  private textures: Texture[] = [];
  private roots: Container[] = [];
  private unsubscribe: Array<() => void> = [];

  build(ctx: SceneContext): void {
    const rng = ctx.rng('entities');
    const p = ctx.spec.palette;

    // Shared frame sets, built once and reused across instances.
    const birds = birdFrames(mixHex(sampleRamp(p.near, 0.1), p.skyHorizon, 0.25));
    const walkers = walkerFrames(p);
    const critters = critterFrames(p);
    const fish = fishTexture(p);
    const lantern = lanternTexture(p);
    this.textures.push(...birds, ...walkers, ...critters, fish, lantern);

    const near = new Container();
    const far = new Container();
    ctx.layers.get('entitiesNear').addChild(near);
    ctx.layers.get('entitiesFar').addChild(far);
    this.roots.push(near, far);

    for (const spec of ctx.spec.entities) {
      const parent = spec.depth > 0.6 ? near : far;
      const count = Math.min(24, Math.max(0, Math.round(spec.count)));
      for (let i = 0; i < count; i++) {
        const e = this.spawn(ctx, spec, rng, { birds, walkers, critters, fish, lantern });
        parent.addChild(e.view);
        this.entities.push(e);
      }
    }

    // A takeoff scatters every bird at once — the single most alive-looking
    // thing in the whole engine, because it is a reaction rather than a loop.
    this.unsubscribe.push(
      ctx.bus.on('flock_takeoff', () => {
        for (const e of this.entities) {
          if (e.spec.kind === 'bird' || e.spec.kind === 'flock') e.startle = 1;
        }
      }),
    );
  }

  private spawn(
    ctx: SceneContext,
    spec: EntitySpec,
    rng: Rng,
    art: {
      birds: Texture[];
      walkers: Texture[];
      critters: Texture[];
      fish: Texture;
      lantern: Texture;
    },
  ): Entity {
    let view: Sprite | AnimatedSprite;
    const waterY = ctx.spec.water.level * ctx.height;

    switch (spec.kind) {
      case 'bird':
      case 'flock': {
        const a = new AnimatedSprite(art.birds);
        a.animationSpeed = randRange(rng, 0.12, 0.22);
        a.play();
        view = a;
        break;
      }
      case 'walker': {
        const a = new AnimatedSprite(art.walkers);
        a.animationSpeed = 0.1;
        a.play();
        view = a;
        break;
      }
      case 'critter': {
        const a = new AnimatedSprite(art.critters);
        a.animationSpeed = 0.16;
        a.play();
        view = a;
        break;
      }
      case 'fish':
        view = new Sprite(art.fish);
        break;
      case 'lantern':
        view = new Sprite(art.lantern);
        break;
      case 'boat': {
        const tex = boatTexture(rng, ctx.spec.palette);
        this.textures.push(tex);
        view = new Sprite(tex);
        break;
      }
      case 'balloon':
      default: {
        const tex = balloonTexture(rng, ctx.spec.palette);
        this.textures.push(tex);
        view = new Sprite(tex);
        break;
      }
    }

    view.anchor.set(0.5, 1);
    const dir = rng() < 0.5 ? -1 : 1;
    view.scale.x = dir;

    // Vertical band by kind: each type belongs somewhere specific, and putting
    // a boat in the sky is the fastest way to break the illusion.
    let baseY: number;
    switch (spec.kind) {
      case 'bird':
      case 'flock':
        baseY = randRange(rng, 0.1, 0.42) * ctx.height;
        break;
      case 'balloon':
        baseY = randRange(rng, 0.12, 0.35) * ctx.height;
        break;
      case 'boat':
        baseY = waterY + randRange(rng, 1, 8);
        break;
      case 'fish':
        baseY = waterY + randRange(rng, 6, 26);
        break;
      case 'lantern':
        baseY = randRange(rng, 0.45, 0.78) * ctx.height;
        break;
      default:
        baseY = randRange(rng, 0.86, 0.99) * ctx.height;
    }

    view.x = randRange(rng, -20, ctx.width + 20);
    view.y = baseY;
    if (spec.kind === 'lantern' || spec.kind === 'fish') view.blendMode = 'normal';

    return {
      view,
      spec,
      vx: dir * spec.speed * randRange(rng, 0.75, 1.3),
      vy: 0,
      phase: rng() * Math.PI * 2,
      baseY,
      tx: randRange(rng, 0, ctx.width),
      ty: baseY,
      seed: randInt(rng, 1, 1e6),
      startle: 0,
    };
  }

  update(ctx: SceneContext): void {
    const dt = ctx.dt;
    const tint = ambientTint(ctx.cycle, ctx.baseCycle);

    for (const e of this.entities) {
      const v = e.view;
      const kind = e.spec.kind;

      // Lanterns and fish are their own light sources; they must not be dimmed
      // by the day cycle or they stop reading as lights.
      const emissive = kind === 'lantern';
      if (!emissive) v.tint = tint;

      if (e.startle > 0.01) {
        // Startled birds climb hard and fast, then settle back.
        e.vy = lerp(e.vy, -34 * e.startle, 1 - Math.pow(0.02, dt));
        e.startle *= Math.pow(0.22, dt);
      } else {
        e.vy = lerp(e.vy, 0, 1 - Math.pow(0.3, dt));
      }

      switch (e.spec.path) {
        case 'linear':
          v.x += e.vx * dt;
          break;

        case 'arc':
          v.x += e.vx * dt;
          // Gliding rise and fall, not a sine loop — fbm keeps it irregular.
          v.y = e.baseY + (fbm1(ctx.time * 0.25 + e.phase, e.seed, 3) - 0.5) * 22 + e.vy;
          break;

        case 'bob': {
          v.x += e.vx * dt * 0.5;
          const swell = Math.sin(ctx.time * 0.9 + e.phase);
          v.y = e.baseY + swell * (kind === 'boat' ? 1.6 : 2.4);
          // A boat rocks with the swell it is sitting on.
          if (kind === 'boat') v.rotation = swell * 0.045;
          break;
        }

        case 'wander':
        default: {
          // Pick a new destination on arrival; that pause-and-go rhythm is what
          // makes a critter look like it is deciding rather than patrolling.
          const dx = e.tx - v.x;
          const dy = e.ty - v.y;
          if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
            e.tx = randRange(Math.random, 0, ctx.width);
            e.ty = e.baseY + randRange(Math.random, -10, 10);
          }
          const sp = e.spec.speed;
          v.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
          v.y += Math.sign(dy) * Math.min(Math.abs(dy), sp * 0.4 * dt) + e.vy * dt;
          if (Math.abs(dx) > 1) v.scale.x = Math.sign(dx);
          break;
        }
      }

      if (emissive) {
        // Slow, uneven flicker — a flame, not a pulse.
        v.alpha = 0.75 + 0.25 * fbm1(ctx.time * 1.6 + e.phase, e.seed, 2);
        v.y = e.baseY + Math.sin(ctx.time * 0.6 + e.phase) * 2;
      }

      // Wrap around with a generous margin so nothing pops in mid-frame.
      const margin = 40;
      if (v.x > ctx.width + margin) v.x = -margin;
      else if (v.x < -margin) v.x = ctx.width + margin;

      v.x = Math.round(v.x * 4) / 4;
      v.y = Math.round(v.y);
    }
  }

  resize(ctx: SceneContext): void {
    for (const e of this.entities) {
      if (e.view.x > ctx.width + 40) e.view.x = ctx.width;
      e.tx = Math.min(e.tx, ctx.width);
    }
  }

  destroy(): void {
    this.unsubscribe.forEach((fn) => fn());
    this.unsubscribe = [];
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
    this.entities = [];
    this.roots = [];
  }
}
