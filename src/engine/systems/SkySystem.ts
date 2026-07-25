/**
 * SkySystem — the backdrop, the stars, and the thing that moves through them.
 *
 * The sun/moon is driven by the day cycle rather than by a fixed spec position,
 * so dragging the time scrubber physically walks the light across the sky and
 * repaints the gradient under it. That is the demo moment that proves the scene
 * is composed rather than painted: you cannot scrub the time of day on a JPEG.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import type { Palette } from '../types';
import { discTexture, glowTexture, verticalGradientTexture, type GradientStop } from '../draw';
import { gradeAtCycle, mixHex, relativeAmbient, relight } from '../palette';
import { clamp01, lerp, randRange } from '../rng';

/** Rebuilding the gradient is ~130k pixel writes; only redo it when it matters. */
const CYCLE_REBUILD_EPSILON = 0.012;

interface Star {
  sprite: Sprite;
  phase: number;
  speed: number;
  base: number;
}

export class SkySystem implements System {
  readonly id = 'sky';

  private gradient: Sprite | null = null;
  private gradientTex: Texture | null = null;
  private lastCycle = -1;
  private lastWidth = -1;

  private starsRoot = new Container();
  private stars: Star[] = [];

  private celestial = new Container();
  private disc: Sprite | null = null;
  private halo: Sprite | null = null;
  private discTex: Texture | null = null;
  private haloTex: Texture | null = null;
  private horizonFraction = 0.84;

  build(ctx: SceneContext): void {
    // Furthest terrain baseline = where sky visually ends. Fall back to low in
    // the frame for open scenes with no terrain at all.
    this.horizonFraction = ctx.spec.terrain.length
      ? Math.min(...ctx.spec.terrain.map((t) => t.baseline))
      : 0.84;

    this.gradient = new Sprite(Texture.WHITE);
    ctx.layers.get('sky').addChild(this.gradient);
    this.rebuildGradient(ctx);

    ctx.layers.get('stars').addChild(this.starsRoot);
    this.buildStars(ctx);

    ctx.layers.get('celestial').addChild(this.celestial);
    this.buildCelestial(ctx);
  }

  /* -------------------------------------------------------------- gradient */

  private skyStops(p: Palette, cycle: number, baseCycle: number): GradientStop[] {
    const grade = gradeAtCycle(cycle);
    // Relative, not absolute: at the authored time this returns 1 and the
    // palette renders exactly as written.
    const a = relativeAmbient(cycle, baseCycle);

    // Away from the authored time, pull each band toward its own shadow rather
    // than toward black — a scene that fades to grey looks broken, a scene that
    // fades into its own darker tones looks like nightfall.
    let top = relight(p.skyTop, a, 0.75);
    let mid = relight(p.skyMid, a, 0.7);
    let horizon = relight(p.skyHorizon, a, 0.6);

    // Golden hours push warmth into the horizon band only, the way real
    // scattering does — warming the whole sky evenly reads as a colour filter.
    const golden = Math.max(0, grade.warmth);
    if (golden > 0.2) {
      horizon = mixHex(horizon, '#ffb072', (golden - 0.2) * 0.55);
      mid = mixHex(mid, horizon, (golden - 0.2) * 0.22);
    }
    if (grade.warmth < -0.15) {
      const cold = Math.min(1, -grade.warmth);
      top = mixHex(top, '#0b1024', cold * 0.5);
      mid = mixHex(mid, '#141a33', cold * 0.35);
    }

    return [
      { t: 0, hex: top },
      { t: 0.46, hex: mid },
      { t: 0.82, hex: horizon },
      { t: 1, hex: mixHex(horizon, p.light, 0.18) },
    ];
  }

  private rebuildGradient(ctx: SceneContext): void {
    if (!this.gradient) return;
    this.gradientTex?.destroy(true);
    this.gradientTex = verticalGradientTexture(
      ctx.width,
      ctx.height,
      this.skyStops(ctx.spec.palette, ctx.cycle, ctx.baseCycle),
      16,
    );
    this.gradient.texture = this.gradientTex;
    this.gradient.width = ctx.width;
    this.gradient.height = ctx.height;
    this.lastCycle = ctx.cycle;
    this.lastWidth = ctx.width;
  }

  /* ----------------------------------------------------------------- stars */

  private buildStars(ctx: SceneContext): void {
    const rng = ctx.rng('stars');
    const count = Math.round(ctx.spec.sky.stars * 150);
    const tex = Texture.WHITE;
    for (let i = 0; i < count; i++) {
      const s = new Sprite(tex);
      s.width = 1;
      s.height = 1;
      s.x = Math.round(rng() * ctx.width);
      // Cluster toward the top; stars sitting on the horizon look like dust.
      s.y = Math.round(Math.pow(rng(), 1.7) * ctx.height * 0.72);
      s.tint = 0xffffff;
      this.starsRoot.addChild(s);
      this.stars.push({
        sprite: s,
        phase: rng() * Math.PI * 2,
        speed: randRange(rng, 0.4, 1.9),
        base: randRange(rng, 0.35, 1),
      });
    }
  }

  /* ------------------------------------------------------------- celestial */

  private buildCelestial(ctx: SceneContext): void {
    if (ctx.spec.sky.celestial === 'none') return;
    const p = ctx.spec.palette;
    const isMoon = ctx.spec.sky.celestial === 'moon';
    const radius = isMoon ? 5 : 7;

    this.haloTex = glowTexture(isMoon ? 26 : 42, p.light, isMoon ? 2.6 : 2.0);
    this.halo = new Sprite(this.haloTex);
    this.halo.anchor.set(0.5);
    this.halo.alpha = 0.5;
    this.celestial.addChild(this.halo);

    this.discTex = discTexture(radius, isMoon ? mixHex(p.light, '#ffffff', 0.4) : p.light);
    this.disc = new Sprite(this.discTex);
    this.disc.anchor.set(0.5);
    this.celestial.addChild(this.disc);
  }

  /**
   * Position along the arc.
   *
   * Altitude is a sine over the cycle, so the body sits *on* the horizon at
   * dawn and dusk rather than blinking out there — a setting sun that
   * disappears at the exact moment it should be biggest is the one frame
   * everybody looks at. It sinks below the horizon before fading, which is what
   * gives the scrub its "and then night falls" beat.
   */
  private celestialPos(ctx: SceneContext): { x: number; y: number; up: number } {
    const isMoon = ctx.spec.sky.celestial === 'moon';
    // Sun owns the first half of the cycle (dawn→dusk), moon the second.
    const own = isMoon ? (ctx.cycle - 0.5 + 1) % 1 : ctx.cycle;
    const traverse = clamp01(own / 0.5);
    const altitude = Math.sin(own * 2 * Math.PI);

    const bias = (ctx.spec.sky.celestialX - 0.5) * 0.12;
    const arc = lerp(0.45, 1, ctx.spec.sky.celestialY);
    // The visual horizon is the furthest ridge line, not the bottom of the
    // frame. Arcing to the frame edge buries the setting sun behind the
    // terrain — losing the one moment of the scrub everybody watches for.
    const horizonY = ctx.height * (this.horizonFraction - 0.02);
    const x = (lerp(0.06, 0.94, traverse) + bias) * ctx.width;
    const y = horizonY - altitude * horizonY * 0.86 * arc;

    // Fade over the last sliver of altitude rather than at the horizon line.
    const up = clamp01((altitude + 0.12) / 0.14);
    return { x, y, up };
  }

  /* ---------------------------------------------------------------- update */

  update(ctx: SceneContext): void {
    if (Math.abs(ctx.cycle - this.lastCycle) > CYCLE_REBUILD_EPSILON) {
      this.rebuildGradient(ctx);
    }

    const ambient = gradeAtCycle(ctx.cycle).ambient;
    // Stars fade in only once the sky is genuinely dark.
    const starVis = clamp01((0.72 - ambient) / 0.42) * clamp01(ctx.spec.sky.stars * 1.4);
    this.starsRoot.visible = starVis > 0.02;
    if (this.starsRoot.visible) {
      for (const st of this.stars) {
        const twinkle = 0.62 + 0.38 * Math.sin(ctx.time * st.speed + st.phase);
        st.sprite.alpha = st.base * twinkle * starVis;
      }
    }

    if (this.disc && this.halo) {
      const { x, y, up } = this.celestialPos(ctx);
      this.disc.position.set(Math.round(x), Math.round(y));
      this.halo.position.set(Math.round(x), Math.round(y));
      this.disc.alpha = up;
      this.celestial.visible = up > 0.01;
      // The halo swells near the horizon, where a real one scatters most.
      const low = clamp01(1 - (ctx.height * 0.84 - y) / (ctx.height * 0.6));
      this.halo.alpha = up * lerp(0.35, 0.85, low);
      this.halo.scale.set(lerp(1, 1.5, low));
    }
  }

  resize(ctx: SceneContext): void {
    if (ctx.width === this.lastWidth) return;
    this.rebuildGradient(ctx);
    for (const st of this.stars) {
      if (st.sprite.x > ctx.width) st.sprite.x = Math.round(Math.random() * ctx.width);
    }
  }

  destroy(): void {
    this.gradientTex?.destroy(true);
    this.discTex?.destroy(true);
    this.haloTex?.destroy(true);
    this.stars = [];
  }
}
