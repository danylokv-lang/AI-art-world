/**
 * ParallaxCamera — the only thing allowed to move the layer planes.
 *
 * This replaces the old mouse-warped shader outright. There, one flat image was
 * smeared by a per-pixel offset derived from luminance, so bright foreground
 * moved like distant sky and the illusion collapsed. Here the depth is real:
 * each plane exists separately and shifts by its own declared factor, which is
 * simply how parallax has always worked in 2D.
 *
 * Motion is drift-first and pointer-second. The scene must look alive with the
 * mouse untouched — on a projector at a demo, nobody is holding the mouse.
 */

import type { SceneContext, System } from '../System';
import { CAMERA_MARGIN } from '../constants';
import { clamp, fbm1, lerp } from '../rng';

export class ParallaxCamera implements System {
  readonly id = 'camera';

  private x = 0;
  private y = 0;
  private seed = 0;
  private gust = 0;
  private unsubscribe: (() => void) | null = null;

  build(ctx: SceneContext): void {
    this.seed = Math.round(ctx.rng('camera')() * 1e6);
    // A gust shoves the camera slightly downwind — it ties the weather system
    // to the framing so a gust reads as one event, not two coincidences.
    this.unsubscribe = ctx.bus.on('gust', (e) => {
      this.gust = Math.max(this.gust, e.strength);
    });
  }

  update(ctx: SceneContext): void {
    const cam = ctx.spec.camera;
    if (ctx.reducedMotion || cam.drift === 'still') {
      this.settleTo(ctx, 0, 0);
      return;
    }

    const amp = cam.amplitude * CAMERA_MARGIN * 0.7;
    let tx = 0;
    let ty = 0;

    if (cam.drift === 'slow_pan') {
      // Two incommensurate frequencies, so the path never visibly loops.
      tx = (fbm1(ctx.time * 0.035, this.seed, 3) - 0.5) * 2 * amp;
      ty = (fbm1(ctx.time * 0.021 + 50, this.seed + 7, 3) - 0.5) * 2 * amp * 0.4;
    } else {
      // 'breathe' — a slow swell in and out, with a gentle lateral wander.
      const breath = Math.sin(ctx.time * 0.16);
      ty = breath * amp * 0.35;
      tx = (fbm1(ctx.time * 0.028, this.seed, 3) - 0.5) * 2 * amp * 0.8;
    }

    if (this.gust > 0.001) {
      tx += ctx.wind * this.gust * amp * 0.5;
      this.gust *= Math.pow(0.25, ctx.dt);
    }

    // Pointer nudge is deliberately small. Large pointer parallax is the tell
    // of a scene compensating for having no motion of its own.
    const infl = cam.pointerInfluence * CAMERA_MARGIN * 0.5;
    tx += (ctx.pointer.x - 0.5) * 2 * infl;
    ty += (ctx.pointer.y - 0.5) * 2 * infl * 0.45;

    this.settleTo(ctx, tx, ty);
  }

  private settleTo(ctx: SceneContext, tx: number, ty: number): void {
    const ease = 1 - Math.pow(0.0015, ctx.dt);
    this.x = lerp(this.x, tx, ease);
    this.y = lerp(this.y, ty, ease);
    const lim = CAMERA_MARGIN - 2;
    ctx.layers.applyCamera(clamp(this.x, -lim, lim), clamp(this.y, -lim * 0.6, lim * 0.6));
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
