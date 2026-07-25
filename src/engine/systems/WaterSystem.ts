/**
 * WaterSystem — a reflective, displaced surface built from scanlines.
 *
 * The technique is the classic 2D one: the water is a stack of 1px-tall rows,
 * each of which is offset horizontally by a travelling sine. Because the rows
 * are sampled from a mirrored copy of the sky, the result reads as a genuine
 * reflection that ripples — not as a blue rectangle with a shimmer filter over
 * it. Rows further from the horizon get larger offsets and shorter periods,
 * which is what gives the surface perspective.
 *
 * Light sources registered by other systems (lit windows, lanterns) become
 * vertical streaks. On the neon city scene this is most of what sells the shot.
 */

import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { SceneContext, System } from '../System';
import { CAMERA_MARGIN } from '../constants';
import { verticalGradientTexture, solidTexture } from '../draw';
import { ambientTint, mixHex, sampleRamp } from '../palette';
import { clamp01, lerp, randRange } from '../rng';

interface Row {
  sprite: Sprite;
  /** 0 at the horizon, 1 at the bottom of the frame. */
  t: number;
  amp: number;
  freq: number;
  phase: number;
}

interface Streak {
  sprite: Sprite;
  baseX: number;
  phase: number;
  amp: number;
}

export class WaterSystem implements System {
  readonly id = 'water';

  private root = new Container();
  private rows: Row[] = [];
  private streaks: Streak[] = [];
  private textures: Texture[] = [];
  private frames: Texture[] = [];
  private surfaceY = 0;
  private swell = 0;
  private unsubscribe: (() => void) | null = null;

  build(ctx: SceneContext): void {
    if (!ctx.spec.water.enabled) return;
    const rng = ctx.rng('water');
    const p = ctx.spec.palette;
    const water = ctx.spec.water;

    ctx.layers.get('water').addChild(this.root);
    this.surfaceY = Math.round(water.level * ctx.height);
    const rowCount = ctx.height - this.surfaceY;
    if (rowCount <= 0) return;

    const rowW = ctx.width + CAMERA_MARGIN * 2;

    // The reflected sky, darkened and compressed. Reflections are always
    // dimmer and lower-contrast than the source; skipping that is the giveaway.
    const reflectTex = verticalGradientTexture(
      rowW,
      Math.max(2, rowCount),
      [
        { t: 0, hex: mixHex(sampleRamp(p.water, 1), p.skyHorizon, 0.55 * water.reflect) },
        { t: 0.35, hex: mixHex(sampleRamp(p.water, 0.6), p.skyMid, 0.3 * water.reflect) },
        { t: 1, hex: sampleRamp(p.water, 0) },
      ],
      12,
    );
    this.textures.push(reflectTex);

    for (let i = 0; i < rowCount; i++) {
      const t = i / Math.max(1, rowCount - 1);
      // Each row shows only its own 1px slice of the reflection gradient, so
      // the rows can be displaced independently while still forming one image.
      const rowTex = new Texture({
        source: reflectTex.source,
        frame: new Rectangle(0, i, rowW, 1),
      });
      // Tracked separately: these share the gradient's source, so destroying
      // them must not take the source with them.
      this.frames.push(rowTex);
      const s = new Sprite(rowTex);
      s.x = -CAMERA_MARGIN;
      s.y = this.surfaceY + i;
      this.root.addChild(s);
      this.rows.push({
        sprite: s,
        t,
        // Displacement grows with distance from the horizon.
        amp: lerp(0.4, 4.5, t) * (0.4 + water.choppiness),
        freq: lerp(2.6, 0.9, t),
        phase: rng() * Math.PI * 2,
      });
    }

    // Specular streaks under registered light sources.
    const streakTex = solidTexture('#ffffff');
    this.textures.push(streakTex);
    for (const r of ctx.reflections.slice(0, 60)) {
      const s = new Sprite(streakTex);
      s.tint = r.color;
      s.alpha = clamp01(r.strength) * water.reflect * 0.7;
      s.width = r.width;
      s.height = randRange(rng, rowCount * 0.25, rowCount * 0.8);
      s.x = r.x;
      s.y = this.surfaceY;
      s.blendMode = 'add';
      this.root.addChild(s);
      this.streaks.push({
        sprite: s,
        baseX: r.x,
        phase: rng() * Math.PI * 2,
        amp: lerp(0.5, 2.2, water.choppiness),
      });
    }

    this.unsubscribe = ctx.bus.on('wave_crash', (e) => {
      this.swell = Math.max(this.swell, e.strength);
    });
  }

  update(ctx: SceneContext): void {
    if (this.rows.length === 0) return;
    const t = ctx.time;
    const surge = 1 + this.swell * 1.8;
    if (this.swell > 0.001) this.swell *= Math.pow(0.35, ctx.dt);

    const tint = ambientTint(ctx.cycle, ctx.baseCycle);

    for (const row of this.rows) {
      // Two waves at different speeds, so the surface never repeats visibly.
      const a =
        Math.sin(t * row.freq + row.phase) * row.amp +
        Math.sin(t * row.freq * 0.43 + row.phase * 1.7) * row.amp * 0.45;
      row.sprite.x = -CAMERA_MARGIN + Math.round(a * surge);
      row.sprite.tint = tint;
    }

    for (const st of this.streaks) {
      // A reflection wanders more than the water it sits on.
      st.sprite.x = Math.round(
        st.baseX + Math.sin(t * 1.4 + st.phase) * st.amp * surge,
      );
      st.sprite.alpha = clamp01(
        st.sprite.alpha * 0.98 + (0.35 + 0.25 * Math.sin(t * 2.1 + st.phase)) * 0.02,
      );
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    for (const t of this.frames) t.destroy(false);
    this.frames = [];
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
    this.rows = [];
    this.streaks = [];
  }
}
